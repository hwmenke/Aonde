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

test("o worker respeita o limite e retoma os lotes sem perder ou repetir alertas", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const emails = ["lote1@exemplo.com", "lote2@exemplo.com", "lote3@exemplo.com"];
  for (const email of emails) confirm(subscribe({ email, origem: "GRU" }).token);
  const fila = emails.map((email) => JSON.stringify({
    subscriberEmailHash: hashEmail(email), canal: "email",
    offerRoute: "GRU-REC", precoCentavos: 50000,
  }));
  // A skipped record also consumes one slot and must advance the checkpoint.
  fila.splice(1, 0, "invalid JSON");
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  const destinatarios = [];
  setFetchImpl(async (_url, options) => {
    destinatarios.push(JSON.parse(options.body).to[0]);
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");

  const primeira = await processarFila({ limite: 2 });
  assert.equal(primeira.lidos, 2);
  assert.equal(primeira.enviados, 1);
  assert.equal(primeira.pulados, 1);
  assert.equal(primeira.pendentesRestantes, 2);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "2");
  assert.deepEqual(destinatarios, emails.slice(0, 1));

  const segunda = await processarFila({ limite: 2 });
  assert.equal(segunda.lidos, 2);
  assert.equal(segunda.enviados, 2);
  assert.equal(segunda.pulados, 0);
  assert.equal(segunda.pendentesRestantes, 0);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "4");
  assert.deepEqual(destinatarios, emails);

  assert.equal((await processarFila({ limite: 2 })).lidos, 0);
  assert.deepEqual(destinatarios, emails);
});

test("o worker pula rotas malformadas sem perder o alerta valido seguinte", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  confirm(subscribe({ email: "rota@exemplo.com", origem: "GRU" }).token);
  const invalidos = [undefined, null, "", "GRU", "GRU-", "-REC", "GR-REC", "GRU-REC-extra", 123, ["GRU-REC"], {}];
  const fila = [...invalidos, " gru - rec "].map((offerRoute) => JSON.stringify({
    subscriberEmailHash: hashEmail("rota@exemplo.com"), canal: "email",
    offerRoute, precoCentavos: 50000,
  }));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  const mensagens = [];
  setFetchImpl(async (_url, options) => {
    mensagens.push(JSON.parse(options.body));
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.pulados, invalidos.length);
  assert.equal(r.enviados, 1);
  assert.equal(mensagens.length, 1);
  assert.match(mensagens[0].subject, /GRU.*REC/);
  assert.equal(r.pendentesRestantes, 0);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), String(fila.length));
  assert.equal((await processarFila()).enviados, 0);
  assert.equal(mensagens.length, 1);
});

test("o worker retoma a falha temporaria sem perder nem repetir alertas", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const emails = ["primeiro@exemplo.com", "retentar@exemplo.com", "ultimo@exemplo.com"];
  for (const email of emails) confirm(subscribe({ email, origem: "GRU" }).token);
  const fila = emails.map((email) => JSON.stringify({
    subscriberEmailHash: hashEmail(email), canal: "email",
    offerRoute: "GRU-REC", precoCentavos: 50000,
  }));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  const destinatarios = [];
  let indisponivel = true;
  setFetchImpl(async (_url, options) => {
    const email = JSON.parse(options.body).to[0];
    destinatarios.push(email);
    const falha = indisponivel && email === emails[1];
    return { ok: !falha, status: falha ? 503 : 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const primeira = await processarFila();
  assert.equal(primeira.enviados, 1);
  assert.equal(primeira.falhas, 1);
  assert.equal(primeira.pendentesRestantes, 2);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "1");
  assert.deepEqual(destinatarios, [emails[0], emails[1], emails[1], emails[1]]);

  indisponivel = false;
  const segunda = await processarFila();
  assert.equal(segunda.enviados, 2);
  assert.equal(segunda.falhas, 0);
  assert.equal(segunda.pendentesRestantes, 0);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "3");
  assert.deepEqual(destinatarios.slice(4), emails.slice(1));
  assert.equal((await processarFila()).enviados, 0);
  assert.equal(destinatarios.length, 6);
});

test("o worker avanca apos falha permanente e entrega o alerta seguinte", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const emails = ["recusado@exemplo.com", "seguinte@exemplo.com"];
  for (const email of emails) confirm(subscribe({ email, origem: "GRU" }).token);
  const fila = emails.map((email) => JSON.stringify({
    subscriberEmailHash: hashEmail(email), canal: "email",
    offerRoute: "GRU-REC", precoCentavos: 50000,
  }));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  const destinatarios = [];
  setFetchImpl(async (_url, options) => {
    const email = JSON.parse(options.body).to[0];
    destinatarios.push(email);
    const recusado = email === emails[0];
    return { ok: !recusado, status: recusado ? 422 : 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const { estaSuprimido } = await import("../src/newsletter/sender.js");

  const resultado = await processarFila();
  assert.equal(resultado.enviados, 1);
  assert.equal(resultado.pulados, 1);
  assert.equal(resultado.falhas, 0);
  assert.equal(resultado.pendentesRestantes, 0);
  assert.deepEqual(destinatarios, emails);
  assert.equal(estaSuprimido(emails[0]), true);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "2");
  assert.equal((await processarFila()).lidos, 0);
  assert.deepEqual(destinatarios, emails);
});

test("o worker envia apenas entradas do canal email", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const s = subscribe({ email: "canal@exemplo.com", origem: "GRU" });
  confirm(s.token);
  const canais = ["whatsapp", "sms", null, undefined, "email"];
  const fila = canais.map((canal) => JSON.stringify({
    subscriberEmailHash: hashEmail("canal@exemplo.com"), canal,
    offerRoute: "GRU-REC", precoCentavos: 50000,
  }));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  let enviados = 0;
  setFetchImpl(async () => {
    enviados++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.enviados, 1);
  assert.equal(r.pulados, 4);
  assert.equal(enviados, 1);
  assert.equal(r.pendentesRestantes, 0);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "5");
  assert.equal((await processarFila()).enviados, 0);
  assert.equal(enviados, 1);
});

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
    return { ok: false, status: 422, headers: new Map(), text: async () => "", json: async () => ({}) };
  });
  t.after(() => resetFetchImpl());

  const alvo = { ...MSG, para: "invalido@exemplo.com" };
  await enviarEmail(alvo, { tentativasMax: 2, dormir: async () => {} });
  assert.equal(estaSuprimido("invalido@exemplo.com"), true, "422 precisa suprimir o endereco");

  const antes = chamadas;
  const r2 = await enviarEmail(alvo);
  assert.equal(r2.estado, "suprimido");
  assert.equal(chamadas, antes, "endereco suprimido nao pode gerar nova chamada de rede");
});

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
  const s = subscribe({ email: "leitor@exemplo.com", origem: "GRU" });
  if (s.token) confirm(s.token);

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

test("o worker exige double opt-in ao enviar e continua depois de assinante pendente", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  subscribe({ email: "pendente@exemplo.com", origem: "GRU" });
  const ativo = subscribe({ email: "ativo@exemplo.com", origem: "GRU" });
  confirm(ativo.token);
  const fila = ["pendente@exemplo.com", "ativo@exemplo.com"].map((email) => JSON.stringify({
    subscriberEmailHash: hashEmail(email), canal: "email", offerRoute: "GRU-REC", precoCentavos: 50000,
  }));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  const destinatarios = [];
  setFetchImpl(async (_url, options) => {
    destinatarios.push(JSON.parse(options.body).to);
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.pulados, 1);
  assert.equal(r.enviados, 1);
  assert.deepEqual(destinatarios, [["ativo@exemplo.com"]]);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "2");
  assert.equal((await processarFila()).enviados, 0);
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

test("valores JSON malformados nao bloqueiam alertas validos nem o checkpoint", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const s = subscribe({ email: "fila@exemplo.com", origem: "GRU" });
  confirm(s.token);
  const invalidos = [null, [], true, 42, "texto"];
  const alerta = { subscriberEmailHash: hashEmail("fila@exemplo.com"), canal: "email", offerRoute: "GRU-REC", precoCentavos: 50000 };
  writeFileSync(path.join(dir, "alert_queue.jsonl"), [...invalidos, alerta].map((item) => JSON.stringify(item)).join("\n") + "\n");

  let enviados = 0;
  setFetchImpl(async () => {
    enviados++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.pulados, invalidos.length);
  assert.equal(r.enviados, 1);
  assert.equal(r.pendentesRestantes, 0);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), "6");
  assert.equal((await processarFila()).enviados, 0);
  assert.equal(enviados, 1);
});


test("o worker pula precos invalidos na fila e envia somente a tarifa valida", async (t) => {
  const dir = comDataDir(t);
  comProvedor(t, { AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "k", AONDE_EMAIL_FROM: "a@b.com" });
  const { subscribe, confirm, hashEmail } = await import("../src/newsletter/subscriberStore.js");
  const s = subscribe({ email: "preco@exemplo.com", origem: "GRU" });
  confirm(s.token);
  const invalidos = [undefined, null, "50000", 0, -1, true, [], {}];
  const fila = [...invalidos, 50000].map((precoCentavos) => JSON.stringify({
    subscriberEmailHash: hashEmail("preco@exemplo.com"), canal: "email",
    offerRoute: "GRU-REC", precoCentavos,
  }));
  // JSON.parse aceita este numero como Infinity, embora nao seja uma tarifa valida.
  fila.splice(invalidos.length, 0, fila.at(-1).replace('"precoCentavos":50000', '"precoCentavos":1e400'));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), fila.join("\n") + "\n");
  let enviados = 0;
  setFetchImpl(async () => {
    enviados++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}" };
  });
  t.after(() => resetFetchImpl());
  const { processarFila } = await import("../src/newsletter/worker.js");
  const r = await processarFila();
  assert.equal(r.pulados, invalidos.length + 1);
  assert.equal(r.enviados, 1);
  assert.equal(enviados, 1);
  assert.equal(r.pendentesRestantes, 0);
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf-8"), String(fila.length));
  assert.equal((await processarFila()).enviados, 0);
  assert.equal(enviados, 1);
});
