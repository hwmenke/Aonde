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
  const forSsaJpg = existsSync(path.join(process.cwd(), "public", "og", "FOR-SSA.jpg"));
  assert.equal(
    ogSharePathForOffer("for-ssa"),
    forSsaJpg ? "/og/FOR-SSA.jpg" : "",
    "FOR-SSA.jpg so vira og:image quando o JPEG esta no disco; nunca herda GIG-SSA.jpg"
  );
  assert.equal(ogSharePathForOffer("../etc/passwd"), "");
  assert.equal(ogSharePathForOffer(""), "");
});

test("hojeOgSharePath segue o primeiro achado; HOJE.jpg so quando e Buenos Aires", () => {
  assert.equal(hojeOgSharePath("gru-fln"), "/og/GRU-FLN.jpg");
  assert.equal(hojeOgSharePath("gig-ssa"), "/og/GIG-SSA.jpg");
  assert.equal(hojeOgSharePath("gru-eze"), "/og/HOJE.jpg");
  assert.equal(hojeOgSharePath(""), "");
  assert.doesNotMatch(hojeOgSharePath("gru-fln"), /HOJE|GRU-EZE/);
  assert.doesNotMatch(hojeOgSharePath("gig-ssa"), /HOJE|GRU-EZE/);
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

test("GET /ofertas/for-ssa og:image nao usa o cartao do Rio", async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(`${base}/ofertas/for-ssa`)).text();
  assert.doesNotMatch(ogImage(html), /GIG-SSA\.jpg/);
  assert.doesNotMatch(twitterImage(html), /GIG-SSA\.jpg/);
  assert.doesNotMatch(ogImage(html), /HOJE\.jpg/);
});

test("GET /hoje og:image e o cartao do primeiro achado, nao HOJE.jpg se o hero nao e Buenos Aires", async (t) => {
  const base = await withServer(t);

  const fln = await (await fetch(`${base}/hoje?dia=2026-08-22`)).text();
  assert.match(ogImage(fln), /\/og\/GRU-FLN\.jpg/, "dia Floripa usa GRU-FLN.jpg");
  assert.match(twitterImage(fln), /\/og\/GRU-FLN\.jpg/);
  assert.doesNotMatch(ogImage(fln), /HOJE\.jpg|GRU-EZE\.jpg/);

  const ssa = await (await fetch(`${base}/hoje?dia=2026-08-23`)).text();
  assert.match(ogImage(ssa), /\/og\/GIG-SSA\.jpg/, "dia Salvador usa GIG-SSA.jpg");
  assert.match(twitterImage(ssa), /\/og\/GIG-SSA\.jpg/);
  assert.doesNotMatch(ogImage(ssa), /HOJE\.jpg|GRU-EZE\.jpg/);

  const eze = await (await fetch(`${base}/hoje?dia=2026-08-21`)).text();
  assert.match(ogImage(eze), /\/og\/(HOJE|GRU-EZE)\.jpg/, "dia Buenos Aires pode usar HOJE.jpg");

  // 24 e 27 ago: pagina e Salvador + Floripa (primeiro = gig-ssa). HOJE.jpg e Buenos Aires.
  for (const dia of ["2026-08-24", "2026-08-27"]) {
    const html = await (await fetch(`${base}/hoje?dia=${dia}`)).text();
    assert.match(ogImage(html), /\/og\/GIG-SSA\.jpg/, `${dia} Salvador+Floripa usa GIG-SSA.jpg`);
    assert.match(twitterImage(html), /\/og\/GIG-SSA\.jpg/);
    assert.doesNotMatch(ogImage(html), /HOJE\.jpg|GRU-EZE\.jpg|-story\.jpg/);
    assert.doesNotMatch(twitterImage(html), /HOJE\.jpg|-story\.jpg/);
  }

  const hoje = await (await fetch(`${base}/hoje`)).text();
  const pacote = pacoteDoDia();
  const firstId = pacote.itens[0] && pacote.itens[0].oferta && pacote.itens[0].oferta.id;
  assert.ok(firstId, "/hoje precisa ter um achado");
  if (firstId === "gru-eze") {
    assert.match(ogImage(hoje), /\/og\/(HOJE|GRU-EZE)\.jpg/);
  } else {
    assert.match(ogImage(hoje), new RegExp(`/og/${firstId.toUpperCase()}\\.jpg`));
    assert.doesNotMatch(ogImage(hoje), /HOJE\.jpg/);
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
  assert.match(fln, /ofertas%2Fgru-fln%3Futm_source%3Dwa/);
  assert.match(ssa, /ofertas%2Fgig-ssa%3Futm_source%3Dwa/);
  const eze = renderTodayPage(pacoteDoDia("2026-08-21"));
  assert.match(eze, /hoje%3Futm_source%3Dwa/);
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
  const forSsa = renderOfferPage(offerById("for-ssa"), { related: [] });
  assert.match(forSsa, /Visto no Aviasales, 28 ago 2026/);
  assert.match(forSsa, /USD \$242/);
  assert.doesNotMatch(forSsa, /R\$\s*287/);
  assert.doesNotMatch(forSsa, /R\$\s*242/);

  const lis = renderOfferPage(offerById("gru-lis"), { related: [] });
  assert.doesNotMatch(lis, /Visto no Google Flights/);
  assert.doesNotMatch(lis, /encontramos (hoje|esta manhã|esta manha)/i);
  assert.doesNotMatch(lis, /preço ao vivo|preco ao vivo/i);

  const hojeFln = renderTodayPage(pacoteDoDia("2026-08-22"));
  assert.match(hojeFln, /Visto no Google Flights, 21 ago 2026/);
  assert.match(hojeFln, /data-dest-photo/);
});

test("og:image e twitter:image nunca usam still 9:16 (*-story.jpg)", async (t) => {
  const base = await withServer(t);
  const pages = [
    "/ofertas/gru-fln",
    "/ofertas/gig-ssa",
    "/ofertas/gru-eze",
    "/hoje",
    "/hoje?dia=2026-08-22",
    "/hoje?dia=2026-08-23",
    "/hoje?dia=2026-08-24",
    "/hoje?dia=2026-08-27",
  ];
  for (const page of pages) {
    const html = await (await fetch(`${base}${page}`)).text();
    assert.doesNotMatch(ogImage(html), /-story\.jpg/i, `${page} og:image nao e story`);
    assert.doesNotMatch(twitterImage(html), /-story\.jpg/i, `${page} twitter:image nao e story`);
  }
  assert.doesNotMatch(ogSharePathForOffer("gru-fln"), /story/i);
  assert.doesNotMatch(hojeOgSharePath("gig-ssa"), /story/i);
  assert.equal(ogSharePathForOffer("gru-fln-story"), "", "id com -story nao vira og:image");
});

test("README documenta stills 9:16 e os creditos, sem usa-los como og:image", async () => {
  const { readFile } = await import("node:fs/promises");
  const readme = await readFile(path.join(process.cwd(), "public", "og", "README.md"), "utf8");
  assert.match(readme, /GRU-FLN\.jpg/);
  assert.match(readme, /GIG-SSA\.jpg/);
  assert.match(readme, /\/ofertas\/gru-fln/);
  assert.match(readme, /\/ofertas\/gig-ssa/);
  assert.match(readme, /GRU-FLN-story\.jpg/);
  assert.match(readme, /GIG-SSA-story\.jpg/);
  assert.match(readme, /Rodrigo Soldon, CC BY 2\.0/);
  assert.match(readme, /Ciroamado, CC BY-SA 4\.0/);
  assert.match(readme, /Paul R\. Burley, CC BY-SA 4\.0/);
  assert.match(readme, /Largo do Pelourinho Salvador 2019-9754/);
  assert.match(readme, /FOR-SSA\.jpg/);
  assert.match(readme, /Never GIG-SSA/);
  assert.match(readme, /Not og:image|Never `\*-story\.jpg`|Do not use the 9:16/i);
});

const FOR_SSA_JPG = path.join(process.cwd(), "public", "og", "FOR-SSA.jpg");
const forSsaJpgOnDisk = existsSync(FOR_SSA_JPG);

test(
  "GET /og/FOR-SSA.jpg serve o cartao landscape 1200x630",
  {
    skip: forSsaJpgOnDisk
      ? false
      : "FOR-SSA.jpg nao chegou neste checkout (so descricao); nao inventar JPEG",
  },
  async (t) => {
    const info = await stat(FOR_SSA_JPG);
    assert.ok(info.size > 10_000, "FOR-SSA.jpg parece um stub, nao o cartao desenhado");
    const base = await withServer(t);
    const res = await fetch(`${base}/og/FOR-SSA.jpg`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /image\/jpeg/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 10_000, "corpo pequeno demais");
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
  }
);

test("GET /ofertas/for-ssa og:image e /og/FOR-SSA.jpg quando o cartao existe", async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(`${base}/ofertas/for-ssa`)).text();
  assert.doesNotMatch(ogImage(html), /GIG-SSA\.jpg/);
  assert.doesNotMatch(twitterImage(html), /GIG-SSA\.jpg/);
  assert.doesNotMatch(ogImage(html), /HOJE\.jpg/);
  assert.doesNotMatch(ogImage(html), /-story\.jpg/);
  if (forSsaJpgOnDisk) {
    assert.match(ogImage(html), /\/og\/FOR-SSA\.jpg/);
    assert.match(twitterImage(html), /\/og\/FOR-SSA\.jpg/);
  }
});

const STORY_STILLS = ["GRU-FLN-story.jpg", "GIG-SSA-story.jpg"];
const storyStillsOnDisk = STORY_STILLS.every((name) =>
  existsSync(path.join(process.cwd(), "public", "og", name))
);

test(
  "GET /og/ serve os stills 9:16 (GRU-FLN-story.jpg, GIG-SSA-story.jpg)",
  { skip: storyStillsOnDisk ? false : "binaries 9:16 nao chegaram a este checkout; nao refazer" },
  async (t) => {
    for (const name of STORY_STILLS) {
      const filePath = path.join(process.cwd(), "public", "og", name);
      const info = await stat(filePath);
      assert.ok(info.size > 10_000, `${name} parece um stub`);
    }
    const base = await withServer(t);
    for (const name of STORY_STILLS) {
      const res = await fetch(`${base}/og/${name}`);
      assert.equal(res.status, 200, `${name} deve responder 200 via GET /og/`);
      assert.match(res.headers.get("content-type") || "", /image\/jpeg/);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 10_000, `${name} corpo pequeno demais`);
    }
  }
);
