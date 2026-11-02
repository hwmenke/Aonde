import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as renderer from '../src/render/htmlRenderer.js';

test('source time is pure, preserves ISO and formats Sao Paulo including rollover', () => {
  const time = renderer.fontePrecoTempoHtml;
  assert.equal(typeof time, 'function');
  assert.equal(time('2026-08-28T17:05:00Z'), '<time datetime="2026-08-28T17:05:00Z">28 ago 2026, 14:05</time>');
  assert.equal(time('2026-08-28T14:05:00-03:00'), '<time datetime="2026-08-28T14:05:00-03:00">28 ago 2026, 14:05</time>');
  assert.equal(time('2026-08-28T01:05:00Z'), '<time datetime="2026-08-28T01:05:00Z">27 ago 2026, 22:05</time>');
  assert.equal(time('2026-08-28'), '<time datetime="2026-08-28">28 ago 2026</time>');
  for (const invalid of ['', null, 'garbage', '2026-02-30', '2026-02-30T12:00:00Z']) assert.equal(time(invalid), '');
});

const offer = (id, timestamp, extra = {}) => ({ id, destino: 'SSA', cidade: 'Salvador', preco: 'USD $242', fontePrecoEm: timestamp, ida: '2026-12-03', ...extra });
test('region selects up to three real matching active offers by source timestamp', () => {
  const offers = [offer('old', '2026-08-20'), offer('second', '2026-08-27'), offer('first', '2026-08-28T17:05:00Z'), offer('third', '2026-08-26', { destino: '', cidade: 'porto seguro' }), offer('departed', '2026-08-29', { ida: '2026-07-01' }), offer('other', '2026-08-29', { destino: 'REC', cidade: 'Recife' }), offer('invalid', 'bad'), offer('draft', '2026-08-29', { status: 'rascunho' })];
  const html = renderer.renderRegiaoPage('bahia', { offers, hoje: '2026-08-30' });
  assert.match(html, /Ofertas recentes para Bahia/);
  assert.ok(html.indexOf('/ofertas/first') < html.indexOf('/ofertas/second'));
  assert.ok(html.indexOf('/ofertas/second') < html.indexOf('/ofertas/third'));
  for (const id of ['old', 'departed', 'other', 'invalid', 'draft']) assert.ok(!html.includes(`/ofertas/${id}`));
  assert.match(html, /USD \$242/);
  assert.match(html, /Visto em <time datetime="2026-08-28T17:05:00Z">28 ago 2026, 14:05<\/time>/);
  assert.doesNotMatch(renderer.renderRegiaoPage('bahia'), /Ofertas recentes para/);
  assert.doesNotMatch(renderer.renderRegiaoPage('bahia', { offers: [offer('other', '2026-08-28', { destino: 'REC', cidade: 'Recife' })], hoje: '2026-08-30' }), /Ofertas recentes para/);
});

test('cards and detail retain source timestamp markup in both source field conventions', () => {
  for (const fields of [{ fontePrecoEm: '2026-08-28T17:05:00Z' }, { fonte_preco_em: '2026-08-28T17:05:00Z' }]) {
    const o = { ...offer('test', ''), ...fields, fontePreco: 'Fonte <real>' };
    for (const html of [renderer.renderOfferCard(o), renderer.renderOfferPage(o, { hoje: '2026-08-01' })]) {
      assert.match(html, /Visto no Fonte &lt;real&gt;, <time datetime="2026-08-28T17:05:00Z">28 ago 2026, 14:05<\/time>/);
    }
  }
});

test('region handler reads published store offers, preserves stored prices and public cache', async (t) => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createServer } = await import('../src/server.js');
  const dir = await mkdtemp(join(tmpdir(), 'aonde-region-'));
  const original = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  t.after(async () => {
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  await writeFile(join(dir, 'offers.json'), JSON.stringify([
    offer('stored', '2026-08-28T17:05:00-03:00', { status: 'publicada', ida: '2099-12-01' }),
    offer('unpublished', '2026-08-29', { status: 'rascunho', ida: '2099-12-01' }),
  ]));
  const server = createServer();
  const headers = {};
  let status, body;
  // Invoke the actual HTTP request listener without opening a sandbox-blocked socket.
  await server.listeners('request')[0]({ method: 'GET', url: '/regioes/bahia', headers: {} }, {
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    writeHead(code, values) { status = code; Object.assign(headers, values); },
    end(value) { body = String(value); },
  });
  assert.equal(status, 200);
  assert.match(headers['cache-control'], /public, max-age=300/);
  assert.match(body, /href="\/ofertas\/stored"/);
  assert.match(body, /USD \$242/);
  assert.match(body, /Visto em <time datetime="2026-08-28T17:05:00-03:00">28 ago 2026, 17:05<\/time>/);
  assert.doesNotMatch(body, /\/ofertas\/unpublished/);
});


test('invalid and missing source dates preserve source-only behavior without invented time', () => {
  for (const date of [undefined, 'unparseable']) {
    const html = renderer.renderOfferCard({ id: 'source-only', fonte_preco: 'Fonte', fonte_preco_em: date });
    assert.match(html, /<span class="of-fonte">Visto no Fonte<\/span>/);
    assert.doesNotMatch(html, /<time/);
  }
});
