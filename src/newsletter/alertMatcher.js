// Casamento de ofertas com regras de alerta e enfileiramento de notificacoes.
//
// matchAlerts() e PURO (sem I/O): dado um Offer e os conjuntos de regras +
// assinantes, retorna os matches. Facil de testar isoladamente.
//
// dispatchAlerts() e a camada com I/O: carrega regras+assinantes dos stores,
// casa tudo e ENFILEIRA cada notificacao em "<AONDE_DATA_DIR>/alert_queue.jsonl"
// (append JSONL). NAO envia e-mail/WhatsApp de verdade — o modulo e zero-dep e
// nao tem provedor. O ponto de integracao futuro e setSenderImpl() (padrao do
// setFetchImpl de src/http.js): um worker real (SendGrid/SES/WhatsApp BSP)
// substituiria o sender default, resolveria o hash do e-mail contra o store e
// faria o envio.
//
// LGPD (minimizacao de dados): a fila grava o HASH SHA-256 do e-mail, nunca o
// e-mail em claro.

import path from "node:path";
import { appendFileSync, readFileSync } from "node:fs";

import { resolveDataDir, ensureDir } from "../store/dataDir.js";
import { listSubscribers, hashEmail } from "./subscriberStore.js";
import { listAlertRules } from "./alertRules.js";

/**
 * Casa um conjunto de ofertas/regras. Puro e testavel.
 *
 * Uma regra casa uma oferta quando:
 *   - offer.origem === rule.origem (IATA, case-insensitive)
 *   - rule.destino ausente OU igual a offer.destino
 *   - rule.preco_alvo_centavos ausente OU offer.preco_centavos <= alvo
 *   - o assinante dono da regra esta confirmado e NAO descadastrado
 *
 * @param {{origem: string, destino: string, preco_centavos: number, id?: string}} offer
 * @param {{rules: object[], subscribers: object[]}} ctx
 * @returns {Array<{rule: object, subscriber: object, canal: string}>}
 */
export function matchAlerts(offer, { rules = [], subscribers = [] } = {}) {
  if (!offer) return [];

  const offerOrigem = String(offer.origem || "").toUpperCase();
  const offerDestino = String(offer.destino || "").toUpperCase();
  const offerPreco = offer.preco_centavos;

  // Indexa assinantes elegiveis (confirmados e ativos) por id.
  const eligibleById = new Map();
  for (const sub of subscribers) {
    if (sub && sub.double_optin_confirmed && !sub.unsubscribed_at) {
      eligibleById.set(sub.id, sub);
    }
  }

  const matches = [];
  for (const rule of rules) {
    if (!rule) continue;

    const subscriber = eligibleById.get(rule.subscriber_id);
    if (!subscriber) continue; // nao confirmado / descadastrado / inexistente

    if (String(rule.origem || "").toUpperCase() !== offerOrigem) continue;

    const ruleDestino = rule.destino ? String(rule.destino).toUpperCase() : null;
    if (ruleDestino && ruleDestino !== offerDestino) continue;

    if (
      rule.preco_alvo_centavos !== undefined &&
      rule.preco_alvo_centavos !== null &&
      !(typeof offerPreco === "number" && offerPreco <= rule.preco_alvo_centavos)
    ) {
      continue;
    }

    const canais = Array.isArray(rule.canais) && rule.canais.length > 0 ? rule.canais : ["email"];
    for (const canal of canais) {
      matches.push({ rule, subscriber, canal });
    }
  }

  return matches;
}

// Sender injetavel. Default: apenas enfileira (retorna { queued: true }). Um
// worker real substituiria via setSenderImpl().
function defaultSender(/* item */) {
  return { queued: true };
}

let senderImpl = defaultSender;

/**
 * Substitui a implementacao de envio de notificacoes. Ponto de integracao
 * futuro (SendGrid/SES/WhatsApp BSP). O default apenas enfileira em JSONL.
 * @param {(item: object) => any} fn
 */
export function setSenderImpl(fn) {
  senderImpl = typeof fn === "function" ? fn : defaultSender;
}

/** Restaura o sender default (uso: testes). */
export function resetSenderImpl() {
  senderImpl = defaultSender;
}

function queueFile() {
  return path.join(resolveDataDir(), "alert_queue.jsonl");
}

/**
 * Casa as ofertas contra os stores de regras+assinantes e enfileira as
 * notificacoes resultantes em data/alert_queue.jsonl (uma linha JSON por
 * notificacao). Grava HASH do e-mail (minimizacao LGPD), nunca o e-mail cru.
 *
 * @param {Array<object>} offers ofertas no shape do offerAdapter (origem, destino, preco_centavos, id?)
 * @returns {{ok: true, queued: number, items: object[]}}
 */
/** Janela padrao de silencio por (assinante, rota): 24h. */
export const COOLDOWN_PADRAO_MS = 24 * 60 * 60 * 1000;

/**
 * Le a fila ja gravada e devolve, por chave (assinante+rota+canal), o instante
 * do ultimo envio. Usada para nao notificar a mesma pessoa sobre a mesma rota
 * varias vezes no mesmo dia.
 *
 * A fila e a fonte da verdade porque e o unico registro persistente do que ja
 * saiu. Fila ilegivel ou inexistente => mapa vazio: na duvida a gente NAO
 * bloqueia um alerta legitimo (perder um aviso e pior que repetir um).
 */
function ultimosEnvios() {
  const mapa = new Map();
  try {
    const txt = readFileSync(queueFile(), "utf-8");
    for (const linha of txt.split("\n")) {
      if (!linha.trim()) continue;
      let item;
      try {
        item = JSON.parse(linha);
      } catch {
        continue; // linha corrompida nao invalida o resto da fila
      }
      const chave = `${item.subscriberEmailHash}|${item.offerRoute}|${item.canal}`;
      const t = Date.parse(item.queuedAt || "");
      if (!Number.isFinite(t)) continue;
      const anterior = mapa.get(chave);
      if (anterior === undefined || t > anterior) mapa.set(chave, t);
    }
  } catch {
    return mapa;
  }
  return mapa;
}

/**
 * Enfileira notificacoes para as ofertas que casam com alertas ativos.
 *
 * DEDUPLICACAO: sem ela, medido, 24 chamadas seguidas com a mesma oferta abaixo
 * do preco-alvo geravam 24 notificacoes para o MESMO assinante. Um cron rodando
 * mais de uma vez por dia sobre uma tarifa persistente viraria spam garantido
 * assim que houvesse envio real. Agora cada par (assinante, rota, canal) so
 * volta a ser notificado depois de `cooldownMs`.
 */
export function dispatchAlerts(offers = [], { cooldownMs = COOLDOWN_PADRAO_MS, agora = Date.now() } = {}) {
  const list = Array.isArray(offers) ? offers : [offers];
  const rules = listAlertRules();
  const subscribers = listSubscribers();

  const items = [];
  const lines = [];
  const nowIso = new Date(agora).toISOString();
  const enviados = ultimosEnvios();
  let suprimidos = 0;

  for (const offer of list) {
    const matches = matchAlerts(offer, { rules, subscribers });
    for (const { subscriber, canal } of matches) {
      const rota = `${String(offer.origem || "").toUpperCase()}-${String(offer.destino || "").toUpperCase()}`;
      const chave = `${hashEmail(subscriber.email)}|${rota}|${canal}`;
      const ultimo = enviados.get(chave);
      if (ultimo !== undefined && agora - ultimo < cooldownMs) {
        suprimidos++;
        continue;
      }
      enviados.set(chave, agora); // conta tambem dentro da MESMA chamada
      const item = {
        queuedAt: nowIso,
        subscriberEmailHash: hashEmail(subscriber.email),
        canal,
        offerId: offer.id || null,
        offerRoute: `${String(offer.origem || "").toUpperCase()}-${String(offer.destino || "").toUpperCase()}`,
        precoCentavos: offer.preco_centavos ?? null,
      };
      // Ponto de integracao: sender real substituiria o default via setSenderImpl.
      senderImpl(item);
      items.push(item);
      lines.push(JSON.stringify(item));
    }
  }

  if (lines.length > 0) {
    const dir = resolveDataDir();
    ensureDir(dir);
    appendFileSync(queueFile(), lines.join("\n") + "\n", "utf-8");
  }

  return { ok: true, queued: items.length, suprimidos, items };
}
