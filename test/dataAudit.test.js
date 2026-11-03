import test from 'node:test';
import assert from 'node:assert/strict';
import { auditOfferDates } from '../src/audit/offerDates.js';
import { auditGuides } from '../src/audit/guides.js';
import { auditAffiliateLinks } from '../src/audit/affiliateLinks.js';
const now = '2026-11-03';
test('offer dates reject impossible dates, ordering, future observations and expiry before seen', () => {
  const findings = auditOfferDates([{id:'bad', ida:'2026-02-30', volta:'nonsense', departure_window_start:'2026-12-10', departure_window_end:'2026-12-01', seen_at:'2026-11-04', fonte_preco_em:'2026-11-05', expires_at:'2026-11-01'}, {id:'reverse', ida:'2026-10-10', volta:'2026-10-09'}], now);
  assert.equal(findings.length, 7);
  assert.ok(findings.every(f => Object.keys(f).join() === 'kind,id,field,message'));
  assert.deepEqual(auditOfferDates([{id:'ok', ida:'2028-02-29', volta:'2028-03-01'}], now), []);
});
const guide = {id:'rio', titulo:'Rio', breadcrumb:'Rio', cidade:'Rio de Janeiro', tag:'Praia', opt:{destName:'Rio de Janeiro (GIG)'}, dias:[{titulo:'Centro'}]};
test('guides check required fields, duplicates, IATA format and existing mapping', () => {
  assert.deepEqual(auditGuides([guide]), []);
  assert.ok(auditGuides([guide, {...guide, titulo:' ', cidade:'Recife', opt:{destName:'Recife (GIG)'}, dias:[]}]).length >= 4);
  assert.ok(auditGuides([{...guide, opt:{destName:'Rio (gig)'}}]).some(f => f.field === 'opt.destName'));
});
test('affiliate URLs check scheme, exact hosts, tracking and expired metadata without mutation', () => {
  const fixtures = [{id:'bad', url:'no URL'}, {id:'http',url:'http://tp.media/r'}, {id:'spoof',url:'https://tp.media.evil/r'}, {id:'old',url:'https://tp.media/r?marker=1&p=4114&u=https%3A%2F%2Fexample.com',expires_at:'2026-11-02'}];
  const before = JSON.stringify(fixtures);
  const findings = auditAffiliateLinks(fixtures, now);
  assert.equal(findings.length, 7);
  assert.equal(JSON.stringify(fixtures), before);
  assert.deepEqual(auditAffiliateLinks([{id:'ok',url:'https://tp.media/r?marker=1&p=4114&u=x'}], now), []);
});
test('guide airport gateway labels accept existing via syntax', () => {
  assert.deepEqual(auditGuides([{...guide, cidade:'Campo Grande', opt:{destName:'Bonito (via Campo Grande, CGR)'}}]), []);
  assert.deepEqual(auditGuides([{...guide, cidade:'Calama', opt:{destName:'Atacama (via CJC)'}}]), []);
});
test('offer display ranges validate both calendar endpoints without inventing travel years', () => {
  assert.equal(auditOfferDates([{id:'bad',datas:'28–30 fev'}],now).length, 1);
  assert.equal(auditOfferDates([{id:'bad',datas_sugeridas:'unknown'}],now).length, 1);
  assert.deepEqual(auditOfferDates([{id:'ok',datas:'27 set–3 out'}],now), []);
});

test('guide price windows that already ended are reported, yearless labels are not', async () => {
  const { auditGuides, windowEnd } = await import('../src/audit/guides.js');
  assert.equal(windowEnd('14 – 21 abr 2026'), '2026-04-21');
  assert.equal(windowEnd('3–10 set'), null);
  assert.equal(windowEnd('31 – 31 fev 2026'), null);
  const g = { id:'x', titulo:'X', breadcrumb:'X', tag:'t', dias:[1], opt:{ destName:'Recife (REC)', window:{ label:'14 – 21 abr 2026' } } };
  assert.ok(auditGuides([g], undefined, '2026-11-03').some(f => f.field === 'opt.window.label'));
  assert.ok(!auditGuides([g], undefined, '2026-04-21').some(f => f.field === 'opt.window.label'));
  assert.ok(!auditGuides([g]).some(f => f.field === 'opt.window.label'));
});
