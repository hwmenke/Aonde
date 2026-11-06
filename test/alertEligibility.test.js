import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchAlerts, dispatchAlerts, setSenderImpl, resetSenderImpl } from '../src/newsletter/alertMatcher.js';
import { subscribe, confirm } from '../src/newsletter/subscriberStore.js';
import { addAlertRule } from '../src/newsletter/alertRules.js';

const dia = '2026-02-20';
const offer = { id: 'valid', origem: 'GRU', destino: 'LIS', preco_centavos: 100000,
  status: 'publicada', ida: dia, volta: '2026-02-25' };
const ctx = { dia, rules: [{ subscriber_id: 'sub', origem: 'GRU', destino: 'LIS', canais: ['email'] }],
  subscribers: [{ id: 'sub', double_optin_confirmed: true }] };
const excluded = [
  ['departure in the past', { ida: '2026-02-19' }],
  ['legacy departure in the past', { ida: undefined, dataIda: '2026-02-19' }],
  ['draft', { status: 'rascunho' }],
  ['nonexistent date', { ida: '2026-02-30' }],
  ['return before departure', { volta: '2026-02-19' }],
  ['impossible display range', { datas: '30–31 fev' }],
  ['future observation', { seen_at: '2026-02-21T12:00:00Z' }],
];

for (const [name, fields] of excluded) {
  test(`matchAlerts excludes ${name}`, () => {
    assert.deepEqual(matchAlerts({ ...offer, ...fields }, ctx), []);
  });
}

test('matchAlerts keeps same-day, future and yearless travel eligible', () => {
  for (const fields of [{}, { ida: '2026-02-21' }, { ida: undefined, volta: undefined, datas: '20–25 fev' }]) {
    assert.equal(matchAlerts({ ...offer, ...fields }, ctx).length, 1);
  }
  assert.deepEqual(matchAlerts(null, ctx), []);
});

test('dispatch filters before sender, queue and cooldown using its supplied UTC clock', (t) => {
  const previousDir = process.env.AONDE_DATA_DIR;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aonde-alert-eligibility-'));
  process.env.AONDE_DATA_DIR = dir;
  t.after(() => {
    resetSenderImpl();
    if (previousDir === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = previousDir;
    rmSync(dir, { recursive: true, force: true });
  });
  const pending = subscribe({ email: 'eligible@example.com', origem: 'GRU' });
  const sub = confirm(pending.token).subscriber;
  assert.equal(addAlertRule({ subscriberId: sub.id, origem: 'GRU', destino: 'LIS' }).ok, true);
  const sent = [];
  setSenderImpl((item) => sent.push(item));
  const agora = Date.parse(`${dia}T23:59:59Z`);
  const invalid = excluded.map(([, fields]) => ({ ...offer, ...fields }));
  assert.equal(dispatchAlerts(invalid, { agora }).queued, 0);
  assert.deepEqual(sent, []);
  const file = path.join(dir, 'alert_queue.jsonl');
  assert.equal(existsSync(file), false);

  const result = dispatchAlerts([...invalid, offer], { agora });
  assert.equal(result.queued, 1);
  assert.equal(result.suprimidos, 0);
  assert.equal(sent.length, 1);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].offerId, offer.id);
  assert.equal(lines[0].queuedAt, new Date(agora).toISOString());
  assert.equal(dispatchAlerts([offer], { agora }).suprimidos, 1);
  // At midnight the same travel date is past, even with cooldown disabled.
  assert.equal(dispatchAlerts([offer], { agora: agora + 1000, cooldownMs: 0 }).queued, 0);
  assert.equal(sent.length, 1);
});
