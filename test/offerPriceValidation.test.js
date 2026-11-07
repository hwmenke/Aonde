import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toOffer } from '../src/offerAdapter.js';
import { upsert } from '../src/store/offersStore.js';
import { subscribe, confirm, hashEmail } from '../src/newsletter/subscriberStore.js';
import { addAlertRule } from '../src/newsletter/alertRules.js';
import { previewAlerts } from '../scripts/planejar-alertas.js';
import { precoCentavosOferta } from '../src/offers/price.js';
import { queuedOfferEligibility } from '../src/newsletter/alertEligibility.js';
import { dispatchAlerts, matchAlerts, planAlerts } from '../src/newsletter/alertMatcher.js';
import { processarFila } from '../src/newsletter/worker.js';
import { setFetchImpl, resetFetchImpl } from '../src/http.js';

function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aonde-price-'));
  const vars = { AONDE_DATA_DIR: dir, AONDE_EMAIL_PROVIDER: 'resend', AONDE_EMAIL_API_KEY: 'fake', AONDE_EMAIL_FROM: 'sender@example.com' };
  const previous = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  t.after(() => {
    resetFetchImpl();
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(dir, { recursive: true, force: true });
  });
  const sub = confirm(subscribe({ email: 'reader@example.com', origem: 'GRU' }).token).subscriber;
  addAlertRule({ subscriberId: sub.id, origem: 'GRU', precoAlvoCentavos: 80000, canais: ['email'] });
  const messages = [];
  setFetchImpl(async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true, status: 200, headers: new Map(), text: async () => '{}', json: async () => ({}) };
  });
  return { dir, sub, messages };
}
const agora = new Date('2030-01-01T12:00:00Z');
const offer = { id: 'price', origem: 'GRU', destino: 'REC', status: 'publicada', ida: '2030-02-01' };

for (const price of [-10000, 0, 1.5, Infinity, NaN, '10000', Number.MAX_SAFE_INTEGER + 1, false, true, {}, []]) {
  test(`invalid cents ${String(price)} rejected by store, matching, preview and worker`, async t => {
    const { dir, sub, messages } = setup(t);
    const malformed = { ...offer, preco_centavos: price, preco: 'R$ 100' };
    assert.throws(() => upsert(malformed), { code: 'OFERTA_PRECO_INVALIDO' });
    // Legacy malformed records bypass upsert. JSON cannot represent Infinity/NaN;
    // verify those directly too, before their persisted representation becomes null.
    assert.equal(precoCentavosOferta(malformed), null);
    const rules = [{ subscriber_id: sub.id, origem: 'GRU', preco_alvo_centavos: 80000 }];
    assert.deepEqual(matchAlerts(malformed, { rules, subscribers: [sub], dia: '2030-01-01' }), []);
    assert.deepEqual(matchAlerts(malformed, { rules: rules.map(rule => ({ ...rule, preco_alvo_centavos: null })), subscribers: [sub], dia: '2030-01-01' }), []);
    assert.equal(planAlerts({ offers: [malformed], rules, subscribers: [sub], agora: agora.getTime() }).queued, 0);
    assert.equal(dispatchAlerts([malformed], { agora: agora.getTime() }).queued, 0);
    // Non-finite numbers become absent prices in JSON; omit the valid display
    // fallback so the persisted record still has no verifiable price.
    const persisted = typeof price === 'number' && !Number.isFinite(price)
      ? { ...malformed, preco: null } : malformed;
    writeFileSync(path.join(dir, 'offers.json'), JSON.stringify([persisted]));
    const preview = previewAlerts({ agora: agora.getTime() });
    assert.equal(preview.planned, 0);
    assert.deepEqual(preview.offers[0].excluded, { 'preco-nao-verificavel': 1 });
    const item = { id: 'legacy', offerId: offer.id, canal: 'email', subscriberEmailHash: hashEmail(sub.email) };
    assert.equal(queuedOfferEligibility(item, sub, { today: '2030-01-01' }).reason, 'preco-nao-verificavel');
    writeFileSync(path.join(dir, 'alert_queue.jsonl'), JSON.stringify(item) + '\n');
    const result = await processarFila({ agora });
    assert.equal(result.enviados, 0);
    assert.equal(result.pulados, 1);
    assert.equal(messages.length, 0);
  });
}

test('absent-price drafts save and update; valid positive price matches and sends', async t => {
  const { messages } = setup(t);
  const draft = upsert({ id: 'draft', status: 'rascunho' });
  assert.equal(draft.preco_centavos, undefined);
  assert.equal(upsert({ id: 'draft', destino: 'REC' }).status, 'rascunho');
  const stored = upsert({ ...offer, preco_centavos: 70000 });
  assert.throws(() => upsert({ id: offer.id, preco_centavos: 0 }), { code: 'OFERTA_PRECO_INVALIDO' });
  assert.equal(previewAlerts({ agora: agora.getTime() }).planned, 1);
  assert.equal(dispatchAlerts([stored], { agora: agora.getTime() }).queued, 1);
  assert.equal((await processarFila({ agora })).enviados, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /Preço encontrado: R\$ 700\n/);
});

test('parsed display prices must also be positive safe integer cents', () => {
  for (const preco of ['R$ 0', 'R$ 0,00', '-R$ 100', 'R$ 9007199254740992']) {
    assert.equal(precoCentavosOferta({ preco }), null);
  }
  assert.equal(precoCentavosOferta({ preco: 'R$ 1.570,50' }), 157050);
  assert.equal(precoCentavosOferta({ preco: 'R$ 0,01' }), 1);
});

test('monitor-shaped null-price drafts save and update without alerting or sending', async t => {
  const { sub, dir, messages } = setup(t);
  const draft = toOffer({ origin: 'GRU', destination: 'REC', price: null });
  assert.equal(draft.preco_centavos, null);
  assert.equal(upsert(draft).preco_centavos, null);
  assert.equal(upsert({ id: draft.id, cia: 'GOL' }).preco_centavos, null);
  // Also exercise an update merged onto a legacy null-price record.
  writeFileSync(path.join(dir, 'offers.json'), JSON.stringify([{ ...offer, preco_centavos: null }]));
  const stored = upsert({ id: offer.id, cia: 'GOL' });
  assert.equal(stored.preco_centavos, null);
  assert.equal(precoCentavosOferta(stored), null);
  assert.deepEqual(matchAlerts(stored, {
    rules: [{ subscriber_id: sub.id, origem: 'GRU', preco_alvo_centavos: 80000 }],
    subscribers: [sub], dia: '2030-01-01',
  }), []);
  assert.equal(previewAlerts({ agora: agora.getTime() }).planned, 0);
  assert.equal(dispatchAlerts([stored], { agora: agora.getTime() }).queued, 0);
  const item = { id: 'legacy-null', offerId: offer.id, canal: 'email', subscriberEmailHash: hashEmail(sub.email) };
  assert.equal(queuedOfferEligibility(item, sub, { today: '2030-01-01' }).reason, 'preco-nao-verificavel');
  writeFileSync(path.join(dir, 'alert_queue.jsonl'), JSON.stringify(item) + '\n');
  const result = await processarFila({ agora });
  assert.equal(result.enviados, 0);
  assert.equal(result.pulados, 1);
  assert.equal(messages.length, 0);
});

test('null and undefined cents fall back to the display price', () => {
  for (const preco_centavos of [null, undefined]) {
    assert.equal(precoCentavosOferta({ preco_centavos, preco: 'R$ 500' }), 50000);
    assert.equal(precoCentavosOferta({ preco_centavos, preco: 'R$ 0' }), null);
  }
});
