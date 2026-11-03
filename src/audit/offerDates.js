// Strict calendar validation: Date.parse alone normalizes February 30.
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return NaN;
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return NaN;
  return Date.parse(value.length === 10 ? `${day}T00:00:00Z` : value);
}

// Yearless display ranges can be checked for impossible month/day pairs, but
// cannot establish a travel year or trip ordering. Leap day remains possible.
function validDisplayRange(value) {
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const match = /^(\d{1,2})(?:\s+([a-z]{3}))?\s*[-–—]\s*(\d{1,2})\s+([a-z]{3})$/i.exec(String(value).trim());
  if (!match) return false;
  return [[match[1], match[2] || match[4]], [match[3], match[4]]].every(([day, month]) => {
    const m = months.indexOf(month.toLowerCase()) + 1;
    return Number.isFinite(dateValue(`2000-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`));
  });
}

// Deliberately independent of eligibility; callers must supply their clock.
export function auditOfferDates(offers, now) {
  const findings = [];
  const fields = ['ida','volta','dataIda','dataVolta','departDate','returnDate','departure_at','return_at','departure_window_start','departure_window_end','dateFrom','dateTo','seen','seen_at','foundAt','found_at','fonte_preco_em','expires_at','expiresAt','expiry','published_at','publicadoEm','created_at','updated_at'];
  for (const [index, offer] of offers.entries()) {
    if (!offer) continue;
    const id = String(offer.id ?? index);
    const add = (field, message) => findings.push({kind:'offerDates', id, field, message});
    const dates = {};
    for (const field of ['datas','datas_sugeridas']) {
      if (offer[field] != null && offer[field] !== '' && !validDisplayRange(offer[field])) add(field, 'Invalid or nonexistent calendar date in display range (year unspecified).');
    }
    for (const field of fields) {
      if (offer[field] == null || offer[field] === '') continue;
      dates[field] = dateValue(offer[field]);
      if (!Number.isFinite(dates[field])) add(field, 'Invalid or nonexistent calendar date.');
    }
    for (const [start,end] of [['ida','volta'],['dataIda','dataVolta'],['departDate','returnDate'],['departure_at','return_at'],['departure_window_start','departure_window_end'],['dateFrom','dateTo']]) {
      if (dates[end] < dates[start]) add(end, `Date precedes ${start}.`);
    }
    for (const field of ['seen','seen_at','foundAt','found_at','fonte_preco_em']) {
      if (dates[field] > dateValue(now)) add(field, 'Observation is in the future relative to now.');
    }
    for (const expiry of ['expires_at','expiresAt','expiry']) {
      const seen = ['seen','seen_at','foundAt','found_at','fonte_preco_em'].find(f => Number.isFinite(dates[f]));
      if (seen && dates[expiry] < dates[seen]) add(expiry, `Expiry precedes ${seen}.`);
    }
  }
  return findings;
}
