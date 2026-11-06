// A camada de envio que faltava. Ate esta rodada o projeto tinha template,
// double opt-in, dedup e descadastro — e NADA que efetivamente enviasse.
// O alerta de preco, que e a razao de alguem voltar ao site, nunca saia.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { setFetchImpl, resetFetchImpl } from "../src/http.js";

function comDataDir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-envio-"));
  const antes = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  t.after(() => {
    if (antes === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = antes;
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function comProvedor(t, vars = {}) {
  const chaves = ["AONDE_EMAIL_PROVIDER", "AONDE_EMAIL_API_KEY", "AONDE_EMAIL_FROM"];
  const antes = Object.fromEntries(chaves.map((k) => [k, process.env[k]]));
  for (const k of chaves) delete process.env[k];
  Object.assign(process.env, vars);
  t.after(() => {
    for (const k of chaves) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  });
}

const MSG = { para: "pessoa@exemplo.com", assunto: "Preço caiu", textoPlano: "texto", html: "<p>html</p>" };

test("sem provedor configurado, NAO finge que enviou", async (t) => {
  comDataDir(t);
  comProvedor(t, {});
  const { enviarEmail } = await import("../src/newsletter/sender.js");
  const r = await enviarEmail(MSG);
  assert.equal(r.ok, false);
  assert.equal(r.estado, "sem_provedor");
  assert.match(r.motivo, /AONDE_EMAIL_PROVIDER/);
});

test("com provedor, envia e registra", async (t) => {
  comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  let pedidos = 0;
  setFetchImpl(async () => {
    pedidos++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
  });
  t.after(() => resetFetchImpl());
  const { enviarEmail, historicoEnvios } = await import("../src/newsletter/sender.js");
  const r = await enviarEmail(MSG);
  assert.equal(r.ok, true);
  assert.equal(r.estado, "enviado");
  assert.equal(pedidos, 1);
  const log = historicoEnvios();
  assert.equal(log.at(-1).estado, "enviado");
  // LGPD: o endereco nunca vai para o log em texto puro.
  assert.doesNotMatch(JSON.stringify(log), /pessoa@exemplo\.com/);
  assert.ok(log.at(-1).emailHash, "o log precisa do hash para dar para auditar");
});

test("falha temporaria e retentada; permanente nao", async (t) => {
  comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { enviarEmail } = await import("../src/newsletter/sender.js");

  let n = 0;
  setFetchImpl(async () => {
    n++;
    return { ok: false, status: 503, headers: new Map(), text: async () => "", json: async () => ({}) };
  });
  t.after(() => resetFetchImpl());
  const temp = await enviarEmail(MSG, { tentativasMax: 3, dormir: async () => {} });
  assert.equal(temp.estado, "falha_temporaria");
  assert.equal(n, 3, "503 e temporario: precisa tentar de novo");

  n = 0;
  setFetchImpl(async () => {
    n++;
    return { ok: false, status: 401, headers: new Map(), text: async () => "", json: async () => ({}) };
  });
  const perm = await enviarEmail({ ...MSG, para: "outra@exemplo.com" }, { tentativasMax: 3, dormir: async () => {} });
  assert.equal(perm.estado, "falha_permanente");
  assert.equal(n, 1, "401 e erro nosso: repetir so gasta cota e piora a reputacao");
});

test("endereco recusado pelo provedor entra na supressao e nunca mais e tentado", async (t) => {
  comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { enviarEmail, estaSuprimido } = await import("../src/newsletter/sender.js");
  let chamadas = 0;
  setFetchImpl(async () => {
    chamadas++;
    return { ok: false, status: 422, headers: new Map(), text: async () => JSON.stringify({ message: "Invalid recipient: invalido@exemplo.com" }), json: async () => ({}) };
  });
  t.after(() => resetFetchImpl());

  const alvo = { ...MSG, para: "invalido@exemplo.com" };
  await enviarEmail(alvo, { tentativasMax: 2, dormir: async () => {} });
  assert.equal(estaSuprimido("invalido@exemplo.com"), true, "recusa explicita do destinatario precisa suprimir o endereco");

  const antes = chamadas;
  const r2 = await enviarEmail(alvo);
  assert.equal(r2.estado, "suprimido");
  assert.equal(chamadas, antes, "endereco suprimido nao pode gerar nova chamada de rede");
});

for (const [nome, status, corpo, suprime] of [
  ["422 vazio", 422, "", false],
  ["422 generico", 422, '{"message":"Validation error"}', false],
  ["400 remetente invalido", 400, '{"message":"Invalid from address","field":"from"}', false],
  ["400 chave invalida", 400, '{"message":"Invalid API key"}', false],
  ["422 payload invalido", 422, '{"message":"Invalid payload","field":"subject"}', false],
  ["422 campo to", 422, '{"errors":[{"message":"Invalid email","field":"personalizations.0.to.0.email"}]}', true],
  ["400 destinatario invalido", 400, '{"name":"invalid_recipient"}', true],
  ["422 bounce", 422, '{"message":"Recipient bounced"}', true],
  ["422 texto com endereco", 422, "Invalid address pessoa@exemplo.com", true],
  ["422 texto com to", 422, 'Invalid `to` field', true],
]) {
  test(`${nome}: supressao exige evidencia do destinatario`, async (t) => {
    comDataDir(t);
    comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
    const { enviarEmail, estaSuprimido, historicoEnvios } = await import("../src/newsletter/sender.js");
    let chamadas = 0;
    setFetchImpl(async () => {
      chamadas++;
      return { ok: chamadas > 1, status: chamadas > 1 ? 200 : status, text: async () => chamadas > 1 ? "{}" : corpo };
    });
    t.after(() => resetFetchImpl());
    const falha = await enviarEmail(MSG, { dormir: async () => {} });
    assert.equal(falha.estado, "falha_permanente");
    assert.equal(falha.tentativas, 1);
    assert.equal(estaSuprimido(MSG.para), suprime);
    const proximo = await enviarEmail(MSG);
    assert.equal(proximo.estado, suprime ? "suprimido" : "enviado");
    assert.equal(chamadas, suprime ? 1 : 2);
    assert.doesNotMatch(JSON.stringify(historicoEnvios()), /pessoa@exemplo\.com/);
  });
}

test("a supressao vale para quem pediu para sair", async (t) => {
  comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { suprimir, enviarEmail } = await import("../src/newsletter/sender.js");
  setFetchImpl(async () => {
    throw new Error("nao deveria chamar a rede");
  });
  t.after(() => resetFetchImpl());
  suprimir("saiu@exemplo.com", "descadastro");
  const r = await enviarEmail({ ...MSG, para: "saiu@exemplo.com" });
  assert.equal(r.estado, "suprimido");
});

test("o worker e idempotente: rodar duas vezes nao reenvia", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const { upsert } = await import("../src/store/offersStore.js");
  const s = subscribe({ email: "leitor@exemplo.com", origem: "GRU" });
  const confirmed = s.token ? confirm(s.token).subscriber : null;
  const { addAlertRule } = await import("../src/newsletter/alertRules.js");
  addAlertRule({ subscriberId: confirmed.id, origem: "GRU", destino: "REC" });

  // Ofertas publicadas com ida futura — o worker revalida elegibilidade antes de enviar.
  const ida = "2099-01-15";
  for (const i of [1, 2]) {
    upsert({ id: `oferta-${i}`, status: "publicada", origem: "GRU", destino: "REC", ida, volta: "2099-01-22", preco_centavos: 58700 });
  }

  // Enfileira duas notificacoes na mao, no mesmo formato do dispatchAlerts.
  const linhas = [1, 2].map((i) =>
    JSON.stringify({
      queuedAt: new Date().toISOString(),
      subscriberEmailHash: hashEmail("leitor@exemplo.com"),
      canal: "email",
      offerId: `oferta-${i}`,
      offerRoute: "GRU-REC",
      precoCentavos: 58700,
    })
  );
  writeFileSync(path.join(dir, "alert_queue.jsonl"), linhas.join("\n") + "\n", "utf-8");

  let enviados = 0;
  setFetchImpl(async () => {
    enviados++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
  });
  t.after(() => resetFetchImpl());

  const { processarFila } = await import("../src/newsletter/worker.js");
  const r1 = await processarFila();
  assert.equal(r1.enviados, 2);
  assert.equal(enviados, 2);

  // ISSO E O PONTO: o cron pode rodar de novo, ou em paralelo com uma execucao
  // manual. E-mail repetido e a forma mais rapida de perder um assinante.
  const r2 = await processarFila();
  assert.equal(r2.enviados, 0, "segunda rodada nao pode reenviar");
  assert.equal(enviados, 2, "nenhuma chamada de rede a mais");
  assert.equal(r2.pendentesRestantes, 0);
});

test("o worker nao manda para quem descadastrou", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, unsubscribe, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const s = subscribe({ email: "saindo@exemplo.com", origem: "GRU" });
  if (s.token) confirm(s.token);
  const hash = hashEmail("saindo@exemplo.com");
  writeFileSync(
    path.join(dir, "alert_queue.jsonl"),
    JSON.stringify({ queuedAt: new Date().toISOString(), subscriberEmailHash: hash, canal: "email", offerId: "o1", offerRoute: "GRU-REC", precoCentavos: 50000 }) + "\n",
    "utf-8"
  );
  unsubscribe("saindo@exemplo.com");

  setFetchImpl(async () => {
    throw new Error("nao deveria enviar para quem saiu");
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.enviados, 0);
  assert.equal(r.pulados, 1);
});

test("linha corrompida na fila nao trava as outras", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, {});
  writeFileSync(path.join(dir, "alert_queue.jsonl"), "{lixo\n{\"tambem\":\"invalido\"\n", "utf-8");
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.ok, true);
  assert.equal(r.modo, "registro");
});
