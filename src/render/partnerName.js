// Display names only. Awin (affiliate network) and Amadeus (data API) are not
// consumer destinations, so they intentionally resolve to 'site parceiro'. This allowlist does not validate or change redirect URLs.
const PROVIDERS = Object.freeze({
  travelpayouts: 'Aviasales', aviasales: 'Aviasales', hurb: 'Hurb',
  passagensPromo: 'Passagens Promo', 'passagens-promo': 'Passagens Promo',
});
const HOSTS = Object.freeze({
  'tp.media': 'Aviasales', 'aviasales.com': 'Aviasales', 'www.aviasales.com': 'Aviasales',
  'hurb.com': 'Hurb', 'www.hurb.com': 'Hurb', 'clubehu.com.br': 'Hurb',
  'passagenspromo.com.br': 'Passagens Promo', 'www.passagenspromo.com.br': 'Passagens Promo',
  'parceirospromo.com.br': 'Passagens Promo',
});
export function partnerName(affiliateUrl, provider) {
  try {
    const host = new URL(affiliateUrl).hostname;
    if (Object.hasOwn(HOSTS, host)) return HOSTS[host];
  } catch { /* Unknown URL: use trusted provider metadata if available. */ }
  return Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : 'site parceiro';
}
