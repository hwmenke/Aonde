// Robo do dia: escolhe 1-2 achados e monta o roteiro em topicos.
// O que importa garantir: escolha reproduzivel, rotacao que nao repete em dias
// seguidos, e conteudo tirado do roteiro editorial — nunca inventado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  chaveDoDia,
  escolhaDoDia,
  guiaDaOferta,
  roteiroEmBullets,
  pacoteDoDia,
} from "../src/daily/dailyPick.js";
import { renderTodayPage } from "../src/render/htmlRenderer.js";
import { OFFERS, GUIDES } from "../src/render/aondeContent.js";
import { createServer } from "../src/server.js";

const ids = (data, opts) => escolhaDoDia(data, opts).map((x) => x.offer.id).join(",");

test("a escolha do dia e reproduzivel", () => {
  assert.equal(ids("2026-07-26"), ids("2026-07-26"), "mesma data, mesma escolha");
  assert.notEqual(ids("2026-07-26"), ids("2026-07-27"), "datas diferentes, escolhas diferentes");
});

test("dois dias seguidos nunca mostram o mesmo par", () => {
  // Foi o defeito da primeira versao (sorteio por hash): o dia seguinte repetia
  // o par, so trocando a ordem.
  let anterior = null;
  for (let d = 1; d <= 40; d++) {
    const data = new Date(Date.UTC(2026, 7, d));
    const hoje = escolhaDoDia(data).map((x) => x.offer.id).sort().join(",");
    assert.notEqual(hoje, anterior, `dia ${d} repetiu o par do dia anterior`);
    anterior = hoje;
  }
});

test("a rotacao passa por todos os destinos elegiveis", () => {
  const vistos = new Set();
  for (let d = 0; d < 30; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const e of escolhaDoDia(data)) vistos.add(e.offer.id);
  }
  const elegiveis = OFFERS.filter((o) => guiaDaOferta(o)).map((o) => o.id);
  assert.ok(elegiveis.length >= 4, "precisa haver ofertas com roteiro para o robo usar");
  assert.deepEqual([...vistos].sort(), elegiveis.sort(), "em um mes todos entram na vez");
});

test("so entra oferta que TEM roteiro de verdade", () => {
  for (const { offer, guide } of escolhaDoDia("2026-07-26", { quantidade: 99 })) {
    assert.ok(guide, `${offer.id} entrou sem roteiro`);
    assert.ok(Array.isArray(guide.dias) && guide.dias.length, `${offer.id}: roteiro sem dias`);
  }
  // Oferta cujo destino nao tem roteiro fica de fora.
  const semGuia = { id: "xxx-yyy", cidade: "Cidade Que Nao Existe", origem: "GRU", destino: "XXX" };
  assert.equal(guiaDaOferta(semGuia), null);
  assert.equal(escolhaDoDia("2026-07-26", { offers: [semGuia] }).length, 0);
});

test("o casamento oferta <-> roteiro ignora acento e nome composto", () => {
  const recife = OFFERS.find((o) => o.cidade === "Recife");
  if (recife) {
    const g = guiaDaOferta(recife);
    assert.ok(g, "Recife deve casar com o roteiro de Recife e Porto de Galinhas");
    assert.match(g.breadcrumb, /Recife/);
  }
  assert.equal(guiaDaOferta({ cidade: "SALVADOR" }), GUIDES.salvador);
});

test("os topicos saem do roteiro editorial, sem inventar nada", () => {
  const g = GUIDES.salvador;
  const r = roteiroEmBullets(g);
  assert.equal(r.bullets.length, g.dias.length);
  for (const [i, b] of r.bullets.entries()) {
    const dia = g.dias[i];
    assert.equal(b.titulo, dia.titulo, "titulo copiado do roteiro");
    assert.equal(b.ondeComer, dia.restaurante || "", "restaurante copiado do roteiro");
    for (const nome of b.pontos) {
      assert.ok(
        dia.pontos.some((p) => p.nome === nome),
        `ponto "${nome}" nao existe no dia ${dia.n} do roteiro`
      );
    }
  }
  assert.ok(r.foto && r.foto.url, "leva a foto de capa do destino");
  assert.equal(r.href, "/guias/salvador");
});

test("o pacote do dia traz oferta + roteiro prontos para publicar", () => {
  const p = pacoteDoDia("2026-07-26", { quantidade: 2 });
  assert.equal(p.dia, "2026-07-26");
  assert.equal(p.itens.length, 2);
  for (const it of p.itens) {
    assert.ok(it.oferta.preco && it.oferta.href.startsWith("/ofertas/"));
    // Sigla de aeroporto vira nome de cidade tambem aqui.
    assert.ok(it.oferta.origemCidade && it.oferta.origemCidade !== it.oferta.origem);
    assert.ok(it.roteiro.bullets.length > 0);
  }
});

test("chaveDoDia aceita Date e string, sempre no fuso do produto", () => {
  // String so-dia e data de CALENDARIO: sai igual como entrou, sem conversao.
  assert.equal(chaveDoDia("2026-07-26"), "2026-07-26");
  // Date e INSTANTE: vira o dia correspondente no Brasil. Meio-dia para nao
  // depender do fuso em que o processo de teste roda.
  assert.equal(chaveDoDia(new Date("2026-07-05T12:00:00-03:00")), "2026-07-05", "zero a esquerda");
});

test("o dia do robo e o dia do BRASIL, nao o do servidor", () => {
  // ISSO ERA BUG: com o servidor em UTC, a partir de ~21h em Brasilia a pagina
  // /hoje ja mostrava a escolha do dia seguinte, com a data rotulada errada.
  // 2026-08-01T02:30Z ainda e 31 de julho no Brasil (UTC-3).
  assert.equal(chaveDoDia(new Date("2026-08-01T02:30:00Z")), "2026-07-31");
  // e o inverso: 03:30Z ja virou dia 1 la e aqui.
  assert.equal(chaveDoDia(new Date("2026-08-01T03:30:00Z")), "2026-08-01");
});

test("a pagina /hoje renderiza os topicos e nao promete preco garantido", () => {
  const html = renderTodayPage(pacoteDoDia("2026-07-26"));
  assert.match(html, /A escolha do dia/);
  assert.match(html, /class="hoje-card"/);
  assert.ok((html.match(/class="hoje-bullet"/g) || []).length >= 5, "topicos por dia");
  assert.match(html, /conferidos no site do parceiro/, "mantem o aviso de preco");
  assert.match(html, /rel="canonical" href="https:\/\/aonde\.com\.br\/hoje"/);
});

test("a pagina do dia aguenta um pacote vazio", () => {
  const html = renderTodayPage({ dia: "2026-07-26", itens: [] });
  assert.match(html, /class="feed-vazio"/, "estado vazio em vez de pagina quebrada");
  assert.ok(!/undefined|NaN/.test(html.replace(/<style[\s\S]*?<\/style>/g, "")));
});

test("GET /hoje responde a pagina do dia", async (t) => {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-hoje-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/hoje`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  assert.match(await res.text(), /A escolha do dia/);

  // Entra no sitemap, senao ninguem acha.
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /\/hoje</);
});
