// Cartões OG já desenhados em public/og/, origem-swap sem trocar foto do
// destino, e rótulo honesto da fonte do preço. Não remonta JPEG.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ogSharePathForOffer, hojeOgSharePath } from "../src/render/ogShare.js";
import { renderOfferPage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { OFFERS } from "../src/render/aondeContent.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";
import { createServer } from "../src/server.js";

const meta = (html, re) => (html.match(re) || [])[1] || "";
const ogImage = (html) => meta(html, /property="og:image" content="([^"]+)"/);
const twitterImage = (html) => meta(html, /name="twitter:image" content="([^"]+)"/);
const offerById = (id) => OFFERS.find((o) => o.id === id);

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-og-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("os cartoes OG ja existentes continuam no disco (nao foram refeitos)", async () => {
  const files = ["HOJE.jpg", "GRU-EZE.jpg", "GRU-FLN.jpg", "GIG-SSA.jpg", "GRU-LIS.jpg", "VCP-BUE.jpg"];
  for (const name of files) {
    const filePath = path.join(process.cwd(), "public", "og", name);
    assert.ok(existsSync(filePath), `${name} precisa existir em public/og/`);
    const info = await stat(filePath);
    assert.ok(info.size > 10_000, `${name} parece um stub, nao o cartao desenhado`);
  }
});

test("ogSharePathForOffer aponta para o jpg maiusculo quando o ficheiro existe", () => {
  assert.equal(ogSharePathForOffer("gru-fln"), "/og/GRU-FLN.jpg");
  assert.equal(ogSharePathForOffer("GIG-SSA"), "/og/GIG-SSA.jpg");
  assert.equal(ogSharePathForOffer("gru-eze"), "/og/GRU-EZE.jpg");
  assert.equal(ogSharePathForOffer("gru-lis"), "/og/GRU-LIS.jpg");
  assert.equal(ogSharePathForOffer("vcp-bue"), "/og/VCP-BUE.jpg");
  assert.equal(ogSharePathForOffer("gru-rec"), "", "sem cartao, nao inventa caminho");
  assert.equal(ogSharePathForOffer("../etc/passwd"), "");
  assert.equal(ogSharePathForOffer(""), "");
});

test("hojeOgSharePath e Buenos Aires, nunca Floripa nem Salvador", () => {
  const p = hojeOgSharePath();
  assert.ok(p === "/og/HOJE.jpg" || p === "/og/GRU-EZE.jpg", `inesperado: ${p}`);
  assert.doesNotMatch(p, /FLN|SSA/i);
});

test("GET /ofertas/gru-fln og:image e twitter:image usam /og/GRU-FLN.jpg", async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(`${base}/ofertas/gru-fln`)).text();
  assert.match(ogImage(html), /\/og\/GRU-FLN\.jpg/);
  assert.match(twitterImage(html), /\/og\/GRU-FLN\.jpg/);
  assert.ok(/^https?:\/\//.test(ogImage(html)), "og:image absoluto");
  assert.doesNotMatch(ogImage(html), /commons\.wikimedia\.org/);
});

test("GET /ofertas/gig-ssa og:image usa /og/GIG-SSA.jpg", async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(`${base}/ofertas/gig-ssa`)).text();
  assert.match(ogImage(html), /\/og\/GIG-SSA\.jpg/);
  assert.match(twitterImage(html), /\/og\/GIG-SSA\.jpg/);
  assert.doesNotMatch(ogImage(html), /commons\.wikimedia\.org/);
});

test("GET /hoje og:image e HOJE ou GRU-EZE, inclusive no dia de Floripa e Salvador", async (t) => {
  const base = await withServer(t);
  for (const dia of ["2026-08-21", "2026-08-22", "2026-08-23"]) {
    const html = await (await fetch(`${base}/hoje?dia=${dia}`)).text();
    const img = ogImage(html);
    assert.match(img, /\/og\/(HOJE|GRU-EZE)\.jpg/, `/hoje?dia=${dia} og:image=${img}`);
    assert.doesNotMatch(img, /FLN|SSA|Florian|Salvador|Barra da Lagoa|Pelourinho/i);
    assert.match(twitterImage(html), /\/og\/(HOJE|GRU-EZE)\.jpg/);
  }
});

test("GET /og/GRU-FLN.jpg e GET /og/GIG-SSA.jpg servem os cartoes existentes", async (t) => {
  const base = await withServer(t);
  for (const name of ["GRU-FLN.jpg", "GIG-SSA.jpg", "HOJE.jpg", "GRU-EZE.jpg"]) {
    const res = await fetch(`${base}/og/${name}`);
    assert.equal(res.status, 200, `${name} deve responder 200`);
    assert.match(res.headers.get("content-type") || "", /image\/jpeg/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 10_000, `${name} corpo pequeno demais`);
  }
});

test("GRU-FLN e GIG-SSA no WhatsApp de /hoje apontam para /ofertas/{id}, nao /hoje", () => {
  const fln = renderTodayPage(pacoteDoDia("2026-08-22"));
  const ssa = renderTodayPage(pacoteDoDia("2026-08-23"));
  assert.match(fln, /ofertas\/gru-fln\?utm_source=wa/);
  assert.match(ssa, /ofertas\/gig-ssa\?utm_source=wa/);
  const eze = renderTodayPage(pacoteDoDia("2026-08-21"));
  assert.match(eze, /\/hoje\?utm_source=wa/);
});

test("origem-swap marca a foto do destino e restaura data-dest-src; nao troca por cidade de origem", () => {
  const fln = renderOfferPage(offerById("gru-fln"), { related: [] });
  const ssa = renderOfferPage(offerById("gig-ssa"), { related: [] });

  assert.match(fln, /data-dest-photo/);
  assert.match(ssa, /data-dest-photo/);
  assert.match(fln, /data-dest-src="/);
  assert.match(fln, /Florian/i);
  assert.match(ssa, /Salvador|Pelourinho/i);

  const destSrcFln = meta(fln, /data-dest-src="([^"]+)"/);
  const destSrcSsa = meta(ssa, /data-dest-src="([^"]+)"/);
  assert.doesNotMatch(destSrcFln, /Recife|Marco Zero|Belo Horizonte|Avenida Paulista/i);
  assert.doesNotMatch(destSrcSsa, /Recife|Marco Zero|Belo Horizonte|Avenida Paulista/i);

  for (const html of [fln, ssa]) {
    assert.match(html, /img\[data-dest-photo\]/);
    assert.match(html, /data-dest-src/);
    assert.match(html, /el\.textContent=cidade/);
    assert.match(html, /data-origin-city-label/);
    assert.doesNotMatch(html, /getDestinationImage/);
    assert.doesNotMatch(html, /upload\.wikimedia\.org\/wikipedia\/commons\/.*Recife/);
  }
});

test("seletor Saindo de atualiza o rotulo da origem e esconde o preco; foto do destino fica", () => {
  const html = renderOfferPage(offerById("gru-fln"), { related: [] });
  assert.match(html, /data-origin-city-label>São Paulo</);
  assert.match(html, /data-origin-iata-label>GRU</);
  assert.match(html, /data-city="Recife"/);
  assert.match(html, /data-city="Belo Horizonte"/);
  assert.match(html, /el\.hidden=true/);
  assert.match(html, /novaOrigem!==/);
  assert.match(html, /img\[data-dest-photo\]/);
  assert.match(html, /Foto do destino fica do destino/);
});

test("oferta reservavel com fonte/data imprime o visto honesto; sem fonte nao inventa data", () => {
  const fln = renderOfferPage(offerById("gru-fln"), { related: [] });
  assert.match(fln, /Visto no Google Flights, 21 ago 2026/);
  const ssa = renderOfferPage(offerById("gig-ssa"), { related: [] });
  assert.match(ssa, /Visto no Google Flights, 21 ago 2026/);
  const eze = renderOfferPage(offerById("gru-eze"), { related: [] });
  assert.match(eze, /Visto no Google Flights, 21 ago 2026/);

  const lis = renderOfferPage(offerById("gru-lis"), { related: [] });
  assert.doesNotMatch(lis, /Visto no Google Flights/);
  assert.doesNotMatch(lis, /encontramos (hoje|esta manhã|esta manha)/i);
  assert.doesNotMatch(lis, /preço ao vivo|preco ao vivo/i);

  const hojeFln = renderTodayPage(pacoteDoDia("2026-08-22"));
  assert.match(hojeFln, /Visto no Google Flights, 21 ago 2026/);
  assert.match(hojeFln, /data-dest-photo/);
});

test("README lista GRU-FLN.jpg e GIG-SSA.jpg", async () => {
  const { readFile } = await import("node:fs/promises");
  const readme = await readFile(path.join(process.cwd(), "public", "og", "README.md"), "utf8");
  assert.match(readme, /GRU-FLN\.jpg/);
  assert.match(readme, /GIG-SSA\.jpg/);
  assert.match(readme, /\/ofertas\/gru-fln/);
  assert.match(readme, /\/ofertas\/gig-ssa/);
});
