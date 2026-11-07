import test from 'node:test';
import assert from 'node:assert/strict';
import { auditOfferDates } from '../src/audit/offerDates.js';
import { viagemAindaVale } from '../src/offers/elegibilidade.js';
import { matchAlerts } from '../src/newsletter/alertMatcher.js';

const dia = '2026-02-20';
const ctx = {
  dia,
  subscribers: [{ id: 'subscriber', double_optin_confirmed: true }],
  rules: [{ subscriber_id: 'subscriber', origem: 'GRU', destino: 'LIS', canais: ['email'] }],
};
const d2 = {
  id: 'd2', status: 'publicada', origem: 'GRU', destino: 'LIS', preco_centavos: 250000,
  ida: '2026-02-18T12:00:00Z', volta: '2026-02-19T12:00:00Z',
};

test('completed timestamp trip is ineligible after passing the date audit', () => {
  assert.deepEqual(auditOfferDates([d2], dia), []);
  assert.equal(viagemAindaVale(d2, dia), false);
});

test('completed timestamp trip produces no alert match', () => {
  const dateOnly = { ...d2, ida: '2026-02-18', volta: '2026-02-19' };
  assert.equal(matchAlerts(dateOnly, ctx).length, 0);
  assert.equal(matchAlerts(d2, ctx).length, 0);
});

for (const [name, fields, referenceDay, expected] of [
  ['future timestamp', { ida: '2026-02-21T12:00:00Z' }, dia, true],
  ['same UTC day timestamp', { ida: '2026-02-20T23:30:00Z' }, dia, true],
  ['offset timestamp reaches next UTC day', { ida: '2026-02-20T22:00:00-03:00' }, '2026-02-21', true],
  ['offset timestamp expires after its UTC day', { ida: '2026-02-20T22:00:00-03:00' }, '2026-02-22', false],
  ['offset timestamp reaches previous UTC day', { ida: '2026-02-20T00:30:00+03:00' }, dia, false],
  ['past date-only', { ida: '2026-02-19' }, dia, false],
  ['same date-only', { ida: dia }, dia, true],
  ['future date-only', { ida: '2026-02-21' }, dia, true],
  ['missing departure', {}, dia, true],
  ['dataIda fallback timestamp', { dataIda: '2026-02-19T12:00:00Z' }, dia, false],
  ['ida takes precedence', { ida: '2026-02-21', dataIda: '2026-02-19T12:00:00Z' }, dia, true],
  ['empty ida retains precedence', { ida: '', dataIda: '2026-02-19T12:00:00Z' }, dia, true],
  ['unparseable departure remains audit-rejected', { ida: 'unparseable' }, dia, false],
]) {
  test(name, () => {
    const { ida, volta, ...base } = d2;
    const offer = { ...base, ...fields };
    assert.equal(viagemAindaVale(offer, referenceDay), expected);
    assert.equal(matchAlerts(offer, { ...ctx, dia: referenceDay }).length, expected ? 1 : 0);
  });
}
