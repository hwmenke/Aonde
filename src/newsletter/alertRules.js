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
    return { ok: false, error: "Assinante nao encontrado." };
  }
  if (!subscriber.double_optin_confirmed || subscriber.unsubscribed_at) {
    return {
      ok: false,
      error: "Assinante nao confirmou a inscricao (double opt-in) ou esta descadastrado.",
    };
  }

  if (!isIataCode(origem)) {
    return {
      ok: false,
      error: `origem invalida: "${origem}". Esperado codigo IATA de 3 letras (A-Z), ex.: GRU`,
    };
  }
  const hasDestino = destino !== undefined && destino !== null && String(destino).trim() !== "";
  if (hasDestino && !isIataCode(destino)) {
    return {
      ok: false,
      error: `destino invalido: "${destino}". Esperado codigo IATA de 3 letras (A-Z), ex.: LIS`,
    };
  }

  const hasPreco = precoAlvoCentavos !== undefined && precoAlvoCentavos !== null;
  if (hasPreco && (typeof precoAlvoCentavos !== "number" || !Number.isFinite(precoAlvoCentavos) || precoAlvoCentavos <= 0)) {
    return {
      ok: false,
      error: "precoAlvoCentavos invalido. Informe um valor em centavos maior que zero.",
    };
  }

  const canaisFinal = Array.isArray(canais) && canais.length > 0 ? canais : subscriber.channels || ["email"];

  const rule = {
    id: crypto.randomUUID(),
    subscriber_id: subscriberId,
    origem: normalizeIata(origem),
    destino: hasDestino ? normalizeIata(destino) : null,
    preco_alvo_centavos: hasPreco ? precoAlvoCentavos : null,
    canais: canaisFinal,
    created_at: new Date().toISOString(),
  };

  const all = readAll();
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
