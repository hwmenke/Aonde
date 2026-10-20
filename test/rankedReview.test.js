import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../src/server.js";
import { upsert } from "../src/store/offersStore.js";
import { toOffer } from "../src/offerAdapter.js";
import { viagemAindaVale } from "../src/offers/elegibilidade.js";
import { renderOffersPage } from "../src/render/htmlRenderer.js";
import { mapAmadeusOffersToFlights } from "../src/flights/mapAmadeus.js";
import { registrarEvento, resetarEventosMemoria } from "../src/analytics/events.js";
import { subscribe, confirm, confirmPendingRule, getSubscriberByEmail } from "../src/newsletter/subscriberStore.js";

async function dadosTemporarios(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-ranked-"));
  const anterior = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  t.after(async () => {
    if (anterior === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = anterior;
    resetarEventosMemoria();
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

// Exercita o mesmo handler de produção, sem depender de portas TCP disponíveis.
async function request(server, url, { method = "GET", headers = {} } = {}) {
  const req = { url, method, headers, socket: { remoteAddress: "127.0.0.1" } };
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) {
      this.status = status;
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    },
    end(body) { this.body = body ? body.toString() : ""; },
  };
  await server.listeners("request")[0](req, res);
  return res;
}

test("retirada bloqueia catálogo editorial na home, feed, erros e relacionados", async (t) => {
  await dadosTemporarios(t);
  for (const id of ["gru-lis", "cnf-fln"]) upsert({ id, status: "retirada" });
  const server = createServer();
  for (const url of ["/", "/ofertas", "/ofertas/inexistente", "/saida/inexistente", "/guias/inexistente", "/ofertas/gig-ssa"]) {
    const res = await request(server, url);
    assert.equal(res.status, url.includes("inexistente") ? 404 : 200, url);
    assert.doesNotMatch(res.body, /href="\/(?:ofertas|saida)\/(?:gru-lis|cnf-fln)"/, url);
  }
  for (const url of ["/ofertas/gru-lis", "/saida/gru-lis", "/api/offers/gru-lis", "/api/offers/gru-lis/click"]) {
    const res = await request(server, url, { method: url.endsWith("/click") ? "POST" : "GET" });
    assert.equal(res.status, 404, url);
    assert.doesNotMatch(res.body, /href="\/(?:ofertas|saida)\/gru-lis"/, url);
  }
});

test("preview com token continua privada e token incorreto recebe 404", async (t) => {
  const dir = await dadosTemporarios(t);
  const anterior = process.env.AONDE_ADMIN_TOKEN;
  process.env.AONDE_ADMIN_TOKEN = "token-de-teste";
  t.after(() => {
    if (anterior === undefined) delete process.env.AONDE_ADMIN_TOKEN;
    else process.env.AONDE_ADMIN_TOKEN = anterior;
  });
  upsert({ id: "preview", status: "rascunho", texto: "TEXTO-PRIVADO", affiliate_url: "https://example.com/preview" });
  const server = createServer();
  for (const url of ["/ofertas/preview", "/saida/preview", "/api/offers/preview"]) {
    for (const token of [undefined, "incorreto"]) {
      const res = await request(server, url, { headers: { "x-admin-token": token } });
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.body, /TEXTO-PRIVADO|example\.com\/preview/);
    }
    const res = await request(server, url, { headers: { "x-admin-token": "token-de-teste" } });
    assert.equal(res.status, 200);
    assert.match(res.headers["cache-control"], /private, no-store/);
    assert.match(res.headers["x-robots-tag"], /noindex/);
    assert.doesNotMatch(res.body, /token-de-teste/);
  }
  const log = await readFile(path.join(dir, "clicks.jsonl"), "utf8");
  assert.equal(log.trim().split("\n").length, 1, "só a saída autorizada gera clique");
});

test("datas do parceiro sobrevivem ao adapter e impedem oferta já partida no feed", () => {
  const offer = toOffer({ origin: "GRU", destination: "REC", price: 500, departDate: "2026-09-12", returnDate: "2026-09-19" }, { status: "publicada" });
  assert.equal(offer.ida, "2026-09-12");
  assert.equal(offer.volta, "2026-09-19");
  assert.equal(viagemAindaVale(offer, "2026-10-20"), false);
  assert.doesNotMatch(renderOffersPage([offer], { hoje: "2026-10-20" }), /href="\/saida\/gru-rec"/);
});

test("travelerPricing parcial não transforma total de grupo em preço por pessoa", () => {
  const [voo] = mapAmadeusOffersToFlights({ data: [{
    price: { grandTotal: "200", currency: "BRL" },
    itineraries: [{ duration: "PT1H", segments: [{ departure: { at: "2026-11-12T10:00:00" }, arrival: { at: "2026-11-12T11:00:00" } }] }],
    travelerPricings: [{ travelerType: "ADULT", price: { total: "100", currency: "BRL" } }, { travelerType: "ADULT" }],
  }] });
  assert.equal(voo.viajantes.length, 1);
  assert.equal(voo.precoEscopo, "oferta");
  assert.doesNotMatch(voo.precoRotulo, /por pessoa/);
});

test("falha de escrita do evento permite nova tentativa imediata", async (t) => {
  const dir = await dadosTemporarios(t);
  resetarEventosMemoria();
  const bloqueado = path.join(dir, "arquivo");
  await writeFile(bloqueado, "não é diretório");
  process.env.AONDE_DATA_DIR = bloqueado;
  const evento = { tipo: "parceiro", local: "saida", alvo: "gru-eze" };
  assert.equal(registrarEvento(evento, 1000).ok, false);
  process.env.AONDE_DATA_DIR = dir;
  assert.deepEqual(registrarEvento(evento, 1001), { ok: true, duplicado: false });
  assert.deepEqual(registrarEvento(evento, 1002), { ok: true, duplicado: true });
  assert.equal((await readFile(path.join(dir, "events.jsonl"), "utf8")).trim().split("\n").length, 1);
});

test("pedido de nova rota só altera a origem preferida depois da confirmação", async (t) => {
  await dadosTemporarios(t);
  const inicial = subscribe({ email: "rota@example.com", origem: "GRU" });
  assert.equal(confirm(inicial.token).ok, true);
  const novo = subscribe({ email: "rota@example.com", origem: "REC", destino: "SSA" });
  assert.equal(novo.status, "pending_rule");
  assert.equal(getSubscriberByEmail("rota@example.com").origem_preferida, "GRU");
  assert.equal(confirmPendingRule(novo.token).ok, true);
  assert.equal(getSubscriberByEmail("rota@example.com").origem_preferida, "REC");
});
