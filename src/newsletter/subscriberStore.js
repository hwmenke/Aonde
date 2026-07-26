// Store de assinantes da newsletter / alertas de preco do Aonde.com.br.
//
// Modelo do produto (handoff):
//   Subscriber {
//     id, email (unico), whatsapp?, origem_preferida (IATA),
//     double_optin_confirmed, consent_lgpd_at, channels,
//     created_at, unsubscribed_at?,
//     optin_token?, optin_token_expires_at?
//   }
//
// Persistencia: arquivo JSON unico "<AONDE_DATA_DIR>/subscribers.json" (array),
// mesmo padrao do offersStore — escrita atomica e tolerancia a corrompido via
// dataDir.js. O e-mail e a chave logica de unicidade (case-insensitive).
//
// LGPD: o consentimento so e registrado (consent_lgpd_at) no momento em que o
// assinante confirma o double opt-in. O descadastro NUNCA apaga o registro
// (auditoria), apenas marca unsubscribed_at — a partir dai o assinante nunca
// mais casa alertas.

import path from "node:path";
import crypto from "node:crypto";

import { resolveDataDir, readJsonSafe, writeJsonAtomic } from "../store/dataDir.js";
import { isIataCode, normalizeIata } from "../validate.js";

// Regex razoavel para e-mail: nao pretende cobrir 100% da RFC 5322, apenas
// rejeitar entradas obviamente invalidas (sem @, sem dominio, com espacos).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validade do token de double opt-in: 48 horas a partir da geracao.
const OPTIN_TTL_MS = 48 * 60 * 60 * 1000;

function subscribersFile() {
  return path.join(resolveDataDir(), "subscribers.json");
}

function readAll() {
  const data = readJsonSafe(subscribersFile(), []);
  return Array.isArray(data) ? data : [];
}

function writeAll(all) {
  writeJsonAtomic(subscribersFile(), all);
}

/** true se `str` for um e-mail plausivel. */
export function isValidEmail(str) {
  return typeof str === "string" && EMAIL_RE.test(str.trim());
}

/** Normaliza um e-mail (trim + minusculas) para comparacao/armazenamento. */
export function normalizeEmail(str) {
  return String(str || "").trim().toLowerCase();
}

/** Gera um token opaco de opt-in (32 bytes aleatorios em hex). */
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Hash SHA-256 (hex) de um e-mail normalizado — usado na fila de alertas. */
export function hashEmail(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

/**
 * Inscreve um e-mail na newsletter/alertas, disparando o fluxo de double
 * opt-in. Cria (ou atualiza) o subscriber com double_optin_confirmed=false e
 * um token de confirmacao com validade de 48h. O consentimento LGPD so e
 * registrado depois, em confirm().
 *
 * Regras de re-inscricao:
 *   - e-mail ja confirmado (e nao descadastrado) -> { ok, status: "already_confirmed" }
 *   - e-mail pendente (ou descadastrado) -> regenera token e prazo, status "pending_optin"
 *
 * O token e RETORNADO para a camada de envio (iria no corpo do e-mail de
 * confirmacao). Ele NUNCA deve ser exposto numa resposta HTTP publica — ver
 * o handler em src/server.js.
 *
 * @param {{email: string, whatsapp?: string, origem: string}} input
 * @returns {{ok: true, status: "pending_optin", token: string, subscriber: object}
 *          | {ok: true, status: "already_confirmed", subscriber: object}
 *          | {ok: false, error: string}}
 */
export function subscribe({ email, whatsapp, origem, destino, precoAlvoCentavos } = {}) {
  if (!isValidEmail(email)) {
    return { ok: false, error: "E-mail invalido. Informe um endereco de e-mail valido." };
  }
  if (!isIataCode(origem)) {
    return {
      ok: false,
      error: `origem invalida: "${origem}". Esperado codigo IATA de 3 letras (A-Z), ex.: GRU`,
    };
  }
  // Alerta de rota/preco OPCIONAL — mesmas regras de alertRules. Se `destino`
  // ou `precoAlvoCentavos` vierem, guardamos um `pending_alert` que o confirm()
  // transforma em AlertRule real assim que o double opt-in acontece.
  const hasDestino = destino !== undefined && destino !== null && String(destino).trim() !== "";
  if (hasDestino && !isIataCode(destino)) {
    return { ok: false, error: `destino invalido: "${destino}". Esperado codigo IATA de 3 letras (A-Z).` };
  }
  const hasPreco = precoAlvoCentavos !== undefined && precoAlvoCentavos !== null && precoAlvoCentavos !== "";
  if (hasPreco && !(Number.isFinite(Number(precoAlvoCentavos)) && Number(precoAlvoCentavos) > 0)) {
    return { ok: false, error: "precoAlvoCentavos invalido. Esperado numero positivo em centavos." };
  }
  const pendingAlert =
    hasDestino || hasPreco
      ? {
          destino: hasDestino ? normalizeIata(destino) : null,
          preco_alvo_centavos: hasPreco ? Math.round(Number(precoAlvoCentavos)) : null,
        }
      : null;

  const normalizedEmail = normalizeEmail(email);
  const normalizedOrigem = normalizeIata(origem);
  const hasWhatsapp = whatsapp !== undefined && whatsapp !== null && String(whatsapp).trim() !== "";
  const channels = hasWhatsapp ? ["email", "whatsapp"] : ["email"];

  const now = new Date();
  const nowIso = now.toISOString();
  const all = readAll();
  const index = all.findIndex((s) => s && normalizeEmail(s.email) === normalizedEmail);

  // Ja confirmado e ativo: nao ha o que fazer (nao reenvia opt-in).
  if (index !== -1) {
    const existing = all[index];
    if (existing.double_optin_confirmed && !existing.unsubscribed_at) {
      return { ok: true, status: "already_confirmed", subscriber: existing };
    }
  }

  const token = generateToken();
  const tokenExpiresAt = new Date(now.getTime() + OPTIN_TTL_MS).toISOString();

  let subscriber;
  if (index === -1) {
    subscriber = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      whatsapp: hasWhatsapp ? String(whatsapp).trim() : null,
      origem_preferida: normalizedOrigem,
      double_optin_confirmed: false,
      consent_lgpd_at: null,
      channels,
      created_at: nowIso,
      unsubscribed_at: null,
      optin_token: token,
      optin_token_expires_at: tokenExpiresAt,
      pending_alert: pendingAlert,
    };
    all.push(subscriber);
  } else {
    // Pendente ou descadastrado: regenera token/prazo e reativa o registro.
    // Preserva id/created_at (auditoria); atualiza preferencias.
    subscriber = {
      ...all[index],
      email: normalizedEmail,
      whatsapp: hasWhatsapp ? String(whatsapp).trim() : all[index].whatsapp || null,
      origem_preferida: normalizedOrigem,
      double_optin_confirmed: false,
      consent_lgpd_at: null,
      channels,
      unsubscribed_at: null,
      optin_token: token,
      optin_token_expires_at: tokenExpiresAt,
      // Preserva um alerta pendente anterior se esta re-inscricao nao trouxe um novo.
      pending_alert: pendingAlert || all[index].pending_alert || null,
    };
    all[index] = subscriber;
  }

  writeAll(all);
  return { ok: true, status: "pending_optin", token, subscriber };
}

/**
 * Confirma o double opt-in a partir do token. Registra o consentimento LGPD
 * (consent_lgpd_at = agora) e apaga o token (uso unico). Token inexistente ou
 * expirado retorna { ok: false, error } em pt-BR.
 *
 * @param {string} token
 * @returns {{ok: true, subscriber: object} | {ok: false, error: string}}
 */
export function confirm(token) {
  if (typeof token !== "string" || token.trim() === "") {
    return { ok: false, error: "Token de confirmacao ausente ou invalido." };
  }

  const all = readAll();
  const index = all.findIndex((s) => s && s.optin_token === token);
  if (index === -1) {
    return { ok: false, error: "Token de confirmacao invalido ou ja utilizado." };
  }

  const subscriber = all[index];
  const expiresAt = subscriber.optin_token_expires_at
    ? new Date(subscriber.optin_token_expires_at).getTime()
    : 0;
  if (!expiresAt || Date.now() > expiresAt) {
    return { ok: false, error: "Token de confirmacao expirado. Inscreva-se novamente." };
  }

  const nowIso = new Date().toISOString();
  const confirmed = {
    ...subscriber,
    double_optin_confirmed: true,
    consent_lgpd_at: nowIso,
    unsubscribed_at: null,
    optin_token: null,
    optin_token_expires_at: null,
  };
  all[index] = confirmed;
  writeAll(all);
  return { ok: true, subscriber: confirmed };
}

/**
 * Descadastra um e-mail. Idempotente: marca unsubscribed_at mas mantem o
 * registro (auditoria LGPD). Nunca revela se o e-mail existia — sempre { ok }
 * quando o input e valido. A partir daqui o assinante nunca mais casa alertas.
 *
 * @param {string} email
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function unsubscribe(email) {
  if (!isValidEmail(email)) {
    return { ok: false, error: "E-mail invalido. Informe um endereco de e-mail valido." };
  }

  const normalizedEmail = normalizeEmail(email);
  const all = readAll();
  const index = all.findIndex((s) => s && normalizeEmail(s.email) === normalizedEmail);

  if (index !== -1 && !all[index].unsubscribed_at) {
    all[index] = { ...all[index], unsubscribed_at: new Date().toISOString() };
    writeAll(all);
  }
  // Se nao existe ou ja estava descadastrado: no-op silencioso (idempotente,
  // sem vazar existencia).
  return { ok: true };
}

/**
 * Limpa o `pending_alert` de um assinante (chamado depois que a AlertRule real
 * e criada no confirm). Escrita atomica, no-op se o assinante nao existe.
 * @param {string} id
 */
export function clearPendingAlert(id) {
  const all = readAll();
  const index = all.findIndex((s) => s && s.id === id);
  if (index !== -1 && all[index].pending_alert) {
    all[index] = { ...all[index], pending_alert: null };
    writeAll(all);
  }
}

/**
 * Recupera um subscriber pelo e-mail (normalizado).
 * @param {string} email
 * @returns {object|null}
 */
export function getSubscriberByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const all = readAll();
  return all.find((s) => s && normalizeEmail(s.email) === normalizedEmail) || null;
}

/**
 * Recupera um subscriber pelo id.
 * @param {string} id
 * @returns {object|null}
 */
export function getSubscriberById(id) {
  const all = readAll();
  return all.find((s) => s && s.id === id) || null;
}

/**
 * Lista assinantes. Por padrao retorna todos; com { confirmedOnly: true }
 * retorna apenas os confirmados e nao descadastrados (publico elegivel a
 * alertas).
 *
 * @param {{confirmedOnly?: boolean}} [options]
 * @returns {object[]}
 */
export function listSubscribers({ confirmedOnly = false } = {}) {
  const all = readAll();
  if (!confirmedOnly) return all;
  return all.filter((s) => s && s.double_optin_confirmed && !s.unsubscribed_at);
}
