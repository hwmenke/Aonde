import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import {
  subscribe,
  confirm,
  unsubscribe,
  listSubscribers,
  getSubscriberByEmail,
} from "../src/newsletter/subscriberStore.js";
import { addAlertRule, listAlertRules, removeAlertRule } from "../src/newsletter/alertRules.js";
import { matchAlerts, dispatchAlerts, setSenderImpl, resetSenderImpl } from "../src/newsletter/alertMatcher.js";

// Cada teste aponta AONDE_DATA_DIR para um dir temporario proprio.
async function withTempDataDir(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-newsletter-"));
  process.env.AONDE_DATA_DIR = dir;
  t.after(async () => {
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

// Assinante confirmado pronto para receber alertas.
function subscribeAndConfirm(email = "user@example.com", origem = "GRU") {
  const sub = subscribe({ email, origem });
  assert.equal(sub.status, "pending_optin");
  const confirmed = confirm(sub.token);
  assert.equal(confirmed.ok, true);
  return confirmed.subscriber;
}

test("subscribe cria assinante pendente com token e sem consentimento", async (t) => {
  await withTempDataDir(t);
  const result = subscribe({ email: "Ana@Example.com", origem: "gru" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "pending_optin");
  assert.equal(typeof result.token, "string");
  assert.equal(result.token.length, 64); // 32 bytes hex

  const sub = result.subscriber;
  assert.equal(sub.email, "ana@example.com"); // normalizado
  assert.equal(sub.origem_preferida, "GRU"); // normalizado
  assert.equal(sub.double_optin_confirmed, false);
  assert.equal(sub.consent_lgpd_at, null);
  assert.deepEqual(sub.channels, ["email"]);
  assert.ok(sub.created_at);
});

test("subscribe com whatsapp adiciona o canal", async (t) => {
  await withTempDataDir(t);
  const result = subscribe({ email: "z@example.com", whatsapp: "+5511999999999", origem: "GRU" });
  assert.deepEqual(result.subscriber.channels, ["email", "whatsapp"]);
  assert.equal(result.subscriber.whatsapp, "+5511999999999");
});

test("subscribe rejeita e-mail invalido e origem invalida", async (t) => {
  await withTempDataDir(t);
  assert.equal(subscribe({ email: "sem-arroba", origem: "GRU" }).ok, false);
  assert.equal(subscribe({ email: "ok@example.com", origem: "XX" }).ok, false);
});

test("confirm registra consentimento LGPD e apaga o token", async (t) => {
  await withTempDataDir(t);
  const { token } = subscribe({ email: "b@example.com", origem: "GRU" });
  const result = confirm(token);
  assert.equal(result.ok, true);
  assert.equal(result.subscriber.double_optin_confirmed, true);
  assert.ok(result.subscriber.consent_lgpd_at);
  assert.equal(result.subscriber.optin_token, null);

  // Token de uso unico: nao confirma de novo.
  assert.equal(confirm(token).ok, false);
});

test("confirm com token expirado falha", async (t) => {
  const dir = await withTempDataDir(t);
  const { token } = subscribe({ email: "c@example.com", origem: "GRU" });

  // Expira o token manualmente no arquivo.
  const file = path.join(dir, "subscribers.json");
  const all = JSON.parse(await readFile(file, "utf-8"));
  all[0].optin_token_expires_at = new Date(Date.now() - 1000).toISOString();
  await writeFile(file, JSON.stringify(all));

  const result = confirm(token);
  assert.equal(result.ok, false);
  assert.match(result.error, /expirad/i);
});

test("re-subscribe de e-mail ja confirmado -> already_confirmed", async (t) => {
  await withTempDataDir(t);
  subscribeAndConfirm("d@example.com");
  const again = subscribe({ email: "d@example.com", origem: "GIG" });
  assert.equal(again.status, "already_confirmed");
  assert.equal(again.token, undefined);
});

test("re-subscribe de e-mail pendente regenera o token", async (t) => {
  await withTempDataDir(t);
  const first = subscribe({ email: "e@example.com", origem: "GRU" });
  const second = subscribe({ email: "e@example.com", origem: "GRU" });
  assert.equal(second.status, "pending_optin");
  assert.notEqual(first.token, second.token);
  // Apenas um registro (nao duplica por e-mail).
  assert.equal(listSubscribers().length, 1);
});

test("unsubscribe e idempotente e preserva o registro (auditoria)", async (t) => {
  await withTempDataDir(t);
  subscribeAndConfirm("f@example.com");

  const r1 = unsubscribe("f@example.com");
  assert.equal(r1.ok, true);
  const sub = getSubscriberByEmail("f@example.com");
  assert.ok(sub.unsubscribed_at); // registro mantido
  assert.equal(sub.double_optin_confirmed, true);

  // Chamar de novo nao gera erro (idempotente).
  assert.equal(unsubscribe("f@example.com").ok, true);
});

test("unsubscribe de e-mail inexistente nao vaza existencia (sempre ok)", async (t) => {
  await withTempDataDir(t);
  const result = unsubscribe("nao-existe@example.com");
  assert.equal(result.ok, true);
  assert.equal(listSubscribers().length, 0);
});

test("addAlertRule exige assinante confirmado", async (t) => {
  await withTempDataDir(t);
  // Pendente: nao pode criar regra.
  const pending = subscribe({ email: "g@example.com", origem: "GRU" });
  const denied = addAlertRule({ subscriberId: pending.subscriber.id, origem: "GRU" });
  assert.equal(denied.ok, false);

  // Confirmado: pode.
  const sub = subscribeAndConfirm("h@example.com");
  const rule = addAlertRule({ subscriberId: sub.id, origem: "gru", destino: "lis", precoAlvoCentavos: 300000 });
  assert.equal(rule.ok, true);
  assert.equal(rule.rule.origem, "GRU");
  assert.equal(rule.rule.destino, "LIS");
  assert.equal(listAlertRules({ subscriberId: sub.id }).length, 1);

  const removed = removeAlertRule(rule.rule.id);
  assert.equal(removed.removed, true);
  assert.equal(listAlertRules().length, 0);
});

test("matchAlerts casa por origem/destino/preco e ignora nao-confirmados", async (t) => {
  await withTempDataDir(t);
  const sub = subscribeAndConfirm("i@example.com");
  const rule = addAlertRule({ subscriberId: sub.id, origem: "GRU", destino: "LIS", precoAlvoCentavos: 300000 }).rule;

  const rules = listAlertRules();
  const subscribers = listSubscribers();

  // Casa: preco abaixo do alvo, rota igual.
  const m1 = matchAlerts({ origem: "GRU", destino: "LIS", preco_centavos: 250000 }, { rules, subscribers });
  assert.equal(m1.length, 1);

  // Nao casa: origem diferente.
  assert.equal(matchAlerts({ origem: "GIG", destino: "LIS", preco_centavos: 250000 }, { rules, subscribers }).length, 0);
  // Nao casa: destino diferente.
  assert.equal(matchAlerts({ origem: "GRU", destino: "MAD", preco_centavos: 250000 }, { rules, subscribers }).length, 0);
  // Nao casa: preco acima do alvo.
  assert.equal(matchAlerts({ origem: "GRU", destino: "LIS", preco_centavos: 350000 }, { rules, subscribers }).length, 0);

  // Nao casa: assinante descadastrado.
  unsubscribe("i@example.com");
  const subsAfter = listSubscribers();
  assert.equal(matchAlerts({ origem: "GRU", destino: "LIS", preco_centavos: 250000 }, { rules, subscribers: subsAfter }).length, 0);

  // silence unused
  assert.ok(rule.id);
});

test("matchAlerts: regra sem destino casa qualquer destino; sem preco casa qualquer preco", async (t) => {
  await withTempDataDir(t);
  const sub = subscribeAndConfirm("j@example.com");
  addAlertRule({ subscriberId: sub.id, origem: "GRU" }); // sem destino, sem preco
  const rules = listAlertRules();
  const subscribers = listSubscribers();

  assert.equal(matchAlerts({ origem: "GRU", destino: "LIS", preco_centavos: 999999 }, { rules, subscribers }).length, 1);
  assert.equal(matchAlerts({ origem: "GRU", destino: "MAD", preco_centavos: 100 }, { rules, subscribers }).length, 1);
});

test("dispatchAlerts enfileira em JSONL com HASH do e-mail (nao o e-mail em claro)", async (t) => {
  const dir = await withTempDataDir(t);
  const email = "k@example.com";
  const sub = subscribeAndConfirm(email);
  addAlertRule({ subscriberId: sub.id, origem: "GRU", destino: "LIS", precoAlvoCentavos: 300000 });

  const result = dispatchAlerts([
    { id: "gru-lis", origem: "GRU", destino: "LIS", preco_centavos: 250000 },
    { id: "gig-eze", origem: "GIG", destino: "EZE", preco_centavos: 100000 }, // nao casa
  ]);
  assert.equal(result.queued, 1);

  const queuePath = path.join(dir, "alert_queue.jsonl");
  assert.ok(existsSync(queuePath));
  const content = await readFile(queuePath, "utf-8");
  assert.ok(!content.includes(email)); // e-mail em claro NUNCA na fila
  const line = JSON.parse(content.trim());
  const expectedHash = crypto.createHash("sha256").update(email).digest("hex");
  assert.equal(line.subscriberEmailHash, expectedHash);
  assert.equal(line.canal, "email");
  assert.equal(line.offerId, "gru-lis");
  assert.equal(line.offerRoute, "GRU-LIS");
  assert.equal(line.precoCentavos, 250000);
});

test("dispatchAlerts respeita setSenderImpl (ponto de integracao)", async (t) => {
  await withTempDataDir(t);
  const sub = subscribeAndConfirm("l@example.com");
  addAlertRule({ subscriberId: sub.id, origem: "GRU" });

  const seen = [];
  setSenderImpl((item) => seen.push(item));
  t.after(() => resetSenderImpl());

  dispatchAlerts([{ id: "x", origem: "GRU", destino: "LIS", preco_centavos: 100 }]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].offerRoute, "GRU-LIS");
});
