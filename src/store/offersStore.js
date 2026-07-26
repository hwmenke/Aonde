// Store de ofertas (rascunhos gerados pelo job de monitoramento).
//
// Mesmo padrao do historico de precos: arquivo JSON unico
// "<AONDE_DATA_DIR>/offers.json" com um array de Offers, escrita atomica e
// tolerancia a arquivo corrompido. O `upsert` e por `id` (a curadoria de uma
// rota tem sempre o mesmo id, ex.: "gru-lis"), para NAO duplicar a cada rodada
// do monitor: se a oferta ja existe, atualiza preco/timestamp em vez de criar
// uma nova.

import path from "node:path";

import { resolveDataDir, readJsonSafe, writeJsonAtomic } from "./dataDir.js";

function offersFile() {
  return path.join(resolveDataDir(), "offers.json");
}

function readAll() {
  const data = readJsonSafe(offersFile(), []);
  return Array.isArray(data) ? data : [];
}

/**
 * Insere ou atualiza uma oferta por `id`. Preserva `created_at` no update e
 * sempre atualiza `updated_at`. Retorna a oferta persistida.
 *
 * @param {object} offer objeto Offer (precisa ter `id`)
 * @returns {object} a oferta gravada (com created_at/updated_at)
 */
export function upsert(offer) {
  if (!offer || !offer.id) {
    throw new Error("upsert: offer.id e obrigatorio");
  }

  const now = new Date().toISOString();
  const all = readAll();
  const index = all.findIndex((o) => o && o.id === offer.id);

  let stored;
  if (index === -1) {
    stored = { ...offer, created_at: now, updated_at: now };
    all.push(stored);
  } else {
    // Mantem o created_at original; o restante e sobrescrito pela nova versao.
    stored = { ...all[index], ...offer, created_at: all[index].created_at || now, updated_at: now };
    all[index] = stored;
  }

  writeJsonAtomic(offersFile(), all);
  return stored;
}

/**
 * Lista ofertas armazenadas, opcionalmente filtrando por status.
 * @param {object} [options]
 * @param {string} [options.status] filtra por status (ex.: "rascunho"); omitido = todas
 * @returns {object[]}
 */
export function listOffers(options = {}) {
  const all = readAll();
  if (options.status === undefined || options.status === null || options.status === "") {
    return all;
  }
  return all.filter((o) => o && o.status === options.status);
}

/**
 * Recupera uma oferta pelo id.
 * @param {string} id
 * @returns {object|null}
 */
export function getOffer(id) {
  const all = readAll();
  return all.find((o) => o && o.id === id) || null;
}

/** Total de ofertas armazenadas (util para o health-check). */
export function countOffers() {
  return readAll().length;
}
