// ---------------------------------------------------------------------------
// WORKER DA FILA DE ALERTAS — pega o que dispatchAlerts enfileirou e manda.
//
// A fila (`alert_queue.jsonl`) e append-only: dispatchAlerts escreve, o worker
// le. Como o arquivo nunca e reescrito no meio do caminho, uma queda no meio
// do processamento nao corrompe nada — o worker recomeca do checkpoint.
//
// IDEMPOTENCIA: o checkpoint guarda quantas linhas ja foram processadas. Rodar
// o worker duas vezes seguidas NAO reenvia o que ja saiu. Isso importa porque
// o cron pode disparar em paralelo com uma execucao manual, e e-mail repetido
// e a forma mais rapida de perder um assinante.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, openSync, closeSync, writeSync, unlinkSync, existsSync, statSync, mkdirSync, rmdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { resolveDataDir, ensureDir } from "../store/dataDir.js";
import { enviarEmail, provedorConfigurado } from "./sender.js";
import { buildPriceAlertEmail } from "./emailTemplates.js";
import { listSubscribers, hashEmail } from "./subscriberStore.js";
import { queuedOfferEligibility } from "./alertEligibility.js";
import { getConfig } from "../config.js";

function arquivoFila() {
  return path.join(resolveDataDir(), "alert_queue.jsonl");
}
function arquivoCheckpoint() {
  return path.join(resolveDataDir(), "alert_queue.checkpoint");
}
function arquivoEstados() {
  return path.join(resolveDataDir(), "alert_queue.states.json");
}
function arquivoLock() {
  return path.join(resolveDataDir(), "alert_queue.lock");
}

function lerEstados() {
  try {
    const data = JSON.parse(readFileSync(arquivoEstados(), "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function gravarEstados(estados) {
  ensureDir(resolveDataDir());
  writeFileSync(arquivoEstados(), JSON.stringify(estados), "utf-8");
}

// Dois workers ao mesmo tempo não podem mandar a mesma linha. O lock é
// exclusivo (wx), com mutações serializadas pelo gate. Só recupera locks
// antigos quando o dono já morreu.
function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  if (existsSync(`/proc/${pid}`)) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (erro) {
    return erro.code !== "ESRCH"; // EPERM também indica um processo vivo.
  }
}

// Synchronous cross-process handshake, inert outside explicitly configured tests.
function barreiraTesteLock() {
  const base = process.env.AONDE_TEST_LOCK_BARRIER;
  if (!base) return;
  writeFileSync(`${base}.ready`, "");
  const deadline = Date.now() + 15000;
  while (!existsSync(`${base}.go`)) {
    if (Date.now() > deadline) throw new Error("Lock test barrier timed out");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
}

// Never reclaim the gate automatically: a paused owner may still mutate the lock.
// If a crash leaves it behind, stop ALL workers before manually removing the
// empty <dataDir>/alert_queue.lock.gate directory, then restart workers.
function comGateLock(operacao) {
  const gate = `${arquivoLock()}.gate`;
  try {
    ensureDir(resolveDataDir());
    // Fault injection is inert unless explicitly enabled by a test.
    if (process.env.AONDE_TEST_LOCK_MKDIR_ERROR) {
      throw Object.assign(new Error("Injected gate failure"), { code: process.env.AONDE_TEST_LOCK_MKDIR_ERROR });
    }
    mkdirSync(gate);
  } catch (erro) {
    if (erro.code === "EEXIST") return { contendido: true };
    return { erro };
  }
  let resultado;
  try {
    resultado = operacao();
  } catch (erro) {
    resultado = { erro };
  } finally {
    try {
      rmdirSync(gate);
    } catch (erro) {
      resultado = { erro };
    }
  }
  return resultado;
}

function lerDonoLock() {
  const raw = readFileSync(arquivoLock(), "utf-8");
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object") return value;
  } catch {
    // Legacy locks contain just a PID (or an empty/corrupt value).
  }
  return { pid: Number(raw) };
}

function adquirirLock() {
  barreiraTesteLock();
  return comGateLock(() => {
    const lock = arquivoLock();
    let recuperado = false;
    try {
      if (existsSync(lock)) {
        const idade = Date.now() - statSync(lock).mtimeMs;
        if (pidAlive(lerDonoLock().pid) || idade < 120000) return null;
        unlinkSync(lock);
        recuperado = true;
      }
      const dono = { pid: process.pid, token: randomUUID(), acquiredAt: new Date().toISOString() };
      const fd = openSync(lock, "wx");
      try {
        writeSync(fd, JSON.stringify(dono));
      } finally {
        closeSync(fd);
      }
      if (recuperado) {
        // Legacy claim states have no owner identity. Clear only after confirmed
        // abandonment, with the gate held and the replacement lock published.
        const estados = lerEstados();
        for (const chave of Object.keys(estados)) {
          if (estados[chave] === "reivindicado") delete estados[chave];
        }
        gravarEstados(estados);
      }
      return dono;
    } catch (erro) {
      return { erro };
    }
  });
}

const LOCK_RELEASE_TIMEOUT_MS = 2000;
const LOCK_RELEASE_BACKOFF_MS = 10;
const lockWait = new Int32Array(new SharedArrayBuffer(4));

function liberarLock(dono) {
  const testTimeout = Number(process.env.AONDE_TEST_LOCK_RELEASE_TIMEOUT_MS);
  const timeout = Number.isFinite(testTimeout) && testTimeout > 0
    ? Math.min(testTimeout, LOCK_RELEASE_TIMEOUT_MS) : LOCK_RELEASE_TIMEOUT_MS;
  const deadline = performance.now() + timeout;
  let sinalizado = false;
  for (;;) {
    const resultado = comGateLock(() => {
      try {
        // Ownership must be read again only after acquiring the gate.
        if (lerDonoLock().token === dono.token) unlinkSync(arquivoLock());
        return { liberado: true };
      } catch (erro) {
        if (erro.code === "ENOENT") return { liberado: true };
        return { erro };
      }
    });
    if (resultado.liberado) return true;
    if (resultado.contendido && !sinalizado) {
      sinalizado = true;
      const base = process.env.AONDE_TEST_LOCK_RELEASE_BARRIER;
      if (base) writeFileSync(`${base}.retrying`, "");
    }
    const restante = deadline - performance.now();
    if (resultado.erro || restante <= 0) {
      console.error(`[aonde-affiliates] Falha ao liberar lock ${arquivoLock()} (${resultado.erro?.code || "EEXIST"}). Recuperação manual: pare TODOS os workers, inspecione o dono e remova o gate/lock abandonado antes de reiniciar.`);
      return false;
    }
    Atomics.wait(lockWait, 0, 0, Math.min(LOCK_RELEASE_BACKOFF_MS, restante));
  }
}

function lerCheckpoint() {
  try {
    const n = Number.parseInt(readFileSync(arquivoCheckpoint(), "utf-8").trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function gravarCheckpoint(n) {
  const dir = resolveDataDir();
  ensureDir(dir);
  writeFileSync(arquivoCheckpoint(), String(n), "utf-8");
}

function lerFila() {
  try {
    return readFileSync(arquivoFila(), "utf-8")
      .split("\n")
      .filter((l) => l.trim());
  } catch {
    return [];
  }
}

/**
 * Acha o assinante pelo hash do e-mail — a fila NUNCA guarda o endereco, so o
 * hash. Depois do descadastro o registro guarda `email_hash` e perde o e-mail,
 * entao as duas formas precisam casar. Uma nova inscrição confirmada tem
 * prioridade sobre o registro antigo de descadastro com o mesmo hash.
 */
function assinantePorHash(hash, assinantes) {
  const matchesHash = (s) => s && (s.email_hash === hash || (s.email && hashEmail(s.email) === hash));
  return (
    assinantes.find((s) => matchesHash(s) && s.double_optin_confirmed && !s.unsubscribed_at && s.email) ||
    assinantes.find(matchesHash) || null
  );
}

/**
 * Processa a fila de alertas pendentes.
 *
 * @returns {Promise<{ok:boolean, lidos:number, enviados:number, pulados:number, falhas:number, modo:string}>}
 */
export async function processarFila({ limite = 200, agora = new Date() } = {}) {
  const lock = adquirirLock();
  if (!lock || lock.contendido || lock.erro) {
    if (lock?.erro) console.error(`[aonde-affiliates] Erro ao adquirir lock ${arquivoLock()}: ${lock.erro.code || "UNKNOWN"}`);
    return {
      ok: true,
      lidos: 0,
      enviados: 0,
      pulados: 0,
      falhas: 0,
      modo: "bloqueado",
      pendentesRestantes: 0,
      motivo: lock?.erro ? "erro-lock" : "em-andamento",
    };
  }
  let resultado;
  try {
    const prov = provedorConfigurado();
    if (!prov || prov.erro) {
      resultado = {
        ok: true,
        lidos: 0,
        enviados: 0,
        pulados: 0,
        falhas: 0,
        modo: "registro",
        pendentesRestantes: Math.max(0, lerFila().length - lerCheckpoint()),
        motivo: prov?.erro || "AONDE_EMAIL_PROVIDER nao definida.",
      };
    } else {
      resultado = await processarFilaInterna({ limite, agora });
    }
  } finally {
    const liberado = liberarLock(lock);
    if (resultado && !liberado) {
      resultado.lockLiberado = false;
      resultado.motivoLock = "erro-liberar-lock";
    }
  }
  return resultado;
}

async function processarFilaInterna({ limite = 200, agora = new Date() } = {}) {
  const linhas = lerFila();
  const jaFeitos = lerCheckpoint();
  const pendentes = linhas.slice(jaFeitos, jaFeitos + limite);
  const estados = lerEstados();

  const prov = provedorConfigurado();
  const modo = !prov || prov.erro ? "registro" : prov.nome;

  let enviados = 0;
  let pulados = 0;
  let falhas = 0;
  let processadas = 0;
  let avisouSemOfferId = false;

  for (let i = 0; i < pendentes.length; i++) {
    const linha = pendentes[i];
    processadas++;
    let item;
    try {
      item = JSON.parse(linha);
    } catch {
      pulados++;
      continue; // linha corrompida nao trava a fila
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      pulados++;
      continue;
    }

    const chave = item && item.id ? String(item.id) : `linha:${jaFeitos + i}`;
    if (estados[chave] === "enviado" || estados[chave] === "descartado" || estados[chave] === "reivindicado") {
      pulados++;
      continue;
    }

    if (item.canal !== undefined && item.canal !== "email") {
      estados[chave] = "descartado";
      gravarEstados(estados);
      console.warn("[aonde-affiliates] Alerta descartado: canal-nao-suportado", item.canal);
      pulados++;
      continue;
    }

    if (typeof item.subscriberEmailHash !== "string" || !item.subscriberEmailHash.trim()) {
      estados[chave] = "descartado";
      gravarEstados(estados);
      console.warn("[aonde-affiliates] Alerta descartado: subscriberEmailHash ausente ou invalido.");
      pulados++;
      continue;
    }

    // Relê o store imediatamente antes do envio: descadastro no meio da fila
    // não pode receber o e-mail que já estava na linha.
    const assinantes = listSubscribers();
    const sub = assinantePorHash(item.subscriberEmailHash, assinantes);
    // Assinante apagado, descadastrado ou com a PII removida: nao ha para quem
    // mandar, e isso NAO e falha — e o sistema respeitando o descadastro.
    if (!sub || !sub.email || !sub.double_optin_confirmed || sub.unsubscribed_at) {
      pulados++;
      continue;
    }

    const eligibility = queuedOfferEligibility(item, sub, { today: agora.toISOString().slice(0, 10) });
    if (!eligibility.eligible) {
      estados[chave] = "descartado";
      gravarEstados(estados);
      pulados++;
      if (eligibility.reason === "sem-offerId" && !avisouSemOfferId) {
        console.warn("[aonde-affiliates] Alerta descartado: sem offerId para verificar elegibilidade.");
        avisouSemOfferId = true;
      }
      continue;
    }

    estados[chave] = "reivindicado";
    gravarEstados(estados);

    const base = getConfig().siteUrl;
    const unsubscribeUrl = `${base}/api/newsletter/unsubscribe?email=${encodeURIComponent(sub.email)}`;
    const { assunto, textoPlano, html } = buildPriceAlertEmail({
      email: sub.email,
      origem: eligibility.offer.origem,
      destino: eligibility.offer.destino,
      precoCentavos: eligibility.offer.preco_centavos,
      offerUrl: item.offerId ? `${base}/ofertas/${encodeURIComponent(item.offerId)}` : base,
      unsubscribeUrl,
    });

    const r = await enviarEmail({ para: sub.email, assunto, textoPlano, html, unsubscribeUrl });
    if (r.ok) {
      enviados++;
      estados[chave] = "enviado";
      gravarEstados(estados);
    } else if (r.estado === "falha_temporaria" || r.estado === "falha_provedor") {
      // Para AQUI e nao avanca o checkpoint alem desta linha: na proxima
      // rodada ela e retentada, em vez de ser perdida.
      delete estados[chave];
      gravarEstados(estados);
      console.error("[aonde-affiliates] Falha temporária ao enviar alerta; a linha volta para a fila.", r.motivo || r.estado || "");
      falhas++;
      processadas--;
      break;
    } else {
      estados[chave] = "falha";
      gravarEstados(estados);
      console.error("[aonde-affiliates] Falha ao enviar alerta:", (r && (r.motivo || r.estado)) || "falha");
      pulados++;
    }
  }

  if (processadas > 0) gravarCheckpoint(jaFeitos + processadas);

  return {
    ok: true,
    lidos: pendentes.length,
    enviados,
    pulados,
    falhas,
    modo,
    pendentesRestantes: Math.max(0, linhas.length - (jaFeitos + processadas)),
  };
}
