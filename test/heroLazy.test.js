// Carrossel do hero: so o primeiro slide baixa na carga; os demais carregam
// pouco antes da vez deles (ou na hora, se a pessoa clicar na aba), e o slide
// so fica visivel depois que a foto chegou (sem camada vazia).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { renderHomePage, miniaturaCommons } from "../src/render/htmlRenderer.js";

function scriptDoCarrossel(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const s = scripts.find((x) => x.includes("data-hero"));
  assert.ok(s, "script do carrossel presente na home");
  return s;
}

function fakeImg({ lazy }) {
  const attrs = new Map(lazy ? [["data-src", "https://exemplo.test/foto.jpg"], ["data-srcset", "https://exemplo.test/foto.jpg 960w"], ["data-lazy", ""], ["src", "data:image/gif;base64,AAAA"]] : [["src", "https://exemplo.test/primeira.jpg"]]);
  const ouvintes = [];
  const img = {
    currentSrc: lazy ? "data:image/gif;base64,AAAA" : "https://exemplo.test/primeira.jpg",
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
    setAttribute: (k, v) => void attrs.set(k, String(v)),
    removeAttribute: (k) => void attrs.delete(k),
    addEventListener: (ev, fn) => void (ev === "load" && ouvintes.push(fn)),
    set src(v) { attrs.set("src", v); img.baixando = true; },
    get src() { return attrs.get("src"); },
    set srcset(v) { attrs.set("srcset", v); },
    baixando: false,
    termina() {
      img.baixando = false;
      img.currentSrc = attrs.get("src");
      ouvintes.slice().forEach((fn) => fn());
    },
  };
  return img;
}

function montaCenario({ reduz = false } = {}) {
  const relogio = { agora: 0, fila: [], prox: 1 };
  const agenda = (fn, ms, repete) => {
    const id = relogio.prox++;
    relogio.fila.push({ id, fn, em: relogio.agora + ms, ms, repete });
    return id;
  };
  const limpa = (id) => { relogio.fila = relogio.fila.filter((t) => t.id !== id); };
  const avanca = (ms) => {
    const fim = relogio.agora + ms;
    for (;;) {
      const proximo = relogio.fila.filter((t) => t.em <= fim).sort((a, b) => a.em - b.em)[0];
      if (!proximo) break;
      relogio.agora = proximo.em;
      if (proximo.repete) proximo.em += proximo.ms; else limpa(proximo.id);
      proximo.fn();
    }
    relogio.agora = fim;
  };

  const imgs = [fakeImg({ lazy: false }), fakeImg({ lazy: true }), fakeImg({ lazy: true })];
  const bgs = imgs.map((img, k) => {
    const ativo = new Set(k === 0 ? ["is-active"] : []);
    return {
      img,
      ativo,
      classList: { toggle: (c, on) => void (on ? ativo.add(c) : ativo.delete(c)) },
      querySelector: (sel) => {
        if (sel === "img[data-src]") return img.hasAttribute("data-src") ? img : null;
        if (sel === "img[data-lazy]") return img.hasAttribute("data-lazy") ? img : null;
        return null;
      },
    };
  });
  const tabs = imgs.map((_, k) => {
    const ativo = new Set(k === 0 ? ["is-active"] : []);
    const cliques = [];
    return {
      ativo,
      cliques,
      classList: { toggle: (c, on) => void (on ? ativo.add(c) : ativo.delete(c)) },
      setAttribute() {},
      addEventListener: (ev, fn) => void (ev === "click" && cliques.push(fn)),
    };
  });
  const vazio = () => [];
  const document = {
    querySelectorAll: (sel) => (sel === "[data-hero]" ? bgs : sel === "[data-hero-tab]" ? tabs : vazio()),
    querySelector: () => null,
    documentElement: { setAttribute() {} },
    addEventListener() {},
  };
  const window = {
    matchMedia: () => ({ matches: reduz, addEventListener() {} }),
    addEventListener() {},
  };
  const sandbox = {
    document, window, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: (fn, ms) => agenda(fn, ms, false),
    setInterval: (fn, ms) => agenda(fn, ms, true),
    clearTimeout: limpa,
    clearInterval: limpa,
    console,
  };
  return { sandbox, bgs, tabs, imgs, avanca };
}

function roda(cenario) {
  vm.runInNewContext(scriptDoCarrossel(renderHomePage({})), cenario.sandbox);
}

test("home: slides depois do primeiro não têm URL de foto no src (sem download na carga)", () => {
  const html = renderHomePage({});
  const imgs = [...html.matchAll(/<div class="hero-bg[^"]*" data-hero="(\d+)">\s*(<img\b[^>]*>)/g)].map((m) => ({ n: +m[1], tag: m[2] }));
  assert.ok(imgs.length > 1, "carrossel com mais de um slide");
  assert.match(imgs[0].tag, /\ssrc="https:\/\/upload\.wikimedia\.org\//, "primeiro slide carrega de verdade");
  assert.match(imgs[0].tag, /loading="eager"/);
  assert.match(imgs[0].tag, /fetchpriority="high"/);
  assert.doesNotMatch(imgs[0].tag, /data-lazy|data-src/);
  for (const { tag } of imgs.slice(1)) {
    assert.match(tag, /\ssrc="data:image\/gif;base64,/, "src é um pixel vazio");
    assert.doesNotMatch(tag, /\ssrcset=/, "sem srcset real até a vez do slide");
    assert.match(tag, /\sdata-src="https:\/\/upload\.wikimedia\.org\//);
    assert.match(tag, /\sdata-srcset="[^"]+ 330w, [^"]+ 960w/);
    assert.match(tag, /\sdata-lazy\b/);
    assert.match(tag, /onerror=/, "continua com fallback para placeholder");
  }
});

test("hero e cartões têm width/height declarados (sem salto de layout)", () => {
  const html = renderHomePage({});
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  assert.ok(imgs.length > 0);
  for (const img of imgs) {
    assert.match(img, /\swidth="\d+"/, img.slice(0, 120));
    assert.match(img, /\sheight="\d+"/, img.slice(0, 120));
  }
});

test("carrossel: nada além do slide 1 baixa na carga; o próximo vem ~2,5 s depois, antes de ser exibido", () => {
  const c = montaCenario();
  roda(c);
  assert.deepEqual(c.imgs.map((i) => i.baixando), [false, false, false]);
  c.avanca(2400);
  assert.equal(c.imgs[1].baixando, false);
  c.avanca(200);
  assert.equal(c.imgs[1].baixando, true, "slide 2 começa a baixar logo antes da sua vez");
  assert.equal(c.imgs[2].baixando, false, "slide 3 continua sem baixar");
  assert.equal(c.imgs[1].getAttribute("src"), "https://exemplo.test/foto.jpg");
});

test("carrossel: o slide só aparece depois que a foto chegou; a troca segue o tempo de 5,5 s", () => {
  const c = montaCenario();
  roda(c);
  c.avanca(2600);
  c.imgs[1].termina();
  c.avanca(2900);
  assert.ok(c.bgs[1].ativo.has("is-active"), "slide 2 ativo aos 5,5 s");
  assert.ok(!c.bgs[0].ativo.has("is-active"));
  assert.ok(c.tabs[1].ativo.has("is-active"));
  c.avanca(2600);
  assert.equal(c.imgs[2].baixando, true, "slide 3 é pedido ~2,5 s depois do slide 2 aparecer");
});

test("carrossel: sem foto pronta não troca para camada vazia; ao chegar, o slide entra", () => {
  const c = montaCenario();
  roda(c);
  c.avanca(5500);
  assert.ok(!c.bgs[1].ativo.has("is-active"), "foto ainda baixando: slide 1 continua na tela");
  assert.ok(c.bgs[0].ativo.has("is-active"));
  c.imgs[1].termina();
  assert.ok(c.bgs[1].ativo.has("is-active"), "ao chegar a foto, o slide entra");
});

test("carrossel: se a foto nunca chegar, o slide cede após 3 s para não travar o carrossel", () => {
  const c = montaCenario();
  roda(c);
  c.avanca(5500);
  assert.ok(!c.bgs[1].ativo.has("is-active"));
  c.avanca(2900);
  assert.ok(!c.bgs[1].ativo.has("is-active"));
  c.avanca(200);
  assert.ok(c.bgs[1].ativo.has("is-active"));
});

test("carrossel: clique na aba baixa o slide na hora e para o automático", () => {
  const c = montaCenario();
  roda(c);
  c.tabs[2].cliques.forEach((fn) => fn());
  assert.equal(c.imgs[2].baixando, true);
  assert.ok(c.tabs[2].ativo.has("is-active"), "aba muda na hora");
  assert.ok(!c.bgs[2].ativo.has("is-active"), "foto só entra quando chega");
  c.imgs[2].termina();
  assert.ok(c.bgs[2].ativo.has("is-active"));
  c.avanca(20000);
  assert.equal(c.imgs[1].baixando, false, "automático parado: nada mais é baixado");
  assert.ok(c.bgs[2].ativo.has("is-active"));
});

test("carrossel: com prefers-reduced-motion nada é baixado sozinho", () => {
  const c = montaCenario({ reduz: true });
  roda(c);
  c.avanca(30000);
  assert.deepEqual(c.imgs.map((i) => i.baixando), [false, false, false]);
});

test("miniaturaCommons: URL direta em larguras padrão do Wikimedia, só para JPG/PNG", () => {
  const u = "https://commons.wikimedia.org/wiki/Special:FilePath/Cidade%20de%20Paraty.jpg";
  assert.equal(
    miniaturaCommons(u, 900),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Cidade_de_Paraty.jpg/960px-Cidade_de_Paraty.jpg"
  );
  assert.match(miniaturaCommons(u, 300), /\/330px-/);
  assert.match(miniaturaCommons(u, 5000), /\/1280px-/);
  assert.equal(miniaturaCommons("https://commons.wikimedia.org/wiki/Special:FilePath/Mapa.svg", 900), "");
  assert.equal(miniaturaCommons("https://exemplo.com/a.jpg", 900), "");
  assert.equal(miniaturaCommons(`${u}?width=500`, 900), "");
});
