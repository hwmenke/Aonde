// Eventos do funil. O payload é uma lista fechada: sem e-mail, sem texto
// livre da busca e sem identificador extra. Continuar no parceiro não é compra.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveDataDir, ensureDir } from "../store/dataDir.js";

const TIPOS = new Set(["busca", "guia-oferta", "saida", "parceiro"]);
const LOCAIS = new Set(["formulario", "guia-lateral", "oferta-relacionada", "saida", "lista"]);
const ALVO = /^[A-Za-z0-9:_-]{0,80}$/;
const MAX_LINHAS = 1000;
const DEDUP_MS = 30_000;

const recentes = new Map();
let gravados = 0;
let ignorados = 0;
let duplicados = 0;

function inteiroEnv(nome, padrao) {
  const raw = process.env[nome];
  if (raw === undefined || raw === null || String(raw).trim() === "") return padrao;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export function eventoPermitido(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const chaves = Object.keys(body);
  if (chaves.some((k) => /email|query|texto|useragent|senha|token/i.test(k))) return null;
  const tipo = typeof body.tipo === "string" ? body.tipo : "";
  const local = typeof body.local === "string" ? body.local : "";
  const alvo = body.alvo === undefined || body.alvo === null ? "" : String(body.alvo);
  if (!TIPOS.has(tipo) || !LOCAIS.has(local) || !ALVO.test(alvo)) return null;
  if (/@/.test(alvo)) return null;
  return { tipo, local, alvo };
}

function podar(arquivo) {
  let texto = "";
  try {
    texto = readFileSync(arquivo, "utf8");
  } catch {
    return;
  }
  const linhas = texto.split("\n").filter(Boolean);
  const teto = inteiroEnv("AONDE_EVENTS_MAX_LINES", MAX_LINHAS);
  if (linhas.length <= teto) return;
  writeFileSync(arquivo, linhas.slice(-teto).join("\n") + "\n", "utf8");
}

export function registrarEvento(evento, agora = Date.now()) {
  const limpo = eventoPermitido(evento);
  if (!limpo) {
    ignorados += 1;
    return { ok: false, motivo: "ignorado" };
  }
  const chave = `${limpo.tipo}|${limpo.local}|${limpo.alvo}`;
  const visto = recentes.get(chave);
  if (visto !== undefined && agora - visto < DEDUP_MS) {
    duplicados += 1;
    return { ok: true, duplicado: true };
  }
  try {
    const dir = resolveDataDir();
    ensureDir(dir);
    const arquivo = path.join(dir, "events.jsonl");
    appendFileSync(
      arquivo,
      JSON.stringify({ ...limpo, timestamp: new Date(agora).toISOString() }) + "\n",
      "utf8"
    );
    gravados += 1;
    recentes.delete(chave);
    recentes.set(chave, agora);
    while (recentes.size > 500) recentes.delete(recentes.keys().next().value);
    podar(arquivo);
    return { ok: true, duplicado: false };
  } catch (err) {
    console.error("[aonde] evento não gravado:", err && err.message);
    return { ok: false, motivo: "falha" };
  }
}

export function estatisticasEventos() {
  return { gravados, ignorados, duplicados };
}

export function resetarEventosMemoria() {
  recentes.clear();
  gravados = 0;
  ignorados = 0;
  duplicados = 0;
}
