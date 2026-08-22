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
    assert.ok(it.oferta.preco);
    // Oferta RESERVAVEL (com aviasalesUrl) aponta para /saida/{id}; sem, /ofertas/{id}.
    assert.ok(it.oferta.href.startsWith("/ofertas/") || it.oferta.href.startsWith("/saida/"));
    // Sigla de aeroporto vira nome de cidade tambem aqui.
    assert.ok(it.oferta.origemCidade && it.oferta.origemCidade !== it.oferta.origem);
    assert.ok(it.roteiro.bullets.length > 0);
  }
});

test("ofertas RESERVAVEIS (aviasalesUrl) no pacote do dia apontam para /saida/{id}", () => {
  // gru-eze tem aviasalesUrl, entao deve apontar para /saida/gru-eze para encurtar
  // o funil de conversao de /hoje (destino do WhatsApp).
  const p = pacoteDoDia("2026-08-21", { quantidade: 2 });
  const gruEze = p.itens.find((it) => it.oferta.id === "gru-eze");
  if (!gruEze) {
    // se gru-eze nao entrou no pacote desse dia, procura qualquer uma COM aviasalesUrl
    const bookable = p.itens.find((it) => it.oferta.__source?.aviasalesUrl);
    assert.ok(bookable, "ao menos uma oferta com aviasalesUrl deve entrar no pacote");
    assert.ok(bookable.oferta.href.startsWith("/saida/"), "oferta com aviasalesUrl deve apontar para /saida");
  } else {
    assert.equal(gruEze.oferta.href, "/saida/gru-eze", "gru-eze (aviasalesUrl) deve apontar para /saida/gru-eze");
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

test("21 de agosto de 2026 mostra GRU-EZE com roteiro de Buenos Aires (LOCK)", () => {
  // Lock explícito no código para garantir que o achado do dia de 21 ago 2026
  // seja GRU-EZE com o roteiro de Buenos Aires, não a rotação normal.
  const escolha = escolhaDoDia("2026-08-21", { quantidade: 1 });
  assert.equal(escolha.length, 1, "21 ago 2026 deve ter exatamente 1 oferta");
  assert.equal(escolha[0].offer.id, "gru-eze", "oferta do dia deve ser GRU-EZE");
  assert.ok(escolha[0].guide, "GRU-EZE deve ter roteiro associado");
  assert.equal(escolha[0].guide.id, "buenosaires", "roteiro deve ser o de Buenos Aires");
  
  // Verifica que o pacote do dia também reflete o lock.
  const pacote = pacoteDoDia("2026-08-21");
  assert.equal(pacote.dia, "2026-08-21");
  assert.equal(pacote.itens.length, 1);
  assert.equal(pacote.itens[0].oferta.id, "gru-eze");
  assert.equal(pacote.itens[0].roteiro.id, "buenosaires");
});

test("22 de agosto de 2026 mostra GRU-FLN com roteiro de Florianópolis (LOCK 2)", () => {
  // Lock 2: 22 ago 2026 mostra GRU-FLN com o roteiro de Florianópolis.
  const escolha = escolhaDoDia("2026-08-22", { quantidade: 1 });
  assert.equal(escolha.length, 1, "22 ago 2026 deve ter exatamente 1 oferta");
  assert.equal(escolha[0].offer.id, "gru-fln", "oferta do dia deve ser GRU-FLN");
  assert.ok(escolha[0].guide, "GRU-FLN deve ter roteiro associado");
  assert.equal(escolha[0].guide.id, "florianopolis", "roteiro deve ser o de Florianópolis");
  
  // Verifica que o pacote do dia também reflete o lock.
  const pacote = pacoteDoDia("2026-08-22");
  assert.equal(pacote.dia, "2026-08-22");
  assert.equal(pacote.itens.length, 1);
  assert.equal(pacote.itens[0].oferta.id, "gru-fln");
  assert.equal(pacote.itens[0].roteiro.id, "florianopolis");
});

test("23 de agosto de 2026 mostra GIG-SSA com roteiro de Salvador (LOCK 3)", () => {
  // Lock 3: 23 ago 2026 mostra GIG-SSA com o roteiro de Salvador.
  const escolha = escolhaDoDia("2026-08-23", { quantidade: 1 });
  assert.equal(escolha.length, 1, "23 ago 2026 deve ter exatamente 1 oferta");
  assert.equal(escolha[0].offer.id, "gig-ssa", "oferta do dia deve ser GIG-SSA");
  assert.ok(escolha[0].guide, "GIG-SSA deve ter roteiro associado");
  assert.equal(escolha[0].guide.id, "salvador", "roteiro deve ser o de Salvador");
  
  // Verifica que o pacote do dia também reflete o lock.
  const pacote = pacoteDoDia("2026-08-23");
  assert.equal(pacote.dia, "2026-08-23");
  assert.equal(pacote.itens.length, 1);
  assert.equal(pacote.itens[0].oferta.id, "gig-ssa");
  assert.equal(pacote.itens[0].roteiro.id, "salvador");
});

test("/hoje CTA para oferta RESERVAVEL menciona Aviasales ou reserva (honestidade do parceiro)", () => {
  // Ofertas com aviasalesUrl (GRU-EZE, GRU-FLN, GIG-SSA) devem mostrar CTA
  // honesto: "Reservar no Aviasales →" em vez de "Ver a oferta →".
  const html = renderTodayPage(pacoteDoDia("2026-08-21"));
  
  // GRU-EZE tem aviasalesUrl, entao o botao primario deve mencionar "Aviasales" ou "reserva".
  assert.match(html, /class="btn btn-green"[^>]*>.*?(Aviasales|reserva)/i, 
    "CTA primario de oferta bookable deve mencionar Aviasales ou reserva");
  
  // Deve apontar para /saida/ (ja coberto por teste anterior, mas vale reforcar).
  assert.match(html, /href="\/saida\/gru-eze"/);
  
  // O CTA ainda deve estar presente (nao foi removido).
  const ctaMatches = html.match(/class="btn btn-green"/g);
  assert.ok(ctaMatches && ctaMatches.length >= 1, "ao menos um CTA primario deve estar presente");
});
