// Read-only CLI. No partner API calls, writes, or eligibility integration.
import { auditOfferDates } from '../src/audit/offerDates.js';
import { auditGuides } from '../src/audit/guides.js';
import { auditAffiliateLinks } from '../src/audit/affiliateLinks.js';

const nowArg = process.argv.find(a => a.startsWith('--now='));
const now = nowArg?.slice(6) || new Date().toISOString();
const findings = [], sources = {};
const load = async (name, fn, fallback) => {
  try { const result = await fn(); sources[name] = Array.isArray(result) ? result.length : Object.keys(result).length; return result; }
  catch (error) { findings.push({kind:'loading',id:name,field:'source',message:error.message}); sources[name] = null; return fallback; }
};
try {
  const stored = await load('offersStore', async () => (await import('../src/store/offersStore.js')).listOffers(), []);
  const editorial = await load('editorialOffers', async () => (await import('../src/render/aondeContent.js')).OFFERS, []);
  const guides = await load('guides', async () => Object.values((await import('../src/render/aondeContent.js')).GUIDES), []);
  const config = await load('configuration', async () => (await import('../src/config.js')).getConfig(), {});
  const offers = [...stored, ...editorial];
  const links = offers.filter(o => o?.affiliate_url).map(o => ({...o,url:o.affiliate_url}));
  for (const [partner, settings] of [['hurb',config.hurb],['passagens-promo',config.passagensPromo]]) {
    const registry = Object.entries(settings?.trackedLinksRegistry || {});
    sources[`${partner}Registry`] = registry.length;
    for (const [id,url] of registry) links.push({id:`${partner}:${id}`,url});
    if (settings?.trackedLink) links.push({id:`${partner}:fallback`,url:settings.trackedLink});
  }
  sources.affiliateLinks = links.length;
  findings.push(...auditOfferDates(offers,now), ...auditGuides(guides, undefined, now), ...auditAffiliateLinks(links,now));
} catch (error) {
  findings.push({kind:'loading',id:'audit',field:'execution',message:error.message});
}
const counts = Object.fromEntries(['offerDates','guides','affiliateLinks','loading'].map(kind => [kind,findings.filter(f => f.kind === kind).length]));
console.log(`# Data audit — ${now}\n\nReport-only; exit code 0. No data or runtime changes.\n`);
console.log('Sources: ' + JSON.stringify(sources) + '\n');
console.log('Clock: date-only now means 00:00:00 UTC. Yearless editorial display ranges are checked for calendar possibility only; no travel year is inferred. Host validation is limited to explicit Travelpayouts generated hosts; the specified modules contain no host allowlists.\n');
console.log('| Check | Findings |\n| --- | ---: |');
for (const [kind,count] of Object.entries(counts)) console.log(`| ${kind} | ${count} |`);
for (const kind of Object.keys(counts)) {
  console.log(`\n## ${kind} (${counts[kind]})\n`);
  for (const f of findings.filter(f => f.kind === kind)) console.log(`- **${f.id}** · ${f.field}: ${f.message}`);
  if (!counts[kind]) console.log('No findings.');
}
console.log('\n## JSON summary\n\n```json\n' + JSON.stringify({now,sources,counts,total:findings.length,findings},null,2) + '\n```');
process.exitCode = 0;
