// Snippet opcional de audiencia (Plausible). htmlDocument() chama
// analyticsSnippet() em todo HTML; securityHeaders() chama
// analyticsCspOrigins() para liberar o host na CSP so quando o tag existe.
//
// Padrao: desligado. Sem PLAUSIBLE_DOMAIN (ou com valor que nao seja um
// hostname simples) nenhuma tag e injetada e a CSP fica como estava.
// Nao inventar dominio/site ID — o operador configura no painel do Plausible
// e cola o MESMO hostname em PLAUSIBLE_DOMAIN.

import { escapeHtml } from "./texto.js";

export const DEFAULT_PLAUSIBLE_SCRIPT_SRC = "https://plausible.io/js/script.js";

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const SCRIPT_PATH_RE = /^\/[A-Za-z0-9._/-]+\.js$/;

/**
 * Hostname DNS simples (FQDN ASCII): labels [a-z0-9-], TLD com letra.
 * Rejeita URL, porta, caminho, IP, espaco e qualquer coisa que nao caiba
 * num atributo data-domain do Plausible.
 */
export function isPlainHostname(value) {
  if (value === null || value === undefined) return false;
  const raw = String(value);
  if (raw !== raw.trim()) return false;
  const s = raw.toLowerCase();
  if (!s || s.length > 253) return false;
  if (s.includes(":") || s.includes("/") || s.includes("\\") || s.includes(" ")) return false;
  if (s.startsWith(".") || s.endsWith(".") || s.includes("..")) return false;
  const labels = s.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/[a-z]/.test(tld)) return false;
  return labels.every((label) => label.length > 0 && label.length <= 63 && HOSTNAME_RE.test(label));
}

function envText(env, key) {
  const raw = env && env[key];
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

function resolveScriptSrc(raw) {
  const value = String(raw || "").trim();
  const candidate = value || DEFAULT_PLAUSIBLE_SCRIPT_SRC;
  if (/[\s'"<>`]/.test(candidate)) return "";
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (url.port) return "";
  if (url.hash) return "";
  if (url.search) return "";
  if (!isPlainHostname(url.hostname)) return "";
  if (!SCRIPT_PATH_RE.test(url.pathname)) return "";
  return url.href;
}

/**
 * Resolve o snippet a partir de um objeto env (default: process.env).
 * html vazio + origins vazio = analytics desligado (o caso padrao).
 */
export function resolveAnalytics(env = process.env) {
  const domainRaw = envText(env, "PLAUSIBLE_DOMAIN");
  if (!domainRaw || !isPlainHostname(domainRaw)) {
    return { html: "", origins: [], domain: "", src: "" };
  }
  const src = resolveScriptSrc(envText(env, "PLAUSIBLE_SCRIPT_SRC"));
  if (!src) {
    return { html: "", origins: [], domain: "", src: "" };
  }
  const domain = domainRaw.toLowerCase();
  const origin = new URL(src).origin;
  const html =
    `<script defer data-domain="${escapeHtml(domain)}" src="${escapeHtml(src)}"></script>`;
  return { html, origins: [origin], domain, src };
}

/** Tag para o <head>. String vazia quando analytics esta desligado. */
export function analyticsSnippet(env = process.env) {
  const { html } = resolveAnalytics(env);
  return html ? `${html}\n` : "";
}

/** Origens https para script-src e connect-src da CSP. [] quando desligado. */
export function analyticsCspOrigins(env = process.env) {
  return resolveAnalytics(env).origins;
}
