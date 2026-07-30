// Interpreta datas em pt-BR vindas do formulario de busca (campos "ida"/
// "volta" — ver searchCardHtml em src/render/htmlRenderer.js, ex.: "12 ago
// 2026") e gera datas-padrao quando o usuario nao informou uma reconhecivel.
// Nunca lanca excecao: entrada invalida vira null.

const MESES = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// "12 ago 2026", "12 de ago de 2026", "12 ago. 2026".
const PT_RE = /^(\d{1,2})\s*(?:de\s+)?([a-zçá-ú]{3,})\.?\s*(?:de\s+)?(\d{4})$/i;
// "12/08/2026" (dia/mes/ano, padrao BR).
const BR_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Converte uma data digitada pelo usuario (ISO "YYYY-MM-DD", "12 ago 2026"
 * ou "12/08/2026") para o formato YYYY-MM-DD exigido pela Amadeus. Retorna
 * null quando nao reconhece o formato ou a data e invalida no calendario
 * (ex.: "31/02/2026").
 */
export function parseDataPtBr(raw) {
  if (typeof raw !== "string") return null;
  const str = raw.trim();
  if (!str) return null;

  const iso = ISO_RE.exec(str);
  if (iso) {
    const [, y, m, d] = iso;
    return isValidDate(y, m, d) ? `${y}-${m}-${d}` : null;
  }

  const slash = BR_SLASH_RE.exec(str);
  if (slash) {
    const [, d, m, y] = slash;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    return isValidDate(y, mm, dd) ? `${y}-${mm}-${dd}` : null;
  }

  const pt = PT_RE.exec(str);
  if (pt) {
    const [, d, mesRaw, y] = pt;
    const chave = removeAcentos(mesRaw.slice(0, 3).toLowerCase());
    const mm = MESES[chave];
    if (!mm) return null;
    const dd = d.padStart(2, "0");
    return isValidDate(y, mm, dd) ? `${y}-${mm}-${dd}` : null;
  }

  return null;
}

function removeAcentos(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Confere se ano/mes/dia formam uma data real do calendario (rejeita "31/02").
function isValidDate(yStr, mStr, dStr) {
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Data padrao de ida quando o usuario nao informou uma reconhecivel: hoje +
 * `diasNoFuturo` dias (default 30), formatada YYYY-MM-DD. `hoje` e injetavel
 * para testes deterministicos.
 */
export function dataIdaPadrao(hoje = new Date(), diasNoFuturo = 30) {
  const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + diasNoFuturo);
  return toIso(base);
}

/**
 * Data padrao de volta a partir da ida: `dataIdaIso` + `diasDeViagem` dias
 * (default 7, mesmo estilo do periodo de exemplo "12 - 19 ago" do site).
 * Retorna null se `dataIdaIso` nao for uma data ISO valida.
 */
export function dataVoltaPadrao(dataIdaIso, diasDeViagem = 7) {
  const m = ISO_RE.exec(String(dataIdaIso || "").trim());
  if (!m || !isValidDate(m[1], m[2], m[3])) return null;
  const base = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  base.setUTCDate(base.getUTCDate() + diasDeViagem);
  return toIso(base);
}

function toIso(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
