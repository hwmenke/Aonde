import { dateValue } from './offerDates.js';
// No host allowlists exist in partners/* or manualLinkRegistry.js. Only these
// explicit generated link hosts are verifiable (travelpayouts.js); do not infer
// domains for opaque manual links or Awin API responses.
const generatedHosts = new Set(['tp.media', 'www.aviasales.com']);
export function auditAffiliateLinks(links, now) {
  const findings = [];
  for (const [index, link] of links.entries()) {
    const id = String(link.id ?? index);
    const add = (field,message) => findings.push({kind:'affiliateLinks',id,field,message});
    let url;
    try { url = new URL(link.url); } catch { add('url','Invalid URL.'); }
    if (url) {
      if (url.protocol !== 'https:') add('url','HTTPS is required.');
      if (!generatedHosts.has(url.hostname)) add('url','Host cannot be verified: no existing partner allowlist or generated-link host match.');
      if (url.hostname === 'tp.media') for (const param of ['marker','p','u']) if (!url.searchParams.get(param)?.trim()) add(`url.${param}`,`Missing required Travelpayouts tracking parameter: ${param}.`);
    }
    for (const field of ['expires_at','expiresAt','expiry']) {
      if (link[field] == null || link[field] === '') continue;
      const expiry = dateValue(link[field]);
      if (!Number.isFinite(expiry)) add(field,'Invalid expiry date.');
      else if (expiry < dateValue(now)) add(field,'Link expiry has passed.');
    }
  }
  return findings;
}
