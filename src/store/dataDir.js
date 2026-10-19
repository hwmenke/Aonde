// Resolucao do diretorio de dados persistidos (historico de precos, ofertas
// em rascunho, log de cliques). Configuravel via env AONDE_DATA_DIR; o default
// e "aonde-affiliates/data/" (relativo a raiz do modulo).
//
// Lido em toda chamada (sem cache) para que os testes possam apontar cada caso
// para um diretorio temporario proprio (fs.mkdtemp + AONDE_DATA_DIR), com
// save/restore da env — o mesmo padrao ja usado nos testes de config.

import { existsSync, mkdirSync, writeFileSync, renameSync, readFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/store/ -> raiz do modulo sobe dois niveis.
const MODULE_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Diretorio raiz de dados. Le AONDE_DATA_DIR a cada chamada; default
 * "<raiz do modulo>/data". Nao cria o diretorio (ver ensureDir).
 * @returns {string}
 */
export function resolveDataDir() {
  const fromEnv = process.env.AONDE_DATA_DIR;
  if (fromEnv && fromEnv.trim() !== "") {
    return path.resolve(fromEnv.trim());
  }
  return path.join(MODULE_ROOT, "data");
}

/** Garante que um diretorio exista (mkdir -p). */
export function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function classificarJson(filePath) {
  if (!existsSync(filePath)) return { estado: "ausente" };
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return { estado: "inacessivel" };
  }
  try {
    return { estado: "ok", data: JSON.parse(content) };
  } catch {
    return { estado: "ilegivel" };
  }
}

function erroDeDados(filePath, estado) {
  const err = new Error(`Arquivo de dados ${estado}, sem substituição: ${filePath}`);
  err.code = "AONDE_DATA_CORRUPT";
  err.filePath = filePath;
  return err;
}

/**
 * Escrita atomica: grava num arquivo temporario e renomeia por cima do alvo
 * (rename e atomico no mesmo filesystem). Evita deixar um arquivo pela metade
 * se o processo morrer no meio da gravacao.
 *
 * Arquivo ilegível ou inacessível não é substituído. Uma cópia fica ao lado,
 * com sufixo .quarantine-, para recuperação.
 */
export function writeJsonAtomic(filePath, data) {
  const atual = classificarJson(filePath);
  if (atual.estado === "ilegivel" || atual.estado === "inacessivel") {
    try {
      copyFileSync(filePath, `${filePath}.quarantine-${Date.now()}`);
    } catch {
      // A cópia é best-effort. A escrita continua bloqueada.
    }
    console.error(`[aonde-affiliates] Recusa a substituir arquivo ${atual.estado}: ${filePath}`);
    throw erroDeDados(filePath, atual.estado);
  }
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

/**
 * Le e faz parse de um arquivo JSON. Arquivo ausente devolve `fallback`.
 * Arquivo ilegível ou inacessível lança (code AONDE_DATA_CORRUPT) em vez de
 * devolver uma coleção vazia que a próxima escrita apagaria.
 *
 * @param {string} filePath
 * @param {*} fallback valor devolvido quando o arquivo nao existe
 * @returns {*}
 */
export function readJsonSafe(filePath, fallback) {
  const atual = classificarJson(filePath);
  if (atual.estado === "ausente") return fallback;
  if (atual.estado !== "ok") {
    console.error(
      `[aonde-affiliates] Arquivo de dados ${atual.estado}, leitura interrompida sem zerar: ${filePath}`
    );
    throw erroDeDados(filePath, atual.estado);
  }
  return atual.data;
}

/** Pronto para health: ausente é vazio legítimo; ilegível não está pronto. */
export function storageStatus(dir = resolveDataDir()) {
  const nomes = ["offers.json", "subscribers.json", "alert_rules.json"];
  const files = {};
  let ready = true;
  for (const nome of nomes) {
    const estado = classificarJson(path.join(dir, nome)).estado;
    files[nome] = estado;
    if (estado === "ilegivel" || estado === "inacessivel") ready = false;
  }
  return { ready, files };
}
