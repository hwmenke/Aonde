// Resolucao do diretorio de dados persistidos (historico de precos, ofertas
// em rascunho, log de cliques). Configuravel via env AONDE_DATA_DIR; o default
// e "aonde-affiliates/data/" (relativo a raiz do modulo).
//
// Lido em toda chamada (sem cache) para que os testes possam apontar cada caso
// para um diretorio temporario proprio (fs.mkdtemp + AONDE_DATA_DIR), com
// save/restore da env — o mesmo padrao ja usado nos testes de config.

import { existsSync, mkdirSync, writeFileSync, renameSync, readFileSync } from "node:fs";
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

/**
 * Escrita atomica: grava num arquivo temporario e renomeia por cima do alvo
 * (rename e atomico no mesmo filesystem). Evita deixar um arquivo pela metade
 * se o processo morrer no meio da gravacao.
 */
export function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

/**
 * Le e faz parse de um arquivo JSON. Tolerante a arquivo ausente (retorna
 * fallback) e a arquivo corrompido: nesse caso avisa no stderr e retorna o
 * fallback em vez de lancar excecao (recomeca do zero, sem derrubar o modulo).
 *
 * @param {string} filePath
 * @param {*} fallback valor devolvido quando o arquivo nao existe ou esta corrompido
 * @returns {*}
 */
export function readJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(content);
  } catch {
    console.warn(
      `[aonde-affiliates] Arquivo de dados corrompido, recomecando do zero: ${filePath}`
    );
    return fallback;
  }
}
