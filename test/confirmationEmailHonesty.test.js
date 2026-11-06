import test from "node:test";
import assert from "node:assert/strict";
import { buildConfirmationEmail } from "../src/newsletter/emailTemplates.js";

const input = {
  email: "pessoa@example.com",
  origem: "GRU",
  destino: "REC",
  precoAlvoCentavos: 80000,
  confirmUrl: "https://aonde.com.br/api/newsletter/confirm?token=abc",
  unsubscribeUrl: "https://aonde.com.br/api/newsletter/unsubscribe?email=pessoa%40example.com",
};

for (const jaInscrito of [false, true]) {
  test(`confirmation explains expiry and replacement links (existing=${jaInscrito})`, () => {
    const result = buildConfirmationEmail({ ...input, jaInscrito });
    for (const body of [result.textoPlano, result.html]) {
      assert.match(body, /48 horas a partir do pedido/);
      assert.match(body, /link do e-mail mais recente/);
      assert.match(body, /faça um novo pedido no site/);
      assert.ok(body.includes(input.confirmUrl));
      assert.ok(body.includes(input.unsubscribeUrl));
      assert.doesNotMatch(body, /nunca mais|nem mais e-mails|sem confirmação, nada acontece/i);
    }
  });
}

test("first opt-in limits its promise to this request and explains repeat emails", () => {
  const result = buildConfirmationEmail(input);
  for (const body of [result.textoPlano, result.html]) {
    assert.match(body, /não recebe alertas deste pedido/);
    assert.match(body, /Um novo pedido no site pode gerar outro e-mail de confirmação/);
    assert.doesNotMatch(body, /seus alertas atuais/i);
  }
  assert.match(result.html, />Confirmar inscrição<\/a>/);
});

test("additional alert preserves current alerts and warns that unsubscribe stops all", () => {
  const result = buildConfirmationEmail({ ...input, jaInscrito: true });
  for (const body of [result.textoPlano, result.html]) {
    assert.match(body, /o novo alerta não será ativado e seus alertas atuais continuam como estão/);
    assert.match(body, /Cancelar inscrição interrompe todos os alertas deste endereço, não apenas este pedido/);
    assert.doesNotMatch(body, /sem confirmar, você não recebe/i);
  }
  assert.match(result.textoPlano, /Confirmar novo alerta: https:/);
  assert.match(result.html, />Confirmar novo alerta<\/a>/);
  assert.match(result.assunto, /novo alerta/);
});
