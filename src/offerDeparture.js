// Datas de ida das ofertas editoriais (`OFFERS[].datas`): intervalo pt-BR
// sem ano, tipo "12–24 out" ou "27 set–3 out". A ida e o primeiro dia.
//
// O ano e inferido pelo dia mais proximo de "hoje" no fuso do produto
// (America/Sao_Paulo — o mesmo de `chaveDoDia` em src/daily/dailyPick.js).
// Oferta cuja ida e anterior a hoje esta encerrada.
//
// `hoje` e injetavel (Date, instante ou "AAAA-MM-DD") para testes
// deterministicos. Entrada ilegivel nao encerra a oferta.

const FUSO_PRODUTO = process.env.AONDE_TIMEZONE || "America/Sao_Paulo";

const MESES = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PARTE_DIA_MES = /^(\d{1,2})(?:\s+([a-zçá-ú]{3,})\.?)?$/i;

function semAcento(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isoDate(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}

/**
 * "Hoje" como AAAA-MM-DD no fuso do produto. String so-dia passa intacta
 * (mesmo contrato de `chaveDoDia`).
 */
export function diaProduto(date = new Date()) {
  if (typeof date === "string") {
    const m = ISO_DIA.exec(date.trim());
    if (m) {
      const [, a, mes, dia] = m;
      const valida = new Date(`${a}-${mes}-${dia}T12:00:00Z`);
      if (!Number.isNaN(valida.getTime()) && valida.getUTCDate() === Number(dia)) {
        return `${a}-${mes}-${dia}`;
      }
    }
  }
  let d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) d = new Date();
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_PRODUTO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

function mesNumero(raw) {
  if (!raw) return null;
  const chave = semAcento(raw).slice(0, 3).toLowerCase();
  return MESES[chave] || null;
}

function parseDiaMes(parte) {
  if (!parte) return null;
  const m = PARTE_DIA_MES.exec(String(parte).trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = m[2] ? mesNumero(m[2]) : null;
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return null;
  return { dia, mes };
}

function partesDoIntervalo(datas) {
  const str = String(datas || "").trim().toLowerCase();
  if (!str) return null;
  const [idaRaw, voltaRaw] = str.split(/\s*[-–—]\s*/, 2);
  const ida = parseDiaMes(idaRaw);
  if (!ida) return null;
  if (!ida.mes && voltaRaw) {
    const volta = parseDiaMes(voltaRaw);
    if (volta && volta.mes) ida.mes = volta.mes;
  }
  if (!ida.mes) return null;
  return ida;
}

function anoMaisProximo(mes, dia, hojeIso) {
  const y = Number(hojeIso.slice(0, 4));
  const cands = [y - 1, y, y + 1].map((yy) => isoDate(yy, mes, dia)).filter(Boolean);
  if (!cands.length) return null;
  const t = Date.parse(`${hojeIso}T12:00:00Z`);
  let best = cands[0];
  let bestAbs = Infinity;
  for (const c of cands) {
    const abs = Math.abs(Date.parse(`${c}T12:00:00Z`) - t);
    if (abs < bestAbs) {
      best = c;
      bestAbs = abs;
    }
  }
  return best;
}

/** ISO AAAA-MM-DD da ida, ou null se `datas` nao for um intervalo reconhecivel. */
export function dataIdaIso(datas, hoje = new Date()) {
  const partes = partesDoIntervalo(datas);
  if (!partes) return null;
  const hojeIso = diaProduto(hoje);
  return anoMaisProximo(partes.mes, partes.dia, hojeIso);
}

function textoDatas(offer) {
  if (offer == null) return "";
  if (typeof offer === "string") return offer;
  return offer.datas || offer.datas_sugeridas || "";
}

/** True quando a ida ja passou (estritamente antes de hoje). */
export function ofertaEncerrada(offer, hoje = new Date()) {
  const ida = dataIdaIso(textoDatas(offer), hoje);
  if (!ida) return false;
  return ida < diaProduto(hoje);
}

export function ofertasAtivas(offers, hoje = new Date()) {
  if (!Array.isArray(offers)) return [];
  return offers.filter((o) => !ofertaEncerrada(o, hoje));
}
