// Copia pt-BR que ainda saia sem acento, com jargao ou com ingles misturado.
// O sentido fica o mesmo: nao inventa promocao, preco nem prazo.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  renderHelpPage,
  renderMapPage,
  renderResultsPage,
  renderOffersPage,
  renderNewsletterStatusPage,
  renderUnsubscribePage,
  renderOfferPage,
} from "../src/render/htmlRenderer.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { subscribe, confirm } from "../src/newsletter/subscriberStore.js";
import { createServer } from "../src/server.js";

async function withDataDir(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-ptbr-"));
  process.env.AONDE_DATA_DIR = dir;
  t.after(async () => {
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("ajuda fala em vagas e no link de confirmacao, sem estoque nem double opt-in", () => {
  const html = renderHelpPage();
  assert.match(html, /controla as vagas e a tarifa/);
  assert.match(html, /caixa de spam/);
  assert.match(html, /pelo link que enviamos por e-mail, antes de receber qualquer alerta/);
  assert.doesNotMatch(html, /double opt-in/i);
  assert.doesNotMatch(html, /\bestoque\b/i);
});

test("mapa usa Explore o mundo e a preposicao pelo", () => {
  const html = renderMapPage();
  assert.match(html, /eyebrow eyebrow--green">Explore o mundo</);
  assert.match(html, /Navegue pelo mapa e clique num destino/);
  assert.doesNotMatch(html, /Explorar o mundo/);
  assert.doesNotMatch(html, /Navegue o mapa e/);
});

test("resultados evita jargao de venda e mantem o aviso por adulto", () => {
  const html = renderResultsPage({
    searched: true,
    pax: { adultos: 1, criancas: 1, bebes: 0 },
  });
  assert.match(html, /calcular o total da viagem/);
  assert.match(html, /Não vai comprar agora\?/);
  assert.doesNotMatch(html, /fechar a conta/);
  assert.doesNotMatch(html, /fechou negócio/);
});

test("ofertas: o titulo do alerta e uma frase, nao um fragmento", () => {
  const html = renderOffersPage([], {});
  assert.match(html, /Receba os achados de passagem antes que a tarifa mude/);
  assert.doesNotMatch(html, /antes que acabem/);
});

test("status da inscricao nao promete cancelar em um clique", () => {
  const html = renderNewsletterStatusPage({ ok: true, pendente: true, entrega: "email" });
  assert.match(html, /Cancelar são dois cliques, sem perguntas/);
  assert.doesNotMatch(html, /um clique/i);
});

test("cancelamento usa o mesmo exemplo de e-mail das outras fichas", () => {
  const html = renderUnsubscribePage({});
  assert.match(html, /placeholder="nome@exemplo\.com\.br"/);
  assert.doesNotMatch(html, /voce@exemplo/);
});

test("alerta sem rota chama o campo de cidade de saida", () => {
  const html = renderOfferPage({ cidade: "Lisboa", preco: "R$ 10" }, {});
  assert.match(html, /Cidade de saída/);
  assert.doesNotMatch(html, />Sua origem</);
});

test("erros de alerta e respostas HTTP visiveis sao pt-BR, sem double opt-in", async (t) => {
  await withDataDir(t);
  assert.equal(addAlertRule({ subscriberId: "ninguem" }).error, "Assinante não encontrado.");

  const pedido = subscribe({ email: "alerta@example.com", origem: "GRU" });
  assert.equal(pedido.ok, true);
  const pendente = addAlertRule({
    subscriberId: pedido.subscriber.id,
    origem: "GRU",
    destino: "LIS",
  });
  assert.equal(
    pendente.error,
    "Assinante não confirmou a inscrição pelo e-mail ou está descadastrado."
  );
  assert.equal(confirm(pedido.token).ok, true);

  assert.match(
    addAlertRule({ subscriberId: pedido.subscriber.id, origem: "12", destino: "LIS" }).error,
    /Origem inválida: "12"/
  );
  assert.match(
    addAlertRule({ subscriberId: pedido.subscriber.id, origem: "GRU", destino: "1" }).error,
    /Destino inválido: "1"/
  );
  assert.equal(
    addAlertRule({
      subscriberId: pedido.subscriber.id,
      origem: "GRU",
      destino: "LIS",
      precoAlvoCentavos: 0,
    }).error,
    "Preço-alvo inválido. Informe um valor em centavos maior que zero."
  );

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const rota = await fetch(`${base}/api/caminho-que-nao-existe`);
  assert.equal(rota.status, 404);
  assert.match((await rota.json()).error, /^Rota não encontrada: GET /);

  const metodo = await fetch(`${base}/api/newsletter/subscribe`);
  assert.equal(metodo.status, 405);
  assert.equal((await metodo.json()).error, "Método não permitido; use POST.");

  const img = await fetch(`${base}/og/nao-existe.jpg`);
  assert.equal(img.status, 404);
  assert.equal(await img.text(), "Imagem não encontrada");

  const nome = await fetch(`${base}/og/arquivo!.jpg`);
  assert.equal(nome.status, 400);
  assert.equal(await nome.text(), "Nome de arquivo inválido");

  const sub = subscribe({ email: "json@example.com", origem: "GRU" });
  const conf = await fetch(`${base}/api/newsletter/confirm?token=${sub.token}`, {
    headers: { accept: "application/json" },
  });
  assert.equal(conf.status, 200);
  assert.equal(
    (await conf.json()).message,
    "Inscrição confirmada! Você receberá nossos alertas de preço."
  );
});
