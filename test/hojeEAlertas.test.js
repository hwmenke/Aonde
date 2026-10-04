// /hoje e o fluxo de inscricao nos alertas: confianca, estados vazio/erro,
// validacao com mensagem por campo, confirmacao por e-mail e o que a pessoa
// ve quando algo da errado. Nada aqui depende de rede: o envio de e-mail usa
// um fetch injetado.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderTodayPage, renderNewsletterStatusPage } from "../src/render/htmlRenderer.js";
import { isValidWhatsapp, subscribe, getSubscriberByEmail } from "../src/newsletter/subscriberStore.js";
import { envioDeEmailDisponivel, enviarConfirmacaoOptin } from "../src/newsletter/optinMail.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

const ENV_EMAIL = ["AONDE_EMAIL_PROVIDER", "AONDE_EMAIL_API_KEY", "AONDE_EMAIL_FROM"];

async function withServer(t, envOverrides = {}) {
  const originalDir = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-hoje-alertas-"));
  process.env.AONDE_DATA_DIR = dir;

  const salvo = {};
  for (const k of [...ENV_EMAIL, ...Object.keys(envOverrides)]) salvo[k] = process.env[k];
  for (const k of ENV_EMAIL) delete process.env[k];
  for (const [k, v] of Object.entries(envOverrides)) process.env[k] = v;

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (originalDir === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = originalDir;
    for (const [k, v] of Object.entries(salvo)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(dir, { recursive: true, force: true });
  });
  return { baseUrl };
}

const postJson = (baseUrl, rota, body) =>
  fetch(`${baseUrl}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const postForm = (baseUrl, rota, campos) =>
  fetch(`${baseUrl}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(campos).toString(),
  });

// ---------------------------------------------------------------------------
// /hoje — confianca, CTAs honestos
// ---------------------------------------------------------------------------

test("/hoje: lista de confianca so afirma o que o site faz", () => {
  const html = renderTodayPage(pacoteDoDia("2026-08-21"));
  assert.match(html, /class="wrap hoje-confianca"/);
  assert.match(html, /Preço com fonte e data/);
  assert.match(html, /A compra é no parceiro/);
  assert.match(html, /Como o Aonde ganha/);
  assert.match(html, /comissão/);
  assert.match(html, /não vende passagem/);
});

test("/hoje: cada card tem fonte do preco, nota do CTA e data por extenso", () => {
  const html = renderTodayPage(pacoteDoDia("2026-08-21"));
  assert.match(html, /21 de agosto de 2026/);
  assert.match(html, /class="hoje-fonte-preco"/);
  assert.match(html, /class="hoje-cta-nota"/);
  assert.match(html, /O Aonde não cobra nada de você/);
  assert.match(html, /data-origin-note hidden/);
  assert.match(html, /não uma previsão/);
});

test("/hoje: idade do preco e calculada, nunca inventada", () => {
  const pacote = pacoteDoDia("2026-08-21");
  const fixo = renderTodayPage(pacote);
  // A idade vem da data de fonte do proprio item (21 ago 2026) contra o dia do
  // pacote — no proprio dia nao ha "preco velho" para avisar.
  assert.doesNotMatch(fixo, /class="hoje-preco-idade is-velho"/);
  assert.match(fixo, /Preço visto no próprio dia/);

  const depois = renderTodayPage({ ...pacote, dia: "2026-10-03" });
  assert.match(depois, /hoje-preco-idade is-velho/);
  assert.match(depois, /Preço visto há 43 dias/);
});

// ---------------------------------------------------------------------------
// /hoje — estados vazio, erro, aviso
// ---------------------------------------------------------------------------

test("/hoje: sem escolha do dia mostra estado vazio com saidas e o alerta", () => {
  const html = renderTodayPage({ dia: "2026-08-21", itens: [] });
  assert.match(html, /class="hoje-vazio"/);
  assert.match(html, /Hoje não há uma escolha do dia publicada/);
  assert.match(html, /href="\/ofertas"/);
  assert.match(html, /href="\/guias"/);
  assert.match(html, /href="\/resultados"/);
  assert.match(html, /data-newsletter/);
  assert.doesNotMatch(html, /class="hoje-card"/);
});

test("/hoje: estado de erro e amigavel, com tentar de novo e saidas", () => {
  const html = renderTodayPage(null, { erro: true });
  assert.match(html, /role="alert"/);
  assert.match(html, /Não conseguimos carregar a escolha do dia/);
  assert.match(html, /href="\/hoje">Tentar de novo/);
  assert.match(html, /href="\/ofertas"/);
  assert.doesNotMatch(html, /class="hoje-card"/);
});

test("GET /hoje?dia=lixo avisa em vez de ignorar em silencio", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/hoje?dia=lixo`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /class="hoje-aviso"/);
  assert.match(html, /Não entendemos a data <strong>lixo/);
  assert.match(html, /class="hoje-card"/, "a escolha de hoje continua aparecendo");
});

test("GET /hoje?dia=<script> escapa o valor no aviso", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/hoje?dia=${encodeURIComponent("<script>alert(1)</script>")}`);
  const html = await res.text();
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("GET /hoje?dia=2026-08-21 e previa: avisa e fica fora do Google", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/hoje?dia=2026-08-21`);
  const html = await res.text();
  assert.match(html, /Você está vendo a escolha de <strong>21 de agosto de 2026/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test("GET /hoje sem parametro: sem aviso e indexavel", async (t) => {
  const { baseUrl } = await withServer(t);
  const html = await (await fetch(`${baseUrl}/hoje`)).text();
  assert.doesNotMatch(html, /class="hoje-aviso"/);
  assert.doesNotMatch(html, /noindex/);
});

// ---------------------------------------------------------------------------
// Faixa de inscricao: rotulos, consentimento, expectativas
// ---------------------------------------------------------------------------

test("faixa de alertas: rotulos visiveis, expectativas e saida para /alertas", () => {
  const html = renderTodayPage(pacoteDoDia("2026-08-21"));
  assert.match(html, /<label class="news-label" for="news-email-hoje">Seu e-mail<\/label>/);
  assert.match(html, /<label class="news-label" for="news-origem-hoje">Cidade de saída<\/label>/);
  assert.match(html, /O que acontece depois:/);
  assert.match(html, /Sem clicar nele, nada é enviado/);
  assert.match(html, /sem frequência fixa/);
  assert.match(html, /<a href="\/alertas">Gerenciar alertas<\/a>/);
  assert.match(html, /aria-describedby="news-termos-hoje"/);
  assert.match(html, /data-newsletter-msg role="status" aria-live="polite" hidden/);
});

test("script do cliente: valida antes de enviar e nao quebra o template", () => {
  const html = renderTodayPage(pacoteDoDia("2026-08-21"));
  const script = html.slice(html.lastIndexOf("<script>"), html.lastIndexOf("</script>"));
  assert.match(script, /Digite seu e-mail/);
  assert.match(script, /aria-invalid/);
  assert.doesNotMatch(script, /undefined|\bnull\b/i);
  assert.doesNotMatch(html, /\$\{/);
});

// ---------------------------------------------------------------------------
// Validacao no servidor — mensagem e campo
// ---------------------------------------------------------------------------

test("isValidWhatsapp aceita formatos brasileiros comuns e barra lixo", () => {
  for (const ok of ["(11) 91234-5678", "+55 11 91234-5678", "11912345678", "+5511912345678"]) {
    assert.equal(isValidWhatsapp(ok), true, ok);
  }
  for (const ruim of ["", "abc", "123", "11 9123", "+55 (11) letras 1234", "1".repeat(16), null, 12345678901]) {
    assert.equal(isValidWhatsapp(ruim), false, String(ruim));
  }
});

test("subscribe(): erro vem com o campo e mensagem em portugues acentuado", () => {
  const email = subscribe({ email: "sem-arroba", origem: "GRU" });
  assert.equal(email.ok, false);
  assert.equal(email.field, "email");
  assert.match(email.error, /não parece válido/);

  const origem = subscribe({ email: "a@example.com", origem: "" });
  assert.equal(origem.field, "origem");
  assert.match(origem.error, /cidade/);

  const wpp = subscribe({ email: "a@example.com", origem: "GRU", whatsapp: "abc" });
  assert.equal(wpp.ok, false);
  assert.equal(wpp.field, "whatsapp");
  assert.match(wpp.error, /WhatsApp/);
});

test("POST subscribe com erro devolve 400 com { error, field }", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "sem-arroba", origem: "GRU" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.field, "email");
  assert.match(body.error, /não parece válido/);

  const wpp = await postJson(baseUrl, "/api/newsletter/subscribe", {
    email: "ok@example.com",
    origem: "GRU",
    whatsapp: "xyz",
  });
  assert.equal(wpp.status, 400);
  assert.equal((await wpp.json()).field, "whatsapp");
});

// ---------------------------------------------------------------------------
// Entrega do e-mail de confirmacao — sem becos sem saida
// ---------------------------------------------------------------------------

test("sem provedor de e-mail: resposta diz 'indisponivel' e nao inclui o token", async (t) => {
  const { baseUrl } = await withServer(t);
  assert.equal(envioDeEmailDisponivel(), false);
  const res = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "sem.provedor@example.com", origem: "GRU" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "ok", entrega: "indisponivel" });
});

test("sem provedor, o formulario sem JS mostra que a inscricao nao foi concluida", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await postForm(baseUrl, "/api/newsletter/subscribe", {
    email: "form.sem.provedor@example.com",
    origem: "GRU",
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Não conseguimos enviar o e-mail de confirmação/);
  assert.match(html, /não vai receber alertas/);
  assert.doesNotMatch(html, /Confira seu e-mail/);
});

test("com provedor configurado: envia o link de confirmacao e responde 'email'", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_EMAIL_PROVIDER: "resend",
    AONDE_EMAIL_API_KEY: "chave-de-teste",
    AONDE_EMAIL_FROM: "Aonde <alertas@exemplo.test>",
  });
  const enviados = [];
  setFetchImpl(async (url, opcoes) => {
    enviados.push({ url: String(url), corpo: JSON.parse(opcoes.body) });
    return new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  t.after(() => resetFetchImpl());

  assert.equal(envioDeEmailDisponivel(), true);
  const res = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "com.provedor@example.com", origem: "GRU" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "ok", entrega: "email" });

  for (let i = 0; i < 50 && enviados.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(enviados.length, 1);
  assert.match(enviados[0].url, /api\.resend\.com/);
  assert.deepEqual(enviados[0].corpo.to, ["com.provedor@example.com"]);
  const token = getSubscriberByEmail("com.provedor@example.com").optin_token;
  assert.ok(token);
  assert.ok(enviados[0].corpo.text.includes(`/api/newsletter/confirm?token=${token}`), "o e-mail leva o link de confirmacao");
  assert.equal(JSON.stringify(body).includes(token), false, "o token nunca vai na resposta HTTP");
});

test("enviarConfirmacaoOptin nunca lanca e nao finge envio sem provedor", async (t) => {
  await withServer(t);
  const saida = await enviarConfirmacaoOptin({
    subscriber: { email: "x@example.com", origem_preferida: "GRU", pending_alert: null },
    token: "abc",
    baseUrl: "https://aonde.test",
  });
  assert.equal(saida.ok, false);
  assert.equal(saida.estado, "sem_provedor");

  const quebrado = await enviarConfirmacaoOptin({ subscriber: null, token: "abc", baseUrl: "" });
  assert.equal(quebrado.ok, false);
  assert.equal(quebrado.estado, "erro");
});

// ---------------------------------------------------------------------------
// Pagina de status (formulario sem JS) e 429
// ---------------------------------------------------------------------------

test("formulario sem JS com e-mail invalido: 400 em HTML com erro e novo formulario", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await postForm(baseUrl, "/api/newsletter/subscribe", { email: "sem-arroba", origem: "GRU" });
  assert.equal(res.status, 400);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const html = await res.text();
  assert.match(html, /role="alert"/);
  assert.match(html, /não parece válido/);
  assert.match(html, /action="\/api\/newsletter\/subscribe"/);
  assert.match(html, /noindex/);
});

test("429 no formulario sem JS vira pagina com caminho de volta; JSON continua JSON", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "1",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });
  await postJson(baseUrl, "/api/newsletter/subscribe", { email: "um@example.com", origem: "GRU" });

  const form = await postForm(baseUrl, "/api/newsletter/subscribe", { email: "dois@example.com", origem: "GRU" });
  assert.equal(form.status, 429);
  assert.match(form.headers.get("content-type") || "", /text\/html/);
  assert.match(await form.text(), /Muitas tentativas em pouco tempo/);

  const json = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "tres@example.com", origem: "GRU" });
  assert.equal(json.status, 429);
  assert.match(json.headers.get("content-type") || "", /application\/json/);
  assert.match((await json.json()).error, /Muitas tentativas/);
  assert.ok(Number(json.headers.get("retry-after")) > 0);
});

test("renderNewsletterStatusPage: variantes", () => {
  const pendente = renderNewsletterStatusPage({ ok: true, pendente: true, entrega: "email", email: "a@b.com" });
  assert.match(pendente, /Confira seu e-mail/);
  assert.match(pendente, /<strong>a@b\.com<\/strong>/);
  assert.match(pendente, /48 horas/);
  assert.match(pendente, /spam/);

  const xss = renderNewsletterStatusPage({ ok: true, pendente: true, entrega: "email", email: '"><img src=x>' });
  assert.doesNotMatch(xss, /<img src=x>/);

  const confirmado = renderNewsletterStatusPage({ ok: true });
  assert.match(confirmado, /Inscrição confirmada/);
  assert.match(confirmado, /pode haver semanas sem aviso/);

  const descadastrado = renderNewsletterStatusPage({ ok: true, descadastrado: true });
  assert.match(descadastrado, /Cancelamento feito/);

  const expirado = renderNewsletterStatusPage({ ok: false, error: "Link expirado." });
  assert.match(expirado, /Não foi possível confirmar/);
  assert.match(expirado, /Link expirado\./);
  assert.match(expirado, /href="\/hoje"/, "sempre ha uma saida");

  for (const html of [pendente, confirmado, descadastrado, expirado]) {
    assert.doesNotMatch(html, /undefined|\bnull\b/);
  }
});

test("pagina /alertas: formulario de cancelamento tem rotulo e area de status", async (t) => {
  const { baseUrl } = await withServer(t);
  const html = await (await fetch(`${baseUrl}/alertas`)).text();
  assert.match(html, /<label[^>]*for="[^"]+"[^>]*>[^<]*e-mail/i);
  assert.match(html, /role="status"/);
});
