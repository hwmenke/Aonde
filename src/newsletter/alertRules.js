// Store de regras de alerta de preco.
//
// Modelo (handoff):
//   AlertRule { id, subscriber_id, origem (IATA), destino? (IATA),
//               preco_alvo_centavos?, canais, created_at }
//
// Persistencia: "<AONDE_DATA_DIR>/alert_rules.json" (array), mesmo padrao dos
// demais stores. Uma regra so pode ser criada para um subscriber que EXISTE e
// esta CONFIRMADO (double opt-in) — isso amarra o consentimento LGPD a criacao
// de alertas.

import path from "node:path";
import crypto from "node:crypto";

import { resolveDataDir, readJsonSafe, writeJsonAtomic } from "../store/dataDir.js";
import { isIataCode, normalizeIata } from "../validate.js";
import { getSubscriberById } from "./subscriberStore.js";

function rulesFile() {
  return path.join(resolveDataDir(), "alert_rules.json");
}

function readAll() {
  const data = readJsonSafe(rulesFile(), []);
  return Array.isArray(data) ? data : [];
}

function isPositiveCentavos(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Cria uma regra de alerta para um assinante confirmado.
 *
 * @param {{subscriberId: string, origem: string, destino?: string,
 *          precoAlvoCentavos?: number, canais?: string[]}} input
 * @returns {{ok: true, rule: object} | {ok: false, error: string}}
 */
export function addAlertRule({ subscriberId, origem, destino, precoAlvoCentavos, canais } = {}) {
  const subscriber = subscriberId ? getSubscriberById(subscriberId) : null;
  if (!subscriber) {
    return { ok: false, error: "Assinante não encontrado." };
  }
  if (!subscriber.double_optin_confirmed || subscriber.unsubscribed_at) {
    return {
      ok: false,
      error: "Assinante não confirmou a inscrição pelo e-mail ou está descadastrado.",
    };
  }

  if (!isIataCode(origem)) {
    return {
      ok: false,
      error: `Origem inválida: "${origem}". Use o código IATA de 3 letras (A-Z), por exemplo GRU.`,
    };
  }
  const hasDestino = destino !== undefined && destino !== null && String(destino).trim() !== "";
  if (hasDestino && !isIataCode(destino)) {
    return {
      ok: false,
      error: `Destino inválido: "${destino}". Use o código IATA de 3 letras (A-Z), por exemplo LIS.`,
    };
  }

  const hasPreco = precoAlvoCentavos !== undefined && precoAlvoCentavos !== null;
  if (hasPreco && !isPositiveCentavos(precoAlvoCentavos)) {
    return {
      ok: false,
      error: "Preço-alvo inválido. Informe um valor inteiro em centavos maior que zero.",
    };
  }

  const canaisFinal = Array.isArray(canais) && canais.length > 0 ? canais : subscriber.channels || ["email"];
  const origemNorm = normalizeIata(origem);
  const destinoNorm = hasDestino ? normalizeIata(destino) : null;
  const all = readAll();
  const existente = all.find(
    (regra) =>
      regra &&
      regra.subscriber_id === subscriberId &&
      regra.origem === origemNorm &&
      (regra.destino || null) === destinoNorm
  );
  if (existente) return { ok: true, rule: existente, duplicada: true };

  const rule = {
    id: crypto.randomUUID(),
    subscriber_id: subscriberId,
    origem: origemNorm,
    destino: destinoNorm,
    preco_alvo_centavos: hasPreco ? precoAlvoCentavos : null,
    canais: canaisFinal,
    created_at: new Date().toISOString(),
  };

  all.push(rule);
  writeJsonAtomic(rulesFile(), all);
  return { ok: true, rule };
}

/**
 * Lista regras de alerta, opcionalmente filtrando por assinante.
 * @param {{subscriberId?: string}} [options]
 * @returns {object[]}
 */
export function listAlertRules({ subscriberId } = {}) {
  const all = readAll();
  if (!subscriberId) return all;
  return all.filter((r) => r && r.subscriber_id === subscriberId);
}

/**
 * Remove uma regra pelo id. Idempotente (remover uma regra inexistente nao
 * gera erro; retorna removed=false).
 * @param {string} id
 * @returns {{ok: true, removed: boolean}}
 */
export function removeAlertRule(id) {
  const all = readAll();
  const next = all.filter((r) => !(r && r.id === id));
  const removed = next.length !== all.length;
  if (removed) writeJsonAtomic(rulesFile(), next);
  return { ok: true, removed };
}
