// Fotos diretas de upload.wikimedia.org vem com `Set-Cookie: WMF-Uniq`
// (SameSite=None): cookie de terceiro, que derruba "Boas praticas" no
// Lighthouse. <img crossorigin="anonymous"> faz o navegador pedir a foto em
// modo CORS sem credenciais (nao envia nem guarda cookie). O fallback via
// Special:FilePath redireciona sem cabecalho CORS, entao o onerror precisa
// tirar o atributo antes de tentar o fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { renderHomePage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";

const imgTags = (html) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const apontaParaUpload = (tag) => /(?:\ssrc|\sdata-src)="https:\/\/upload\.wikimedia\.org\//.test(tag);

function checaPagina(html, nome) {
  const diretas = imgTags(html).filter(apontaParaUpload);
  assert.ok(diretas.length > 0, `${nome}: esperava fotos diretas do Wikimedia`);
  for (const tag of diretas) {
    assert.match(tag, /\scrossorigin="anonymous"/, `${nome}: <img> do Wikimedia sem crossorigin: ${tag.slice(0, 120)}`);
    assert.match(tag, /removeAttribute\('crossorigin'\)/, `${nome}: onerror precisa tirar crossorigin antes do fallback`);
    assert.match(tag, /data-fb="https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//, `${nome}: fallback Special:FilePath preservado`);
  }
}

test("home: fotos diretas do Wikimedia (inclusive slides adiados) carregam sem cookie", () => {
  const html = renderHomePage();
  checaPagina(html, "home");
  assert.ok(imgTags(html).some((t) => /data-lazy/.test(t) && /crossorigin/.test(t)), "slide adiado tambem leva crossorigin");
});

test("/hoje: foto do dia carrega sem cookie", () => {
  checaPagina(renderTodayPage(pacoteDoDia("2026-08-23")), "hoje");
});

test("<img> que nao e do Wikimedia nao ganha crossorigin", () => {
  for (const html of [renderHomePage(), renderTodayPage(pacoteDoDia("2026-08-23"))]) {
    for (const tag of imgTags(html)) {
      if (apontaParaUpload(tag)) continue;
      assert.doesNotMatch(tag, /crossorigin/, `crossorigin so vale onde ha CORS garantido: ${tag.slice(0, 120)}`);
    }
  }
});

test("servidor: /, /hoje e /ofertas servem as fotos sem cookie", async (t) => {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-img-cookie-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const rota of ["/", "/hoje", "/ofertas"]) {
    const res = await fetch(base + rota);
    assert.equal(res.status, 200);
    checaPagina(await res.text(), rota);
  }
});
