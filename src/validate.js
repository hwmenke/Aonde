// Validacao e normalizacao de entrada para busca de ofertas.
//
// Objetivo: rejeitar cedo (antes de chegar na camada HTTP) entradas obviamente
// invalidas, com mensagens claras em pt-BR indicando qual campo e qual formato
// e esperado. Nao substitui a validacao do provedor upstream — apenas evita
// requisicoes garantidamente inuteis e melhora a mensagem de erro.

const IATA_RE = /^[A-Za-z]{3}$/;
const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** true se `str` for um codigo IATA valido (3 letras A-Z, case-insensitive). */
export function isIataCode(str) {
  return typeof str === "string" && IATA_RE.test(str.trim());
}

/** Normaliza um codigo IATA para maiusculas, ou retorna null se invalido. */
export function normalizeIata(str) {
  if (!isIataCode(str)) return null;
  return str.trim().toUpperCase();
}

/**
 * true se `str` for uma data valida no formato YYYY-MM ou YYYY-MM-DD, com
 * checagem real de calendario (rejeita mes 13, 2026-02-30, etc.).
 */
export function isValidDate(str) {
  if (typeof str !== "string") return false;
  const m = DATE_RE.exec(str.trim());
  if (!m) return false;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] !== undefined ? Number(m[3]) : null;

  if (month < 1 || month > 12) return false;

  if (day === null) return true; // formato YYYY-MM: basta ano/mes validos

  // Checagem de calendario para o dia (considera meses de 28-31 dias e ano
  // bissexto). Comparar componentes evita o "overflow" silencioso do Date.
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Valida as opcoes de busca de ofertas. origin/destination sao obrigatorios;
 * dateFrom/dateTo sao opcionais (validados apenas se informados).
 *
 * @param {{origin?: string, destination?: string, dateFrom?: string, dateTo?: string}} options
 * @returns {{ok: true, normalized: {origin: string, destination: string, dateFrom?: string, dateTo?: string}}
 *          | {ok: false, error: string}}
 */
export function validateSearchOptions(options = {}) {
  const { origin, destination, dateFrom, dateTo } = options;

  if (origin === undefined || origin === null || String(origin).trim() === "") {
    return { ok: false, error: "origin e obrigatorio (codigo IATA de 3 letras, ex.: GRU)" };
  }
  if (!isIataCode(origin)) {
    return {
      ok: false,
      error: `origin invalido: "${origin}". Esperado codigo IATA de 3 letras (A-Z), ex.: GRU`,
    };
  }

  if (destination === undefined || destination === null || String(destination).trim() === "") {
    return { ok: false, error: "destination e obrigatorio (codigo IATA de 3 letras, ex.: LIS)" };
  }
  if (!isIataCode(destination)) {
    return {
      ok: false,
      error: `destination invalido: "${destination}". Esperado codigo IATA de 3 letras (A-Z), ex.: LIS`,
    };
  }

  if (dateFrom !== undefined && dateFrom !== null && dateFrom !== "" && !isValidDate(dateFrom)) {
    return {
      ok: false,
      error: `dateFrom invalido: "${dateFrom}". Esperado data no formato YYYY-MM ou YYYY-MM-DD`,
    };
  }
  if (dateTo !== undefined && dateTo !== null && dateTo !== "" && !isValidDate(dateTo)) {
    return {
      ok: false,
      error: `dateTo invalido: "${dateTo}". Esperado data no formato YYYY-MM ou YYYY-MM-DD`,
    };
  }

  const normalized = {
    origin: normalizeIata(origin),
    destination: normalizeIata(destination),
  };
  if (dateFrom !== undefined && dateFrom !== null && dateFrom !== "") {
    normalized.dateFrom = String(dateFrom).trim();
  }
  if (dateTo !== undefined && dateTo !== null && dateTo !== "") {
    normalized.dateTo = String(dateTo).trim();
  }

  return { ok: true, normalized };
}
