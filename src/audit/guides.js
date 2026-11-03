import { AEROPORTOS } from '../render/aeroportos.js';
const empty = value => value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
/** Last calendar day named by a label like '14 – 21 abr 2026'; null when no explicit year/month. */
export function windowEnd(label) {
  const m = /(\d{1,2})\s*(?:de\s+)?([a-zç]{3})[a-zç]*\.?\s+(?:de\s+)?(\d{4})\s*$/i.exec(String(label || '').trim());
  if (!m) return null;
  const month = MESES.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  return d.getUTCMonth() === month ? d.toISOString().slice(0, 10) : null;
}
export function auditGuides(guides, cities = AEROPORTOS, now = null) {
  const findings = [], ids = new Set();
  for (const [index, guide] of guides.entries()) {
    const g = guide || {}, id = String(g.id ?? index);
    const add = (field,message) => findings.push({kind:'guides',id,field,message});
    // cidade is optional: real guides carry the city inside opt.destName.
    for (const field of ['id','titulo','breadcrumb']) if (empty(g[field])) add(field,'Required field is missing or empty.');
    if (ids.has(g.id)) add('id','Duplicate guide id.');
    ids.add(g.id);
    for (const alternatives of [['tag','tags','regions','regiao'],['dias','days','itinerary']]) {
      const present = alternatives.filter(f => Object.hasOwn(g,f));
      for (const field of present.length ? present : [alternatives[0]]) if (empty(g[field])) add(field,'Required field is missing or empty.');
    }
    const end = now ? windowEnd(g.opt?.window?.label) : null;
    if (end && end < String(now).slice(0, 10)) add('opt.window.label', `Price window "${g.opt.window.label}" ended ${end}. The guide renderer (withFutureYear) shifts the label to the next year, so the page shows this observed price "${g.opt.window.price || ''}" under a future date it was never seen for.`);
    const name = g.opt?.destName;
    if (empty(name)) add('opt.destName','Required field is missing or empty.');
    else {
      const via = /^(.+?)\s*\(via (?:(.+?), )?([A-Z]{3})\)$/.exec(name);
      const direct = /^(.+?)\s*\(([A-Z]{3})\)$/.exec(name);
      const match = via ? [via[0], via[2] || '', via[3]] : direct;
      if (!match) add('opt.destName','Expected destination name followed by a three-uppercase-letter IATA code.');
      else if (match[1] && cities[match[2]] && normalize(match[1]) !== normalize(cities[match[2]])) add('opt.destName',`IATA ${match[2]} maps to ${cities[match[2]]}, not ${match[1].trim()}.`);
      if (match && !empty(g.cidade) && cities[match[2]] && normalize(g.cidade) !== normalize(cities[match[2]])) add('cidade',`City does not match IATA ${match[2]} (${cities[match[2]]}).`);
    }
  }
  return findings;
}
