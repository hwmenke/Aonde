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

import { readFileSync, writeFileSync } from "node:fs";
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
  const linhas = lerFila();
  const jaFeitos = lerCheckpoint();
  const pendentes = linhas.slice(jaFeitos, jaFeitos + limite);

  const prov = provedorConfigurado();
  const modo = !prov || prov.erro ? "registro" : prov.nome;

  const assinantes = listSubscribers();
  let enviados = 0;
  let pulados = 0;
  let falhas = 0;
  let processadas = 0;

  for (const linha of pendentes) {
    processadas++;
    let item;
    try {
      item = JSON.parse(linha);
    } catch {
      pulados++;
      continue; // linha corrompida nao trava a fila
    }

    const sub = assinantePorHash(item.subscriberEmailHash, assinantes);
    // Assinante apagado, descadastrado ou com a PII removida: nao ha para quem
    // mandar, e isso NAO e falha — e o sistema respeitando o descadastro.
    if (!sub || !sub.email || sub.unsubscribed_at) {
      pulados++;
      continue;
    }

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
    if (r.ok) enviados++;
    else if (r.estado === "falha_temporaria") {
      // Para AQUI e nao avanca o checkpoint alem desta linha: na proxima
      // rodada ela e retentada, em vez de ser perdida.
      falhas++;
      processadas--;
      break;
    } else {
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
