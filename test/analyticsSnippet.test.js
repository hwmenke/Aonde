// Injecao do snippet de audiencia: presente so com PLAUSIBLE_DOMAIN valido,
// ausente no padrao, e valores de env nao viram XSS.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyticsCspOrigins,
  analyticsSnippet,
  DEFAULT_PLAUSIBLE_SCRIPT_SRC,
  isPlainHostname,
  resolveAnalytics,
} from "../src/render/analyticsSnippet.js";
import {
  renderHomePage,
  renderNotFoundPage,
  renderPrivacyPage,
} from "../src/render/htmlRenderer.js";
import { createServer } from "../src/server.js";

const ENV_KEYS = ["PLAUSIBLE_DOMAIN", "PLAUSIBLE_SCRIPT_SRC"];

function snapshotEnv() {
  const snap = {};
  for (const key of ENV_KEYS) snap[key] = process.env[key];
  return snap;
}

function restoreEnv(snap) {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key];
  }
}

function withEnv(t, values) {
  const snap = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => restoreEnv(snap));
}

async function withServer(t) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  t.after(() => server.close());
  return `http://127.0.0.1:${port}`;
}

test("isPlainHostname aceita FQDN ASCII e rejeita URL/IP/lixo", () => {
  assert.equal(isPlainHostname("aonde.com.br"), true);
  assert.equal(isPlainHostname("test.aonde.com.br"), true);
  assert.equal(isPlainHostname("Aonde.COM.br"), true);
  assert.equal(isPlainHostname(""), false);
  assert.equal(isPlainHostname("localhost"), false);
  assert.equal(isPlainHostname("https://aonde.com.br"), false);
  assert.equal(isPlainHostname("aonde.com.br/path"), false);
  assert.equal(isPlainHostname("aonde.com.br:443"), false);
  assert.equal(isPlainHostname("127.0.0.1"), false);
  assert.equal(isPlainHostname("aonde.com.br\"><script>"), false);
  assert.equal(isPlainHostname("aonde.com.br\" onload=\"alert(1)"), false);
  assert.equal(isPlainHostname(" aonde.com.br"), false);
});

test("sem PLAUSIBLE_DOMAIN o snippet e vazio", () => {
  const r = resolveAnalytics({});
  assert.equal(r.html, "");
  assert.deepEqual(r.origins, []);
  assert.equal(analyticsSnippet({}), "");
  assert.deepEqual(analyticsCspOrigins({}), []);
});

test("PLAUSIBLE_DOMAIN valido injeta o script padrao do Plausible", () => {
  const r = resolveAnalytics({ PLAUSIBLE_DOMAIN: "test.aonde.com.br" });
  assert.equal(
    r.html,
    `<script defer data-domain="test.aonde.com.br" src="${DEFAULT_PLAUSIBLE_SCRIPT_SRC}"></script>`
  );
  assert.deepEqual(r.origins, ["https://plausible.io"]);
  assert.match(analyticsSnippet({ PLAUSIBLE_DOMAIN: "test.aonde.com.br" }), /data-domain="test\.aonde\.com\.br"/);
});

test("PLAUSIBLE_SCRIPT_SRC https de um .js substitui o src padrao", () => {
  const src = "https://analytics.example.com/js/script.js";
  const r = resolveAnalytics({
    PLAUSIBLE_DOMAIN: "aonde.com.br",
    PLAUSIBLE_SCRIPT_SRC: src,
  });
  assert.equal(r.src, src);
  assert.equal(r.html.includes(`src="${src}"`), true);
  assert.deepEqual(r.origins, ["https://analytics.example.com"]);
});

test("dominio ou src invalidos nao injetam tag", () => {
  const badDomains = [
    "",
    "   ",
    "https://aonde.com.br",
    "aonde.com.br/path",
    "aonde.com.br\"><script>alert(1)</script>",
    "javascript:alert(1)",
    "<script>alert(1)</script>",
  ];
  for (const domain of badDomains) {
    const r = resolveAnalytics({ PLAUSIBLE_DOMAIN: domain });
    assert.equal(r.html, "", `dominio rejeitado: ${JSON.stringify(domain)}`);
  }

  const badSrc = [
    "javascript:alert(1)",
    "http://plausible.io/js/script.js",
    "https://plausible.io/js/script.js\"></script><script>alert(1)</script>",
    "https://plausible.io/not-js",
    "https://127.0.0.1/js/script.js",
  ];
  for (const src of badSrc) {
    const r = resolveAnalytics({
      PLAUSIBLE_DOMAIN: "aonde.com.br",
      PLAUSIBLE_SCRIPT_SRC: src,
    });
    assert.equal(r.html, "", `src rejeitado: ${JSON.stringify(src)}`);
  }
});

test("valores de env nao quebram o HTML (sem XSS)", () => {
  const payloads = [
    `aonde.com.br"><img src=x onerror=alert(1)>`,
    `aonde.com.br'><script>alert(1)</script>`,
    `aonde.com.br" onfocus="alert(1)" x="`,
  ];
  for (const domain of payloads) {
    const html = analyticsSnippet({ PLAUSIBLE_DOMAIN: domain });
    assert.equal(html, "");
    assert.doesNotMatch(html, /<script>alert/i);
    assert.doesNotMatch(html, /onerror=/i);
    assert.doesNotMatch(html, /onfocus=/i);
  }

  const html = analyticsSnippet({
    PLAUSIBLE_DOMAIN: "aonde.com.br",
    PLAUSIBLE_SCRIPT_SRC: `https://evil.test/x.js"></script><script>alert(1)</script>`,
  });
  assert.equal(html, "");
  assert.doesNotMatch(html, /alert\(1\)/);
});

test("htmlDocument so emite o tag quando o env esta setado", (t) => {
  withEnv(t, {});
  const off = renderHomePage({});
  assert.doesNotMatch(off, /plausible\.io/);
  assert.doesNotMatch(off, /data-domain=/);
  assert.doesNotMatch(renderNotFoundPage({}), /plausible\.io/);
  assert.doesNotMatch(renderPrivacyPage(), /data-domain=/);

  process.env.PLAUSIBLE_DOMAIN = "test.aonde.com.br";
  const on = renderHomePage({});
  assert.match(
    on,
    /<script defer data-domain="test\.aonde\.com\.br" src="https:\/\/plausible\.io\/js\/script\.js"><\/script>/
  );
  assert.match(renderNotFoundPage({}), /data-domain="test\.aonde\.com\.br"/);
  assert.match(renderPrivacyPage(), /data-domain="test\.aonde\.com\.br"/);

  process.env.PLAUSIBLE_DOMAIN = `test.aonde.com.br"><script>alert(1)</script>`;
  const xss = renderHomePage({});
  assert.doesNotMatch(xss, /plausible\.io/);
  assert.doesNotMatch(xss, /<script>alert\(1\)<\/script>/);
});

test("pagina de privacidade descreve audiencia opcional sem cookies", (t) => {
  withEnv(t, {});
  const html = renderPrivacyPage();
  assert.match(html, /Audiência \(opcional\)/);
  assert.match(html, /Plausible/);
  assert.match(html, /sem cookies/i);
});

test("GET / nao carrega Plausible sem env; carrega com dominio valido", async (t) => {
  withEnv(t, {});
  const base = await withServer(t);

  let res = await fetch(base + "/");
  let body = await res.text();
  assert.equal(res.status, 200);
  assert.doesNotMatch(body, /plausible\.io/);
  assert.doesNotMatch(res.headers.get("content-security-policy") || "", /plausible\.io/);

  process.env.PLAUSIBLE_DOMAIN = "test.aonde.com.br";
  res = await fetch(base + "/");
  body = await res.text();
  const csp = res.headers.get("content-security-policy") || "";
  assert.match(body, /data-domain="test\.aonde\.com\.br"/);
  assert.match(body, /src="https:\/\/plausible\.io\/js\/script\.js"/);
  assert.match(csp, /script-src[^;]*https:\/\/plausible\.io/);
  assert.match(csp, /connect-src[^;]*https:\/\/plausible\.io/);
});

test("CSP usa a origem do PLAUSIBLE_SCRIPT_SRC self-hosted", async (t) => {
  withEnv(t, {
    PLAUSIBLE_DOMAIN: "aonde.com.br",
    PLAUSIBLE_SCRIPT_SRC: "https://stats.example.org/js/script.js",
  });
  const base = await withServer(t);
  const res = await fetch(base + "/hoje");
  const body = await res.text();
  const csp = res.headers.get("content-security-policy") || "";
  assert.match(body, /src="https:\/\/stats\.example\.org\/js\/script\.js"/);
  assert.match(csp, /script-src[^;]*https:\/\/stats\.example\.org/);
  assert.match(csp, /connect-src[^;]*https:\/\/stats\.example\.org/);
  assert.doesNotMatch(csp, /plausible\.io/);
});
