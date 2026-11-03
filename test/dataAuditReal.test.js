import test from 'node:test';
import assert from 'node:assert/strict';
import { listOffers } from '../src/store/offersStore.js';
import { OFFERS } from '../src/render/aondeContent.js';
import { getConfig } from '../src/config.js';
import { auditOfferDates } from '../src/audit/offerDates.js';
import { auditAffiliateLinks } from '../src/audit/affiliateLinks.js';

const now = new Date().toISOString();
const offers = [...listOffers(), ...OFFERS];

test('CI: dados reais de ofertas não têm achados de datas', () => {
  const findings = auditOfferDates(offers, now);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

test('CI: links reais de afiliados não têm achados', () => {
  const config = getConfig();
  const links = offers.filter(o => o?.affiliate_url).map(o => ({ ...o, url: o.affiliate_url }));
  for (const [partner, settings] of [['hurb', config.hurb], ['passagens-promo', config.passagensPromo]]) {
    for (const [id, url] of Object.entries(settings?.trackedLinksRegistry || {})) {
      links.push({ id: `${partner}:${id}`, url });
    }
    if (settings?.trackedLink) links.push({ id: `${partner}:fallback`, url: settings.trackedLink });
  }
  const findings = auditAffiliateLinks(links, now);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});
