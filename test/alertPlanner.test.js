import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { upsert } from '../src/store/offersStore.js';
import { matchAlerts } from '../src/newsletter/alertMatcher.js';

const offer = { id: 'published', status: 'publicada', origem: 'GRU', destino: 'LIS', preco: 'R$ 1.570,50', preco_centavos: 157050 };
const subscribers = [{ id: 'private-subscriber', email: 'private@example.com', double_optin_confirmed: true, optin_token: 'private-token' }];
const rules = [{ id: 'private-rule', subscriber_id: subscribers[0].id, origem: 'GRU', canais: ['email'] }];
function setup(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aonde-planner-'));
  const old = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  t.mock.method(globalThis, 'fetch', () => assert.fail('fetch must never be called'));
  t.after(() => { if (old === undefined) delete process.env.AONDE_DATA_DIR; else process.env.AONDE_DATA_DIR = old; rmSync(dir, { recursive: true, force: true }); });
  for (const [name, data] of [['subscribers.json', subscribers], ['alert_rules.json', rules]]) writeFileSync(path.join(dir, name), JSON.stringify(data));
  return dir;
}

test('current gap: publishing an offer with a matching rule leaves the queue empty', t => {
  const dir = setup(t);
  upsert(offer);
  assert.equal(matchAlerts(offer, { rules, subscribers }).length, 1);
  assert.equal(existsSync(path.join(dir, 'alert_queue.jsonl')), false);
});

const { previewAlerts, main } = await import('../scripts/planejar-alertas.js');
const { dispatchAlerts, planAlerts } = await import('../src/newsletter/alertMatcher.js');
const { hashEmail } = await import('../src/newsletter/subscriberStore.js');
const now = Date.parse('2026-11-07T12:00:00Z');
function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir).sort().map(name => [name, readFileSync(path.join(dir, name)).toString('base64')]));
}

test('preview preserves bytes, protects private data, excludes ineligible offers and matches dispatch', t => {
  const dir = setup(t);
  const fixtures = [{ ...offer, preco_centavos: undefined }, { ...offer, id: 'draft', status: 'rascunho' },
    { ...offer, id: 'expired', ida: '2020-01-01' }, { ...offer, id: 'no-price', preco: 'sob consulta', preco_centavos: undefined },
    { ...offer, id: undefined }];
  writeFileSync(path.join(dir, 'offers.json'), JSON.stringify(fixtures));
  writeFileSync(path.join(dir, 'alert_rules.json'), JSON.stringify([{ ...rules[0], canais: ['email', 'whatsapp'] }]));
  writeFileSync(path.join(dir, 'alert_queue.jsonl'), 'broken row\n');
  const before = snapshot(dir);
  const preview = previewAlerts({ agora: now });
  assert.deepEqual(snapshot(dir), before);
  assert.equal(preview.planned, 1);
  assert.equal(preview.offers[0].price, 157050);
  assert.equal(preview.offers[0].excluded['canal-nao-email'], 1);
  assert.equal(preview.offers[1].excluded['nao-publicada'], 1);
  assert.equal(preview.offers[2].excluded['oferta-inelegivel'], 1);
  assert.equal(preview.offers[3].excluded['preco-nao-verificavel'], 1);
  assert.equal(preview.offers[4].excluded['sem-id'], 1);
  const output = [];
  t.mock.method(console, 'log', (...args) => output.push(args.join(' ')));
  main([]);
  main(['--json']);
  for (const secret of [subscribers[0].email, subscribers[0].id, rules[0].id, subscribers[0].optin_token, hashEmail(subscribers[0].email)]) {
    assert.ok(!output.join('\n').includes(secret));
  }
  assert.deepEqual(snapshot(dir), before);
  writeFileSync(path.join(dir, 'alert_rules.json'), JSON.stringify(rules));
  assert.equal(dispatchAlerts([offer], { agora: now }).queued, preview.planned);
  const queued = snapshot(dir);
  assert.equal(previewAlerts({ agora: now }).planned, 0);
  assert.equal(previewAlerts({ agora: now }).cooldownSuppressed, 1);
  assert.deepEqual(snapshot(dir), queued);
  assert.equal(previewAlerts({ agora: now + 24 * 3600 * 1000 }).planned, 1);
});

test('missing data directory stays missing and CLI rejects unsupported arguments', t => {
  const dir = setup(t);
  process.env.AONDE_DATA_DIR = path.join(dir, 'missing', 'nested');
  const output = [];
  t.mock.method(console, 'log', (...args) => output.push(args.join(' ')));
  t.mock.method(console, 'error', (...args) => output.push(args.join(' ')));
  main(['--json']);
  assert.equal(JSON.parse(output[0]).planned, 0);
  assert.equal(existsSync(path.join(dir, 'missing')), false);
  for (const flag of ['--apply', '--unknown', 'argument']) {
    main([flag]);
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  }
  assert.match(output.join('\n'), /--apply não está disponível ainda/);
  assert.equal(existsSync(path.join(dir, 'missing')), false);
});

test('pure plan is deterministic and preserves inputs, including same-call cooldown', () => {
  const input = { offers: [offer, offer], rules, subscribers, queueItems: [], agora: now };
  const before = structuredClone(input);
  const result = planAlerts(input);
  assert.equal(result.queued, 1);
  assert.equal(result.suprimidos, 1);
  assert.deepEqual(planAlerts(input), result);
  assert.deepEqual(input, before);
});

test('email-only planning excludes a non-email-only rule without creating a queue', t => {
  const dir = setup(t);
  writeFileSync(path.join(dir, 'offers.json'), JSON.stringify([offer]));
  writeFileSync(path.join(dir, 'alert_rules.json'), JSON.stringify([{ ...rules[0], canais: ['whatsapp'] }]));
  const before = snapshot(dir);
  const result = previewAlerts({ agora: now });
  assert.equal(result.planned, 0);
  assert.equal(result.offers[0].excluded['canal-nao-email'], 1);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(existsSync(path.join(dir, 'alert_queue.jsonl')), false);
});

test('pure plan does not log invalid dates', t => {
  t.mock.method(console, 'warn', () => assert.fail('planner must not log'));
  assert.equal(planAlerts({ offers: [{ ...offer, ida: '2026-02-30' }], rules, subscribers, agora: now }).queued, 0);
});
