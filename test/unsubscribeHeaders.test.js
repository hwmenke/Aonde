import test from "node:test";
import assert from "node:assert/strict";
import { unsubscribeHeaders } from "../src/newsletter/unsubscribeHeaders.js";
import { PROVEDORES } from "../src/newsletter/sender.js";

test("unsubscribeHeaders so emite cabecalhos com URL https", () => {
  assert.deepEqual(unsubscribeHeaders("https://aonde.com.br/api/newsletter/unsubscribe?email=a%40b.com"), {
    "List-Unsubscribe": "<https://aonde.com.br/api/newsletter/unsubscribe?email=a%40b.com>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.deepEqual(unsubscribeHeaders("http://inseguro.example/x"), {});
  assert.deepEqual(unsubscribeHeaders(""), {});
  assert.deepEqual(unsubscribeHeaders(null), {});
});

test("Resend e SendGrid anexam List-Unsubscribe no payload quando ha URL", () => {
  const url = "https://aonde.com.br/api/newsletter/unsubscribe?email=a%40b.com";
  for (const nome of ["resend", "sendgrid"]) {
    const { opcoes } = PROVEDORES[nome].montar({
      chave: "k", de: "Aonde <ola@aonde.com.br>", para: "a@b.com",
      assunto: "x", textoPlano: "y", html: "<p>z</p>", unsubscribeUrl: url,
    });
    const body = JSON.parse(opcoes.body);
    assert.equal(body.headers["List-Unsubscribe"], `<${url}>`);
    assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  }
  const { opcoes } = PROVEDORES.resend.montar({
    chave: "k", de: "a@b.com", para: "a@b.com", assunto: "x", textoPlano: "y", html: "<p>z</p>",
  });
  assert.equal(JSON.parse(opcoes.body).headers, undefined);
});
