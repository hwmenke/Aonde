import test from 'node:test';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import * as serverModule from '../src/server.js';
import { catalogoDescoberta } from '../src/render/descoberta.js';
import { renderGuidesIndexPage, renderRegiaoPage, renderResultsPage, renderHomePage } from '../src/render/htmlRenderer.js';
import * as renderer from '../src/render/htmlRenderer.js';
const catalog = catalogoDescoberta();
test('regional filters consolidate into hubs; other combinations use the index', () => {
  const hubSlugs = new Set(catalog.hubs.map(h => h.slug));
  // Regions below the hub threshold (< 3 guides) stay on the index: no thin hub pages.
  for (const r of catalog.regioes.filter(r => !hubSlugs.has(r.slug))) {
    assert.match(renderGuidesIndexPage({regiao:r.slug}), /rel="canonical" href="[^"]*\/guias"/);
  }
  for (const r of catalog.hubs) {
    assert.match(renderGuidesIndexPage({regiao:r.slug}), new RegExp(`rel="canonical" href="[^"]*/regioes/${r.slug}"`));
    const html = renderRegiaoPage(r.slug);
    assert.ok(html);
    assert.ok(html.includes(`${r.guias.length} roteiros`));
    for (const name of ['description', 'og:description']) assert.match(html, new RegExp(`(?:name|property)="${name}" content="[^"]*${r.nome}`));
  }
  for (const region of catalog.regioes) {
    for (const style of catalog.estilos) {
      const count = region.guias.filter(g => style.guias.includes(g)).length;
      const page = renderGuidesIndexPage({regiao:region.slug, estilo:style.slug});
      assert.equal(page.includes('content="noindex, follow"'), count <= 2);
      if (hubSlugs.has(region.slug)) assert.ok(page.includes(`href="/regioes/${region.slug}"`));
      else assert.ok(!page.includes(`href="/regioes/${region.slug}"`));
    }
  }
  const r = catalog.regioes[0];
  const combo = renderGuidesIndexPage({regiao:r.slug, estilo:catalog.estilos[0].slug});
  assert.match(combo, /rel="canonical" href="[^"]*\/guias"/);
  assert.match(combo, /name="robots" content="noindex, follow"/);
  assert.match(renderGuidesIndexPage({estilo:catalog.estilos[0].slug}), /rel="canonical" href="[^"]*\/guias"/);
});
test('regional descriptions fit 155 characters and retain complete guide names', () => {
  const describe = renderer.regiaoDescription;
  assert.equal(typeof describe, 'function');
  assert.equal(describe('Brasil', [{ breadcrumb: 'Salvador' }, { titulo: 'Recife' }]),
    '2 roteiros de 5 dias em Brasil: Salvador, Recife.');
  assert.equal(describe('Brasil', []), '0 roteiros de 5 dias em Brasil.');
  const guides = Array.from({ length: 12 }, () => ({ titulo: 'São Miguel dos Milagres' }));
  const description = describe('Brasil', guides);
  assert.ok(description.length <= 155);
  assert.equal(description, '12 roteiros de 5 dias em Brasil: São Miguel dos Milagres, São Miguel dos Milagres, São Miguel dos Milagres, São Miguel dos Milagres e mais 8');
  assert.equal(describe('Brasil', [{ titulo: 'Destino '.repeat(30).trim() }]), '1 roteiro de 5 dias em Brasil.');
  for (const hub of catalog.hubs) {
    const html = renderRegiaoPage(hub.slug);
    const description = html.match(/name="description" content="([^"]*)"/)[1];
    assert.ok(description.length <= 155);
    assert.ok(html.includes(`property="og:description" content="${description}"`));
  }
});
test('pure route policy limits caching to editorial reads without sensitive queries', () => {
  const policy = serverModule.htmlCachePolicy;
  assert.equal(typeof policy, 'function');
  for (const path of ['/guias','/guias/salvador','/regioes/brasil','/privacidade','/termos','/metodologia','/sobre']) assert.match(policy('GET', new URL(path,'http://local')), /^public,/);
  for (const path of ['/','/ofertas','/resultados','/busca','/alertas','/newsletter','/unsubscribe','/api/health','/guias?token=x','/guias?email=x','/guias?secret=x']) assert.equal(policy('GET',new URL(path,'http://local')), 'private, no-store');
  assert.equal(policy('POST',new URL('/guias','http://local')), 'private, no-store');
});
test('editorial HTTP validators, HEAD, sitemap and sensitive queries', async t => {
  const server = createServer();
  // Exercise the actual HTTP handler and ServerResponse without binding a port.
  const base = 'http://localhost';
  async function fetch(url, options = {}) {
    const req = new http.IncomingMessage(new PassThrough());
    req.url = url.slice(base.length);
    req.method = options.method || 'GET';
    req.headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key,value]) => [key.toLowerCase(),value]));
    const res = new http.ServerResponse(req);
    const socket = new PassThrough();
    const chunks = [];
    socket.on('data', chunk => chunks.push(chunk));
    res.assignSocket(socket);
    const finished = new Promise(resolve => res.on('finish', resolve));
    server.emit('request', req, res);
    await finished;
    const raw = Buffer.concat(chunks).toString();
    const body = raw.slice(raw.indexOf('\r\n\r\n') + 4);
    return { status: res.statusCode, headers: new Headers(res.getHeaders()), text: async () => body };
  }
  for (const path of ['/guias','/guias/salvador',`/regioes/${catalog.hubs[0].slug}`,'/privacidade','/termos']) {
    const first = await fetch(base+path);
    assert.match(first.headers.get('cache-control'), /^public, max-age=300, stale-while-revalidate=600$/);
    const tag = first.headers.get('etag');
    assert.match(tag,/^W\/"[a-f0-9]+"$/);
    const firstBody = await first.text();
    const miss = await fetch(base+path,{headers:{'If-None-Match':'W/"different"'}});
    assert.equal(miss.status,200);
    assert.equal(await miss.text(),firstBody);
    const star = await fetch(base+path,{headers:{'If-None-Match':'*'}});
    assert.equal(star.status,304);
    const compressed = await fetch(base+path,{headers:{'Accept-Encoding':'gzip','If-None-Match':tag}});
    assert.equal(compressed.status,304);
    assert.equal(compressed.headers.get('etag'),tag);
    assert.equal(compressed.headers.get('content-length'),null);
    for (const method of ['GET','HEAD']) {
      const cached = await fetch(base+path,{method,headers:{'If-None-Match':`"other", ${tag}`}});
      assert.equal(cached.status,304);
      assert.equal(await cached.text(),'');
    }
    const head = await fetch(base+path,{method:'HEAD'});
    assert.equal(head.headers.get('etag'),tag);
    assert.equal(await head.text(),'');
  }
  for (const path of ['/ofertas','/resultados','/guias?token=x','/guias?secret=x','/guias/missing-guide','/regioes/missing-region','/alertas','/api/health']) {
    const res = await fetch(base+path);
    assert.equal(res.headers.get('cache-control'),'private, no-store');
    assert.equal(res.headers.get('etag'),null);
    await res.text();
  }
  for (const path of ['/sitemap.xml', '/robots.txt']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(base + path, { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
      if (method === 'HEAD') assert.equal(await response.text(), '');
      const query = await fetch(base + path + '?x=1', { method });
      assert.equal(query.headers.get('cache-control'), 'private, no-store');
    }
    const post = await fetch(base + path, { method: 'POST' });
    assert.equal(post.headers.get('cache-control'), 'private, no-store');
  }
  const sitemap = await (await fetch(base+'/sitemap.xml')).text();
  for (const r of catalog.hubs) assert.ok(sitemap.includes(`/regioes/${r.slug}`));
  assert.doesNotMatch(sitemap,/guias\?/);
  const regional = await (await fetch(base+`/guias?regiao=${catalog.hubs[0].slug}&estilo=`)).text();
  assert.ok(regional.includes(`/regioes/${catalog.hubs[0].slug}"`));
  const extra = await (await fetch(base+`/guias?regiao=${catalog.hubs[0].slug}&q=other`)).text();
  assert.match(extra,/rel="canonical" href="[^"]*\/guias"/);
});
test('measured decoration is omitted on results and hidden on mobile and reduced motion', () => {
  assert.doesNotMatch(renderResultsPage(), /<div class="seasons3d"/);
  assert.ok(!renderHomePage({busca:{origem:'GRU'}}).includes('<div class="seasons3d"'));
  const home = renderHomePage();
  assert.match(home, /<div class="seasons3d"/);
  assert.match(home, /@media[^{}]*prefers-reduced-motion[^{}]*\{\s*\.seasons3d\s*\{\s*display:\s*none/);
  assert.match(home, /@media[^{}]*max-width:\s*640px[^{}]*\{\s*\.seasons3d\s*\{\s*display:\s*none/);
});
