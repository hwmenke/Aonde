import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConfirmationEmail,
  buildPriceAlertEmail,
  buildWelcomeEmail,
} from "../src/newsletter/emailTemplates.js";

// Payload malicioso usado em varios testes: tenta injetar tag/atributo tanto
// no e-mail quanto no que seria um "nome" (o modelo de subscriber nao tem
// campo nome, entao o e-mail e o unico dado de usuario que entra no template
// literalmente — cobrimos ele com forca).
const EMAIL_MALICIOSO = '"><img src=x onerror=alert(1)>@example.com';

// Palavras/expressoes de urgencia falsa que o tom do site proibe.
const FRASES_URGENCIA = [
  /ultimas horas/i,
  /so hoje/i,
  /somente hoje/i,
  /corra/i,
  /imperdivel/i,
  /nao perca/i,
  /aproveite agora/i,
  /vagas limitadas/i,
  /oferta expira/i,
];

const CAMPOS_BASE = {
  email: "viajante@example.com",
  origem: "GRU",
  destino: "LIS",
  precoAlvoCentavos: 300000,
  confirmUrl: "https://aonde.com.br/api/newsletter/confirm?token=abc123",
  unsubscribeUrl: "https://aonde.com.br/api/newsletter/unsubscribe?email=viajante%40example.com",
  offerUrl: "https://aonde.com.br/ir/oferta-gru-lis",
  precoCentavos: 234000,
  precoMedioCentavos: 260000,
};

const TEMPLATES = [
  {
    nome: "confirmacao",
    build: (overrides) =>
      buildConfirmationEmail({
        email: CAMPOS_BASE.email,
        origem: CAMPOS_BASE.origem,
        destino: CAMPOS_BASE.destino,
        precoAlvoCentavos: CAMPOS_BASE.precoAlvoCentavos,
        confirmUrl: CAMPOS_BASE.confirmUrl,
        unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
        ...overrides,
      }),
  },
  {
    nome: "alerta de preco",
    build: (overrides) =>
      buildPriceAlertEmail({
        email: CAMPOS_BASE.email,
        origem: CAMPOS_BASE.origem,
        destino: CAMPOS_BASE.destino,
        precoCentavos: CAMPOS_BASE.precoCentavos,
        precoMedioCentavos: CAMPOS_BASE.precoMedioCentavos,
        offerUrl: CAMPOS_BASE.offerUrl,
        unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
        ...overrides,
      }),
  },
  {
    nome: "boas-vindas",
    build: (overrides) =>
      buildWelcomeEmail({
        email: CAMPOS_BASE.email,
        origem: CAMPOS_BASE.origem,
        destino: CAMPOS_BASE.destino,
        precoAlvoCentavos: CAMPOS_BASE.precoAlvoCentavos,
        unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
        ...overrides,
      }),
  },
];

// -----------------------------------------------------------------------
// 1) Os 3 templates devolvem assunto/texto/html nao-vazios
// -----------------------------------------------------------------------

for (const { nome, build } of TEMPLATES) {
  test(`${nome}: devolve assunto, textoPlano e html preenchidos`, () => {
    const result = build();
    assert.equal(typeof result.assunto, "string");
    assert.ok(result.assunto.trim().length > 0);
    assert.equal(typeof result.textoPlano, "string");
    assert.ok(result.textoPlano.trim().length > 0);
    assert.equal(typeof result.html, "string");
    assert.ok(result.html.trim().length > 0);
    // HTML de e-mail: sem <script>, sem <link> de CSS externo.
    assert.doesNotMatch(result.html, /<script/i);
    assert.doesNotMatch(result.html, /<link[^>]+stylesheet/i);
  });
}

// -----------------------------------------------------------------------
// 2) Link de descadastro presente em TODOS
// -----------------------------------------------------------------------

for (const { nome, build } of TEMPLATES) {
  test(`${nome}: link de descadastro presente no html e no texto`, () => {
    const result = build();
    assert.ok(
      result.html.includes(CAMPOS_BASE.unsubscribeUrl),
      "unsubscribeUrl deveria aparecer no html"
    );
    assert.ok(
      result.textoPlano.includes(CAMPOS_BASE.unsubscribeUrl),
      "unsubscribeUrl deveria aparecer no texto plano"
    );
    // "visivel": nao deve estar so dentro de um comentario/estilo invisivel;
    // o texto "Cancelar inscricao" precisa acompanhar o link em algum lugar
    // legivel do html (nao so a URL crua).
    assert.match(result.html, /Cancelar inscri/i);
  });
}

// -----------------------------------------------------------------------
// 3) Payload malicioso no e-mail sai escapado no HTML
// -----------------------------------------------------------------------

for (const { nome, build } of TEMPLATES) {
  test(`${nome}: e-mail malicioso nao injeta tag/atributo no html`, () => {
    const result = build({ email: EMAIL_MALICIOSO });
    // A tag/atributo bruto nao pode aparecer literalmente no html.
    assert.doesNotMatch(result.html, /<img src=x onerror=alert\(1\)>/);
    assert.doesNotMatch(result.html, /onerror=alert\(1\)>@example\.com/);
    // A versao escapada do payload deve estar presente (prova de que o
    // e-mail malicioso foi de fato usado, so que sanitizado).
    assert.ok(
      result.html.includes("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;@example.com"),
      "esperava encontrar a versao escapada do payload no html"
    );
  });
}

// -----------------------------------------------------------------------
// 4) Versao texto nao contem tags HTML
// -----------------------------------------------------------------------

for (const { nome, build } of TEMPLATES) {
  test(`${nome}: textoPlano nao contem tags HTML`, () => {
    const result = build();
    assert.doesNotMatch(result.textoPlano, /<[a-z][\s\S]*?>/i);
  });
}

// -----------------------------------------------------------------------
// 5) Nenhum template contem linguagem de urgencia falsa
// -----------------------------------------------------------------------

for (const { nome, build } of TEMPLATES) {
  test(`${nome}: sem linguagem de urgencia falsa`, () => {
    const result = build();
    const conteudo = `${result.assunto}\n${result.textoPlano}\n${result.html}`;
    for (const frase of FRASES_URGENCIA) {
      assert.doesNotMatch(conteudo, frase, `nao deveria conter urgencia falsa: ${frase}`);
    }
  });
}

// -----------------------------------------------------------------------
// Conteudo especifico de cada template
// -----------------------------------------------------------------------

test("confirmacao: deixa claro que sem confirmar nao recebe nada", () => {
  const { textoPlano, html } = buildConfirmationEmail({
    email: CAMPOS_BASE.email,
    origem: CAMPOS_BASE.origem,
    confirmUrl: CAMPOS_BASE.confirmUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(textoPlano, /sem confirmar/i);
  assert.match(textoPlano, /nao recebe/i);
  assert.ok(textoPlano.includes(CAMPOS_BASE.confirmUrl));
  assert.ok(html.includes(CAMPOS_BASE.confirmUrl));
});

test("confirmacao: sem rota/preco alvo ainda funciona (so origem)", () => {
  const { textoPlano } = buildConfirmationEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    confirmUrl: CAMPOS_BASE.confirmUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(textoPlano, /São Paulo|GRU/);
});

test("alerta de preco: menciona rota, preco encontrado, comparacao e link", () => {
  const { assunto, textoPlano, html } = buildPriceAlertEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    destino: "LIS",
    precoCentavos: 234000,
    precoMedioCentavos: 260000,
    offerUrl: CAMPOS_BASE.offerUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(assunto, /GRU/);
  assert.match(textoPlano, /R\$\s*2\.340/); // preco encontrado formatado
  assert.match(textoPlano, /abaixo da media/i);
  assert.ok(textoPlano.includes(CAMPOS_BASE.offerUrl));
  assert.ok(html.includes(CAMPOS_BASE.offerUrl));
});

test("alerta de preco: diz que o preco e confirmado no parceiro e pode mudar", () => {
  const { textoPlano, html } = buildPriceAlertEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    destino: "LIS",
    precoCentavos: 234000,
    offerUrl: CAMPOS_BASE.offerUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(textoPlano, /parceiro/i);
  assert.match(textoPlano, /pode mudar/i);
  assert.match(html, /parceiro/i);
});

test("alerta de preco: sem media historica, admite que nao tem comparacao", () => {
  const { textoPlano } = buildPriceAlertEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    destino: "LIS",
    precoCentavos: 234000,
    precoMedioCentavos: null,
    offerUrl: CAMPOS_BASE.offerUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(textoPlano, /nao temos historico/i);
});

test("boas-vindas: explica frequencia e cancelamento em um clique", () => {
  const { textoPlano, html } = buildWelcomeEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(textoPlano, /um clique/i);
  assert.match(textoPlano, /frequencia fixa|sem frequencia/i);
  assert.match(html, /um clique/i);
});

test("boas-vindas: reforca que o Aonde nao processa pagamento nem emite passagem", () => {
  const { textoPlano, html } = buildWelcomeEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.match(textoPlano, /nao processa pagamento/i);
  assert.match(textoPlano, /emite passagem/i);
  assert.match(html, /nao processa pagamento/i);
});

// -----------------------------------------------------------------------
// Funcoes sao puras: mesma entrada -> mesma saida, sem side-effect visivel
// -----------------------------------------------------------------------

test("templates sao puros: chamadas repetidas com mesma entrada dao o mesmo resultado", () => {
  const a = buildPriceAlertEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    destino: "LIS",
    precoCentavos: 234000,
    precoMedioCentavos: 260000,
    offerUrl: CAMPOS_BASE.offerUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  const b = buildPriceAlertEmail({
    email: CAMPOS_BASE.email,
    origem: "GRU",
    destino: "LIS",
    precoCentavos: 234000,
    precoMedioCentavos: 260000,
    offerUrl: CAMPOS_BASE.offerUrl,
    unsubscribeUrl: CAMPOS_BASE.unsubscribeUrl,
  });
  assert.deepEqual(a, b);
});
