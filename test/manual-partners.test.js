import test from "node:test";
import assert from "node:assert/strict";

import { getDealLinkHurb } from "../src/partners/hurb.js";
import { getDealLinkPassagensPromo } from "../src/partners/passagensPromo.js";

test("getDealLinkHurb retorna ok:false com mensagem clara sem HURB_TRACKED_LINK", async () => {
  const original = process.env.HURB_TRACKED_LINK;
  delete process.env.HURB_TRACKED_LINK;

  try {
    const result = await getDealLinkHurb({});
    assert.equal(result.ok, false);
    assert.equal(result.partner, "hurb");
    assert.equal(result.method, "manual");
    assert.match(result.error, /HURB_TRACKED_LINK/);
    assert.match(result.error, /painel/);
  } finally {
    if (original !== undefined) process.env.HURB_TRACKED_LINK = original;
  }
});

test("getDealLinkHurb repassa o link configurado em HURB_TRACKED_LINK", async () => {
  const original = process.env.HURB_TRACKED_LINK;
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/abc123";

  try {
    const result = await getDealLinkHurb({});
    assert.equal(result.ok, true);
    assert.equal(result.method, "manual");
    assert.equal(result.url, "https://www.clubehu.com.br/go/abc123");
  } finally {
    if (original === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = original;
  }
});

test("getDealLinkHurb aceita override via options.trackedLink", async () => {
  const original = process.env.HURB_TRACKED_LINK;
  delete process.env.HURB_TRACKED_LINK;

  try {
    const result = await getDealLinkHurb({ trackedLink: "https://www.clubehu.com.br/go/override" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.clubehu.com.br/go/override");
  } finally {
    if (original !== undefined) process.env.HURB_TRACKED_LINK = original;
  }
});

test("getDealLinkPassagensPromo retorna ok:false com mensagem clara sem PASSAGENS_PROMO_TRACKED_LINK", async () => {
  const original = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  delete process.env.PASSAGENS_PROMO_TRACKED_LINK;

  try {
    const result = await getDealLinkPassagensPromo({});
    assert.equal(result.ok, false);
    assert.equal(result.partner, "passagens-promo");
    assert.equal(result.method, "manual");
    assert.match(result.error, /PASSAGENS_PROMO_TRACKED_LINK/);
    assert.match(result.error, /Portal do Afiliado/);
  } finally {
    if (original !== undefined) process.env.PASSAGENS_PROMO_TRACKED_LINK = original;
  }
});

test("getDealLinkPassagensPromo repassa o link configurado", async () => {
  const original = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  process.env.PASSAGENS_PROMO_TRACKED_LINK = "https://www.parceirospromo.com.br/go/xyz789";

  try {
    const result = await getDealLinkPassagensPromo({});
    assert.equal(result.ok, true);
    assert.equal(result.method, "manual");
    assert.equal(result.url, "https://www.parceirospromo.com.br/go/xyz789");
  } finally {
    if (original === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
    else process.env.PASSAGENS_PROMO_TRACKED_LINK = original;
  }
});

// ---------------------------------------------------------------------------
// Registro de links por rota/oferta (HURB_TRACKED_LINKS_JSON /
// PASSAGENS_PROMO_TRACKED_LINKS_JSON)
// ---------------------------------------------------------------------------

test("getDealLinkHurb resolve link exato por offerId no registro", async () => {
  const originalLink = process.env.HURB_TRACKED_LINK;
  const originalRegistry = process.env.HURB_TRACKED_LINKS_JSON;
  delete process.env.HURB_TRACKED_LINK;
  process.env.HURB_TRACKED_LINKS_JSON = JSON.stringify({
    "oferta-123": "https://www.clubehu.com.br/go/oferta123",
    "GRU-LIS": "https://www.clubehu.com.br/go/gru-lis",
  });

  try {
    const result = await getDealLinkHurb({ offerId: "oferta-123" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.clubehu.com.br/go/oferta123");
    assert.equal(result.source, "registry:offerId");
  } finally {
    if (originalLink === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.HURB_TRACKED_LINKS_JSON;
    else process.env.HURB_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkHurb resolve link por rota (origin+destination) no registro", async () => {
  const originalLink = process.env.HURB_TRACKED_LINK;
  const originalRegistry = process.env.HURB_TRACKED_LINKS_JSON;
  delete process.env.HURB_TRACKED_LINK;
  process.env.HURB_TRACKED_LINKS_JSON = JSON.stringify({
    "GRU-LIS": "https://www.clubehu.com.br/go/gru-lis",
  });

  try {
    const result = await getDealLinkHurb({ origin: "gru", destination: "lis" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.clubehu.com.br/go/gru-lis");
    assert.equal(result.source, "registry:route");
  } finally {
    if (originalLink === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.HURB_TRACKED_LINKS_JSON;
    else process.env.HURB_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkHurb cai no fallback global quando nao ha entrada especifica no registro", async () => {
  const originalLink = process.env.HURB_TRACKED_LINK;
  const originalRegistry = process.env.HURB_TRACKED_LINKS_JSON;
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/global";
  process.env.HURB_TRACKED_LINKS_JSON = JSON.stringify({
    "GRU-LIS": "https://www.clubehu.com.br/go/gru-lis",
  });

  try {
    const result = await getDealLinkHurb({ origin: "GRU", destination: "GIG" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.clubehu.com.br/go/global");
    assert.equal(result.source, "fallback-global");
  } finally {
    if (originalLink === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.HURB_TRACKED_LINKS_JSON;
    else process.env.HURB_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkHurb: options.trackedLink (override explicito) vence registro e fallback", async () => {
  const originalLink = process.env.HURB_TRACKED_LINK;
  const originalRegistry = process.env.HURB_TRACKED_LINKS_JSON;
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/global";
  process.env.HURB_TRACKED_LINKS_JSON = JSON.stringify({
    "GRU-LIS": "https://www.clubehu.com.br/go/gru-lis",
  });

  try {
    const result = await getDealLinkHurb({
      origin: "GRU",
      destination: "LIS",
      trackedLink: "https://www.clubehu.com.br/go/override",
    });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.clubehu.com.br/go/override");
    assert.equal(result.source, "override");
  } finally {
    if (originalLink === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.HURB_TRACKED_LINKS_JSON;
    else process.env.HURB_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkHurb: JSON malformado em HURB_TRACKED_LINKS_JSON nao derruba o modulo", async () => {
  const originalLink = process.env.HURB_TRACKED_LINK;
  const originalRegistry = process.env.HURB_TRACKED_LINKS_JSON;
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/global";
  process.env.HURB_TRACKED_LINKS_JSON = "{isso nao e json valido";

  try {
    const result = await getDealLinkHurb({ origin: "GRU", destination: "LIS" });
    // registro invalido vira {} silenciosamente -> cai no fallback global
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.clubehu.com.br/go/global");
    assert.equal(result.source, "fallback-global");
  } finally {
    if (originalLink === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.HURB_TRACKED_LINKS_JSON;
    else process.env.HURB_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkHurb: JSON malformado e sem fallback global retorna ok:false com mensagem clara", async () => {
  const originalLink = process.env.HURB_TRACKED_LINK;
  const originalRegistry = process.env.HURB_TRACKED_LINKS_JSON;
  delete process.env.HURB_TRACKED_LINK;
  process.env.HURB_TRACKED_LINKS_JSON = "[1, 2, 3]"; // array, nao objeto plano

  try {
    const result = await getDealLinkHurb({ origin: "GRU", destination: "LIS" });
    assert.equal(result.ok, false);
    assert.match(result.error, /HURB_TRACKED_LINK/);
    assert.match(result.error, /HURB_TRACKED_LINKS_JSON/);
  } finally {
    if (originalLink === undefined) delete process.env.HURB_TRACKED_LINK;
    else process.env.HURB_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.HURB_TRACKED_LINKS_JSON;
    else process.env.HURB_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkPassagensPromo resolve link exato por offerId no registro", async () => {
  const originalLink = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  const originalRegistry = process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
  delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
  process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = JSON.stringify({
    "offerId-custom": "https://www.parceirospromo.com.br/go/link2",
  });

  try {
    const result = await getDealLinkPassagensPromo({ offerId: "offerId-custom" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.parceirospromo.com.br/go/link2");
    assert.equal(result.source, "registry:offerId");
  } finally {
    if (originalLink === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
    else process.env.PASSAGENS_PROMO_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
    else process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkPassagensPromo resolve link por rota no registro", async () => {
  const originalLink = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  const originalRegistry = process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
  delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
  process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = JSON.stringify({
    "GRU-LIS": "https://www.parceirospromo.com.br/go/rota1",
  });

  try {
    const result = await getDealLinkPassagensPromo({ origin: "GRU", destination: "LIS" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.parceirospromo.com.br/go/rota1");
    assert.equal(result.source, "registry:route");
  } finally {
    if (originalLink === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
    else process.env.PASSAGENS_PROMO_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
    else process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkPassagensPromo cai no fallback global quando nao ha entrada especifica", async () => {
  const originalLink = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  const originalRegistry = process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
  process.env.PASSAGENS_PROMO_TRACKED_LINK = "https://www.parceirospromo.com.br/go/global";
  process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = JSON.stringify({
    "GRU-LIS": "https://www.parceirospromo.com.br/go/rota1",
  });

  try {
    const result = await getDealLinkPassagensPromo({ origin: "GRU", destination: "GIG" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.parceirospromo.com.br/go/global");
    assert.equal(result.source, "fallback-global");
  } finally {
    if (originalLink === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
    else process.env.PASSAGENS_PROMO_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
    else process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkPassagensPromo: override explicito vence registro e fallback", async () => {
  const originalLink = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  const originalRegistry = process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
  process.env.PASSAGENS_PROMO_TRACKED_LINK = "https://www.parceirospromo.com.br/go/global";
  process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = JSON.stringify({
    "GRU-LIS": "https://www.parceirospromo.com.br/go/rota1",
  });

  try {
    const result = await getDealLinkPassagensPromo({
      origin: "GRU",
      destination: "LIS",
      trackedLink: "https://www.parceirospromo.com.br/go/override",
    });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.parceirospromo.com.br/go/override");
    assert.equal(result.source, "override");
  } finally {
    if (originalLink === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
    else process.env.PASSAGENS_PROMO_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
    else process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = originalRegistry;
  }
});

test("getDealLinkPassagensPromo: JSON malformado em PASSAGENS_PROMO_TRACKED_LINKS_JSON nao derruba o modulo", async () => {
  const originalLink = process.env.PASSAGENS_PROMO_TRACKED_LINK;
  const originalRegistry = process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
  process.env.PASSAGENS_PROMO_TRACKED_LINK = "https://www.parceirospromo.com.br/go/global";
  process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = "nao e json";

  try {
    const result = await getDealLinkPassagensPromo({ origin: "GRU", destination: "LIS" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://www.parceirospromo.com.br/go/global");
    assert.equal(result.source, "fallback-global");
  } finally {
    if (originalLink === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINK;
    else process.env.PASSAGENS_PROMO_TRACKED_LINK = originalLink;
    if (originalRegistry === undefined) delete process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON;
    else process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON = originalRegistry;
  }
});
