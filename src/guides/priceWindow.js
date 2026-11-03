// Honest display of a guide's editorial price window.
// The label keeps its ORIGINAL wording/year (no roll-forward). Past windows are
// marked, not hidden. "visto em" only appears when the data carries a real
// observation date (window.vistoEm / window.seenAt); nothing is ever invented.
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Last calendar day named by a label like '14 – 21 abr 2026' (YYYY-MM-DD); null without explicit day+month+year. */
export function windowEnd(label) {
  const m = /(\d{1,2})\s*(?:de\s+)?([a-zç]{3})[a-zç]*\.?\s+(?:de\s+)?(\d{4})\s*$/i.exec(String(label || "").trim());
  if (!m) return null;
  const month = MESES.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  return d.getUTCMonth() === month ? d.toISOString().slice(0, 10) : null;
}

/** Real observation date from the data, or null. Accepts YYYY-MM-DD or full ISO. */
export function windowSeenAt(win) {
  const v = String((win && (win.vistoEm || win.seenAt)) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(v)) return null;
  const day = v.slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day ? v : null;
}

/**
 * @param {{label?:string}} win
 * @param {string} today YYYY-MM-DD
 * @returns {{label:string, ended:boolean, seenAt:string|null}|null}
 */
export function guideWindowStatus(win, today) {
  if (!win || !win.label) return null;
  const end = windowEnd(win.label);
  return { label: String(win.label), ended: Boolean(end && today && end < today), seenAt: windowSeenAt(win) };
}
