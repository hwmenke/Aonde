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

import { readFileSync, writeFileSync, openSync, closeSync, writeSync, unlinkSync, existsSync, statSync } from "node:fs";
import path from "node:path";

import { resolveDataDir, ensureDir } from "../store/dataDir.js";
import { enviarEmail, provedorConfigurado } from "./sender.js";
import { buildPriceAlertEmail } from "./emailTemplates.js";
import { listSubscribers, hashEmail } from "./subscriberStore.js";
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
// exclusivo (wx). Lock abandonado há mais de 2 minutos é descartado.
function adquirirLock() {
  const lock = arquivoLock();
  ensureDir(resolveDataDir());
  try {
    if (existsSync(lock)) {
      const idade = Date.now() - statSync(lock).mtimeMs;
      if (idade < 120000) return null;
      unlinkSync(lock);
    }
  } catch {
    return null;
  }
  try {
    const fd = openSync(lock, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return lock;
  } catch {
    return null;
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
 * entao as duas formas precisam casar.
 */
function assinantePorHash(hash, assinantes) {
  return (
    assinantes.find(
      (s) => s && (s.email_hash === hash || (s.email && hashEmail(s.email) === hash))
    ) || null
  );
}

/**
 * Processa a fila de alertas pendentes.
 *
 * @returns {Promise<{ok:boolean, lidos:number, enviados:number, pulados:number, falhas:number, modo:string}>}
 */
export async function processarFila({ limite = 200, agora = new Date() } = {}) {
  const lock = adquirirLock();
  if (!lock) {
    return {
      ok: true,
      lidos: 0,
      enviados: 0,
      pulados: 0,
      falhas: 0,
      modo: "bloqueado",
      pendentesRestantes: 0,
      motivo: "em-andamento",
    };
  }
  try {
    return await processarFilaInterna({ limite, agora });
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      // O próximo worker descarta lock antigo pelo prazo.
    }
  }
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

    const chave = item && item.id ? String(item.id) : `linha:${jaFeitos + i}`;
    if (estados[chave] === "enviado") {
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

    estados[chave] = "reivindicado";
    gravarEstados(estados);

    const base = getConfig().siteUrl;
    const { assunto, textoPlano, html } = buildPriceAlertEmail({
      email: sub.email,
      origem: item.offerRoute ? String(item.offerRoute).split("-")[0] : sub.origem_preferida,
      destino: item.offerRoute ? String(item.offerRoute).split("-")[1] : null,
      precoCentavos: item.precoCentavos,
      offerUrl: item.offerId ? `${base}/ofertas/${encodeURIComponent(item.offerId)}` : base,
      unsubscribeUrl: `${base}/api/newsletter/unsubscribe?email=${encodeURIComponent(sub.email)}`,
    });

    const r = await enviarEmail({ para: sub.email, assunto, textoPlano, html });
    if (r.ok) {
      enviados++;
      estados[chave] = "enviado";
      gravarEstados(estados);
    } else if (r.estado === "falha_temporaria") {
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
