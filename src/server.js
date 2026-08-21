// API REST zero-dependencia (node:http, sem framework).
//
// createServer() retorna o http.Server SEM dar listen — quem chama decide a
// porta (nos testes, server.listen(0) sobe numa porta livre). Todo request e
// tratado dentro de um try/catch: um request malformado responde erro JSON,
// nunca derruba o processo.
//
// Endpoints:
//   GET  /api/health              -> validateConfig() + contagem de rotas/ofertas
//   GET  /api/offers?status=...   -> lista do offersStore (default: todas)
//   GET  /api/offers/:id          -> oferta ou 404 JSON
//   POST /api/offers/:id/click    -> registra clique (data/clicks.jsonl) e
//                                    responde { redirect: affiliate_url }
//   GET  /saida/voo?origem=&destino= -> interstitial de saida para busca de
//                                    voo por rota (nao e uma oferta do
//                                    catalogo); registra clique com id
//                                    "voo:ORIGEM-DESTINO". Ver handleExitFlightHtml.
//   POST /api/newsletter/subscribe   -> dispara double opt-in (LGPD)
//   GET  /api/newsletter/confirm     -> confirma opt-in via token
//   POST /api/newsletter/unsubscribe -> descadastro idempotente
//   POST /api/alerts                 -> cria regra de alerta de preco
//
// CORS: habilitado apenas se AONDE_CORS_ORIGIN estiver definido (ausente = sem
// header CORS algum).
//
// SEGURANCA (inbound):
//   - Rate limiting por IP (janela fixa, em memoria) nos 4 POSTs publicos de
//     escrita acima (subscribe/unsubscribe/alerts/click). Ver
//     src/inboundRateLimiter.js para o algoritmo e as env vars de config.
//   - A resposta de /api/newsletter/subscribe e sempre { status: "ok" } —
//     nunca revela se o e-mail ja estava cadastrado/confirmado (evita
//     enumeracao de e-mails). O comportamento interno (nao reenviar opt-in a
//     quem ja confirmou) continua diferenciado, so a resposta HTTP nao vaza.
//   - Redirecionamentos de afiliado (handleClick/handleExitHtml) so aceitam
//     affiliate_url com esquema http:/https: — outros esquemas (ex.:
//     "javascript:") sao rejeitados com 409.

import http from "node:http";
import { gzipSync, brotliCompressSync } from "node:zlib";
import path from "node:path";
import { appendFileSync, readFileSync, existsSync } from "node:fs";

import { validateConfig } from "./health.js";
import { getConfig } from "./config.js";
import { listOffers, getOffer, countOffers } from "./store/offersStore.js";
import {
  renderHomePage,
  renderOffersPage,
  renderOfferPage,
  renderGuidePage,
  renderGuidesIndexPage,
  renderResultsPage,
  renderMapPage,
  renderExitPage,
  renderHelpPage,
  renderCancelPage,
  renderAlertsPage,
  renderNewsletterStatusPage,
  renderUnsubscribePage,
  renderNotFoundPage,
  renderServerErrorPage,
  renderTodayPage,
  styleAssetPath,
  pageStylesCss,
  STYLE_TAG_RE,
} from "./render/htmlRenderer.js";
import { renderExitFlightPage, buildAviasalesSearchUrl } from "./render/exitFlight.js";
import { OFFERS as CONTENT_OFFERS, GUIDES, RESULTS_ROUTE } from "./render/aondeContent.js";
import { resolveAeroporto } from "./render/aeroportos.js";
import { buscarVoosAoVivo } from "./flights/buscarVoos.js";
import { pacoteDoDia } from "./daily/dailyPick.js";
import { listRoutes } from "./store/priceHistory.js";
import { resolveDataDir, ensureDir } from "./store/dataDir.js";
import {
  subscribe as subscribeNewsletter,
  confirm as confirmNewsletter,
  unsubscribe as unsubscribeNewsletter,
  getSubscriberByEmail,
  clearPendingAlert,
} from "./newsletter/subscriberStore.js";
import { addAlertRule } from "./newsletter/alertRules.js";
import { createInboundRateLimiter, clientIp } from "./inboundRateLimiter.js";

function corsHeaders() {
  const origin = process.env.AONDE_CORS_ORIGIN;
  if (!origin || origin.trim() === "") return {};
  return {
    "Access-Control-Allow-Origin": origin.trim(),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Headers de seguranca aplicados a TODA resposta, inclusive 404 e 500.
// A CSP declara default-src e libera explicitamente so o que o site usa
// (fontes do Google, Maps, imagens https). 'unsafe-inline' segue necessario
// porque ha <script>/<style> embutidos — trocar por nonce e o proximo passo.
function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    // script-src/style-src explicitos: sem eles nao havia restricao NENHUMA
    // sobre execucao de script — mais fraco que declarar 'unsafe-inline'. Hoje
    // nao ha XSS conhecido (foi atacado com payload real e seguraram), mas isto
    // e defesa em profundidade: se um escape falhar amanha, a CSP limita o
    // estrago. 'unsafe-inline' e necessario porque o site serve <script> e
    // <style> embutidos; o passo seguinte e trocar por nonce por resposta.
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https://maps.googleapis.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  };
}

// Requisicao de curadoria interna autenticada por token (AONDE_ADMIN_TOKEN).
function isAdminRequest(req) {
  const token = process.env.AONDE_ADMIN_TOKEN;
  return !!token && req.headers["x-admin-token"] === token;
}

// Troca o <style> inline pelo <link> do CSS cacheavel. O renderer emite inline
// (as amostras em disco dependem disso); quem serve o arquivo e este servidor,
// entao a troca acontece aqui, na saida — sem estado global no renderer.
function externalizeStyles(html) {
  return html.replace(STYLE_TAG_RE, `<link rel="stylesheet" href="${styleAssetPath()}">`);
}

/**
 * Verdadeiro quando quem pediu foi um NAVEGADOR navegando (aceita text/html),
 * e o caminho nao e de API. Serve para decidir entre pagina e JSON nos erros.
 */
function querHtml(req, pathname) {
  if (typeof pathname === "string" && pathname.startsWith("/api/")) return false;
  const aceita = String((req && req.headers && req.headers.accept) || "");
  return aceita.includes("text/html");
}

/**
 * Compressao de resposta. HTML e CSS deste site sao texto puro e comprimem
 * MUITO bem; sem isto cada visita em 4G baixa varias vezes mais bytes do que
 * precisa. Escolhe brotli quando o navegador aceita (melhor taxa), senao gzip,
 * senao manda cru.
 *
 * Sincrono de proposito: as respostas aqui sao pequenas (dezenas de KB) e o
 * caminho assincrono complicaria o Content-Length, que varios testes conferem.
 */
function comprimir(res, corpo) {
  const aceita = String((res && res.aceitaEncoding) || "");
  const buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, "utf-8");
  // Abaixo de ~1 KB o cabecalho de compressao custa mais do que economiza.
  if (buf.length < 1024) return { buf, encoding: null };
  try {
    if (/\bbr\b/.test(aceita)) return { buf: brotliCompressSync(buf), encoding: "br" };
    if (/\bgzip\b/.test(aceita)) return { buf: gzipSync(buf), encoding: "gzip" };
  } catch {
    // Falha de compressao nunca pode derrubar a resposta: manda cru.
  }
  return { buf, encoding: null };
}

function sendHtml(res, status, rawHtml) {
  const html = externalizeStyles(rawHtml);
  const { buf, encoding } = comprimir(res, html);
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    ...(encoding ? { "Content-Encoding": encoding, Vary: "Accept-Encoding" } : {}),
    ...securityHeaders(),
    ...corsHeaders(),
  });
  res.end(buf);
}

function sendText(res, status, text, contentType) {
  const { buf, encoding } = comprimir(res, text);
  res.writeHead(status, {
    "Content-Type": contentType || "text/plain; charset=utf-8",
    "Content-Length": buf.length,
    ...(encoding ? { "Content-Encoding": encoding, Vary: "Accept-Encoding" } : {}),
    ...securityHeaders(),
    ...corsHeaders(),
  });
  res.end(buf);
}

function sendJson(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...securityHeaders(),
    ...corsHeaders(),
    ...(extraHeaders || {}),
  });
  res.end(body);
}

// Esquemas aceitos como destino de redirecionamento para o link do parceiro.
// Bloqueia esquemas perigosos (ex.: "javascript:") caso um affiliate_url mal
// formado ou adulterado chegue ate aqui — defesa em profundidade, o dado
// tambem deveria ser validado na curadoria/entrada.
const SAFE_REDIRECT_SCHEMES = new Set(["http:", "https:"]);

function isSafeRedirectUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    return SAFE_REDIRECT_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Le o corpo da requisicao e faz parse como JSON. Resolve para { ok, body } ou
 * { ok: false, error } (JSON invalido / corpo grande demais). Limite defensivo
 * de 64 KB — os payloads desta API sao pequenos.
 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > 64 * 1024) {
        aborted = true;
        resolve({ ok: false, error: "Corpo da requisicao grande demais." });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (raw === "") return resolve({ ok: true, body: {} });

      // Um <form method="post"> sem JavaScript manda
      // application/x-www-form-urlencoded, nao JSON. Antes so aceitavamos JSON,
      // entao quem estava sem JS (ou com ele quebrado) recebia
      // 400 {"error":...} cru na tela, sem HTML e sem caminho de volta — nos
      // tres formularios do site: newsletter, alerta de preco e descadastro.
      const tipo = String((req.headers && req.headers["content-type"]) || "");
      if (tipo.includes("application/x-www-form-urlencoded")) {
        const body = {};
        for (const [k, v] of new URLSearchParams(raw)) body[k] = v;
        return resolve({ ok: true, body, form: true });
      }

      try {
        resolve({ ok: true, body: JSON.parse(raw) });
      } catch {
        resolve({ ok: false, error: "Corpo da requisicao nao e um JSON valido." });
      }
    });
    req.on("error", () => resolve({ ok: false, error: "Falha ao ler o corpo da requisicao." }));
  });
}

/** Registra um clique em data/clicks.jsonl (append, uma linha JSON por clique). */
function recordClick(id, userAgent) {
  const dir = resolveDataDir();
  ensureDir(dir);
  const line =
    JSON.stringify({
      id,
      timestamp: new Date().toISOString(),
      userAgent: userAgent || null,
    }) + "\n";
  appendFileSync(path.join(dir, "clicks.jsonl"), line, "utf-8");
}

function handleHealth(res) {
  const config = validateConfig();
  sendJson(res, 200, {
    ok: true,
    config,
    storedRoutes: listRoutes().length,
    storedOffers: countOffers(),
  });
}

function handleListOffers(req, res, url) {
  // Publico: SO ofertas publicadas (rascunhos nao revisados nunca vazam).
  // Curadoria interna (admin token) pode listar todas / filtrar por status.
  if (isAdminRequest(req)) {
    const status = url.searchParams.get("status") || undefined;
    const offers = listOffers({ status });
    sendJson(res, 200, { ok: true, count: offers.length, offers });
    return;
  }
  const offers = listOffers({ status: "publicada" });
  sendJson(res, 200, { ok: true, count: offers.length, offers });
}

function handleGetOffer(req, res, id) {
  const offer = getOffer(id);
  // 404 para inexistente E para rascunho (nao revela a existencia de rascunhos).
  if (!offer || (offer.status !== "publicada" && !isAdminRequest(req))) {
    sendJson(res, 404, { error: `Oferta nao encontrada: ${id}` });
    return;
  }
  sendJson(res, 200, { ok: true, offer });
}

function handleClick(req, res, id) {
  const offer = getOffer(id);
  if (!offer) {
    sendJson(res, 404, { error: `Oferta nao encontrada: ${id}` });
    return;
  }
  if (!offer.affiliate_url) {
    sendJson(res, 409, {
      error: `Oferta "${id}" nao possui affiliate_url — nao ha para onde redirecionar.`,
    });
    return;
  }
  // So http:/https: sao aceitos como destino (defesa contra esquemas como
  // "javascript:" num affiliate_url mal formado/adulterado).
  if (!isSafeRedirectUrl(offer.affiliate_url)) {
    sendJson(res, 409, {
      error: `Oferta "${id}" possui affiliate_url com esquema nao permitido (so http/https).`,
    });
    return;
  }
  recordClick(id, req.headers["user-agent"]);
  // O front decide redirecionar (contrato do handoff do produto): devolvemos a
  // URL de destino com status 200, sem emitir um 302 aqui.
  sendJson(res, 200, { redirect: offer.affiliate_url });
}

async function handleNewsletterSubscribe(req, res) {
  const parsed = await readJsonBody(req);
  // Submit de <form> nativo (sem JS) merece HTML, nao JSON cru na tela. O JS
  // da pagina manda JSON e continua recebendo JSON, como antes.
  const veioDeForm = parsed.form === true;
  if (!parsed.ok) {
    if (veioDeForm) sendHtml(res, 400, renderNewsletterStatusPage({ ok: false, error: parsed.error }));
    else sendJson(res, 400, { error: parsed.error });
    return;
  }
  const { email, whatsapp, origem, destino, precoAlvoCentavos } = parsed.body || {};
  const result = subscribeNewsletter({ email, whatsapp, origem, destino, precoAlvoCentavos });
  if (!result.ok) {
    if (veioDeForm) sendHtml(res, 400, renderNewsletterStatusPage({ ok: false, error: result.error }));
    else sendJson(res, 400, { error: result.error });
    return;
  }

  // DEV: sem provedor de e-mail, o token de confirmacao nunca vai na resposta
  // HTTP (iria por e-mail). Para permitir teste manual, quando
  // AONDE_DEV_LOG_OPTIN=1 logamos a URL de confirmacao no console do servidor.
  // NUNCA habilite isso em producao — o token no log da acesso a confirmacao.
  if (result.status === "pending_optin" && process.env.AONDE_DEV_LOG_OPTIN === "1") {
    console.log(
      `[aonde-affiliates][DEV] Opt-in de ${result.subscriber.email}: /api/newsletter/confirm?token=${result.token}`
    );
  }

  // Resposta HTTP GENERICA de proposito: nao distinguimos "pending_optin" de
  // "already_confirmed" para quem consome a API. Devolver o status real
  // permitiria enumerar e-mails ja cadastrados (bastaria tentar assinar um
  // e-mail e observar a resposta). O comportamento interno CONTINUA
  // diferenciado (nao reenviamos opt-in para quem ja confirmou — ver
  // subscriberStore.subscribe()); so a resposta publica foi uniformizada. O
  // token JAMAIS aparece na resposta publica.
  if (veioDeForm) {
    // Mesma mensagem uniforme do JSON (nao revela se o e-mail ja existia),
    // so que numa pagina de verdade, com caminho de volta para o site.
    sendHtml(res, 200, renderNewsletterStatusPage({ ok: true, pendente: true }));
    return;
  }
  sendJson(res, 200, { status: "ok" });
}

// Depois do double opt-in, transforma um `pending_alert` em AlertRule real.
// Resiliente: NUNCA falha a confirmacao do e-mail por causa disso.
function activatePendingAlert(subscriber) {
  const pa = subscriber && subscriber.pending_alert;
  if (!pa) return;
  try {
    addAlertRule({
      subscriberId: subscriber.id,
      origem: subscriber.origem_preferida,
      destino: pa.destino || undefined,
      precoAlvoCentavos: pa.preco_alvo_centavos || undefined,
      canais: subscriber.channels,
    });
    clearPendingAlert(subscriber.id);
  } catch {
    /* nunca derruba a confirmacao */
  }
}

function handleNewsletterConfirm(req, res, url) {
  const token = url.searchParams.get("token");
  const result = confirmNewsletter(token);
  if (result.ok) activatePendingAlert(result.subscriber);
  // Este link e aberto no navegador (vindo do e-mail): quando o cliente aceita
  // HTML, devolvemos uma pagina de verdade; senao, mantemos o contrato JSON.
  const wantsHtml = (req.headers.accept || "").includes("text/html");
  if (!result.ok) {
    if (wantsHtml) {
      sendHtml(res, 400, renderNewsletterStatusPage({ ok: false, error: result.error }));
      return;
    }
    sendJson(res, 400, { ok: false, error: result.error });
    return;
  }
  if (wantsHtml) {
    sendHtml(res, 200, renderNewsletterStatusPage({ ok: true }));
    return;
  }
  sendJson(res, 200, { ok: true, message: "Inscricao confirmada! Voce recebera nossos alertas de preco." });
}

async function handleNewsletterUnsubscribe(req, res) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const veioDeForm = parsed.form === true;
  const { email } = parsed.body || {};
  const result = unsubscribeNewsletter(email);
  if (!result.ok) {
    // Unico caso de 400: input invalido (e-mail malformado).
    if (veioDeForm) sendHtml(res, 400, renderNewsletterStatusPage({ ok: false, error: result.error }));
    else sendJson(res, 400, { error: result.error });
    return;
  }
  // Idempotente e sem vazar existencia: sempre a mesma resposta.
  if (veioDeForm) {
    sendHtml(res, 200, renderNewsletterStatusPage({ ok: true, descadastrado: true }));
    return;
  }
  sendJson(res, 200, { ok: true, message: "Se o e-mail estava inscrito, foi descadastrado." });
}

async function handleCreateAlert(req, res) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const { email, origem, destino, precoAlvoCentavos } = parsed.body || {};

  const subscriber = getSubscriberByEmail(email);
  if (!subscriber) {
    sendJson(res, 404, { error: "Assinante nao encontrado. Inscreva-se antes de criar um alerta." });
    return;
  }
  if (!subscriber.double_optin_confirmed || subscriber.unsubscribed_at) {
    sendJson(res, 409, {
      error: "Assinante nao confirmou a inscricao (double opt-in) ou esta descadastrado.",
    });
    return;
  }

  const result = addAlertRule({
    subscriberId: subscriber.id,
    origem,
    destino,
    precoAlvoCentavos,
    canais: subscriber.channels,
  });
  if (!result.ok) {
    sendJson(res, 400, { error: result.error });
    return;
  }
  sendJson(res, 201, { ok: true, rule: result.rule });
}

// ---- Paginas HTML (front-end portado do prototipo) ----
//
// Alimentadas por dados AO VIVO do offersStore quando ha ofertas publicadas;
// senao, caem para a curadoria editorial de aondeContent (as paginas sempre
// renderizam, mesmo com o store vazio).

/** Ofertas publicadas do store; [] quando vazio (o renderer usa o fallback). */
function publishedLiveOffers() {
  return listOffers({ status: "publicada" });
}

function handleHome(res) {
  sendHtml(res, 200, renderHomePage({ offers: publishedLiveOffers() }));
}

function handleOffersHtml(res, url) {
  const origem = url.searchParams.get("origem") || undefined;
  sendHtml(res, 200, renderOffersPage(publishedLiveOffers(), { origem }));
}

// Ofertas semelhantes: mesmo `tipo`, exceto a propria, no maximo 3.
function relatedOffers(pool, current) {
  return pool.filter((o) => o.id !== current.id && o.tipo === current.tipo).slice(0, 3);
}

function handleOfferHtml(res, id) {
  const apiKey = getConfig().googleMaps.apiKey;
  const live = getOffer(id);
  if (live) {
    const related = relatedOffers(publishedLiveOffers(), live);
    sendHtml(res, 200, renderOfferPage(live, { related, apiKey }));
    return;
  }
  const editorial = CONTENT_OFFERS.find((o) => o.id === id);
  if (editorial) {
    const related = relatedOffers(CONTENT_OFFERS, editorial);
    sendHtml(res, 200, renderOfferPage(editorial, { related, apiKey }));
    return;
  }
  // Nao encontrada: devolve o feed de ofertas com 404 (pagina util, nao um JSON seco).
  sendHtml(res, 404, renderOffersPage(publishedLiveOffers(), {}));
}

function handleGuideHtml(res, id) {
  if (GUIDES[id]) {
    sendHtml(res, 200, renderGuidePage(id, { apiKey: getConfig().googleMaps.apiKey }));
    return;
  }
  sendHtml(res, 404, renderHomePage({ offers: publishedLiveOffers() }));
}

function siteBaseUrl() {
  // Fonte unica: config.siteUrl (o renderer usa a mesma para canonical/og:url).
  return getConfig().siteUrl;
}

// CSS servido como arquivo, com hash no nome. O hash muda quando o CSS muda,
// entao pode ser cacheado para sempre sem risco de versao velha.
function handleStyleAsset(res, pathname) {
  if (pathname !== styleAssetPath()) {
    // Hash antigo (deploy anterior): responde 404 para o navegador buscar o
    // nome novo em vez de servir CSS desatualizado como se fosse eterno.
    sendText(res, 404, "/* asset nao encontrado */", "text/css; charset=utf-8");
    return;
  }
  const css = pageStylesCss();
  res.writeHead(200, {
    "Content-Type": "text/css; charset=utf-8",
    "Content-Length": Buffer.byteLength(css),
    "Cache-Control": "public, max-age=31536000, immutable",
    ...securityHeaders(),
    ...corsHeaders(),
  });
  res.end(css);
}

// Serve OG images para social sharing de public/og/. Permite apenas arquivos
// .jpg/.jpeg/.png com nome seguro (alphanumerico, hifen, underscore). Cache
// longo porque sao assets de conteudo versionados por nome.
function handleOgImage(res, pathname) {
  const filename = path.basename(pathname);
  // Validacao: so aceita nomes seguros e extensoes de imagem conhecidas.
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i.test(filename)) {
    sendText(res, 400, "Nome de arquivo invalido", "text/plain; charset=utf-8");
    return;
  }
  const filePath = path.join(process.cwd(), "public", "og", filename);
  if (!existsSync(filePath)) {
    sendText(res, 404, "Imagem nao encontrada", "text/plain; charset=utf-8");
    return;
  }
  try {
    const buffer = readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": buffer.length,
      "Cache-Control": "public, max-age=2592000", // 30 dias
      ...securityHeaders(),
      ...corsHeaders(),
    });
    res.end(buffer);
  } catch (err) {
    console.error(`[aonde-affiliates] Falha ao ler OG image ${filename}:`, err);
    sendText(res, 500, "Erro ao ler imagem", "text/plain; charset=utf-8");
  }
}

function handleRobots(res) {
  const body = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteBaseUrl()}/sitemap.xml\n`;
  sendText(res, 200, body);
}

function handleSitemap(res) {
  const base = siteBaseUrl();
  const paths = ["/", "/hoje", "/ofertas", "/guias", "/mapa", "/resultados", "/ajuda", "/cancelamentos", "/alertas"];
  for (const id of Object.keys(GUIDES)) paths.push(`/guias/${encodeURIComponent(id)}`);
  for (const o of CONTENT_OFFERS) paths.push(`/ofertas/${encodeURIComponent(o.id)}`);
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `  <url><loc>${base}${p}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  sendText(res, 200, xml, "application/xml; charset=utf-8");
}

// Extrai um codigo IATA (3 letras) de um texto tipo "São Paulo · GRU".
function extractIata(s) {
  const ups = String(s || "").toUpperCase().match(/\b[A-Z]{3}\b/g);
  return ups && ups.length ? ups[ups.length - 1] : null;
}

// Le um contador de passageiro da querystring, preso a uma faixa sa.
function paxCount(url, nome, min, max, padrao) {
  const bruto = url.searchParams.get(nome);
  if (bruto === null || bruto === "") return padrao;
  const n = Number.parseInt(bruto, 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/**
 * Descreve os passageiros em portugues ("2 adultos e 1 criança"). Bebe de colo
 * conta separado porque tem tarifa e regra propria — foi o que uma mae de
 * familia sentiu falta na auditoria: sem informar as criancas, ela nao confiava
 * que o preco final ia bater.
 */
function paxResumo({ adultos, criancas, bebes }) {
  const partes = [];
  const plural = (n, sing, plur) => `${n} ${n === 1 ? sing : plur}`;
  partes.push(plural(adultos, "adulto", "adultos"));
  if (criancas > 0) partes.push(plural(criancas, "criança", "crianças"));
  if (bebes > 0) partes.push(plural(bebes, "bebê de colo", "bebês de colo"));
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
}

// Busca ao vivo (Amadeus Flight Offers Search, ver src/flights/buscarVoos.js)
// integrada aqui: renderResultsPage ja aceita opts.voos no formato de FLIGHTS
// (src/render/aondeContent.js), entao so precisamos alimentar voos REAIS
// quando existirem — o renderer nao muda. Passamos tambem opts.voosReais,
// para quem cuida do texto na tela (src/render/htmlRenderer.js — NAO e
// arquivo deste modulo) saber se pode trocar o aviso de "exemplo" por algo
// que diga que os voos sao reais. Contrato exposto (ver relatorio da tarefa):
//   opts.voos      -> array no MESMO formato de FLIGHTS (cia, numero, saida,
//                      chegada, duracao, paradas, direto, preco, parcela,
//                      melhor) quando a busca ao vivo deu certo; ausente
//                      (undefined) quando caiu no fallback de exemplo.
//   opts.voosReais -> true SOMENTE quando opts.voos veio da Amadeus de
//                      verdade; false (ou ausente) sempre que os voos
//                      exibidos forem os de amostra — NUNCA rotular exemplo
//                      como real.
async function handleResultsHtml(res, url) {
  const oQS = url.searchParams.get("origem");
  const dQS = url.searchParams.get("destino");
  const periodo = url.searchParams.get("periodo");
  const idaQS = url.searchParams.get("ida");
  const voltaQS = url.searchParams.get("volta");
  const searched = !!(oQS || dQS);
  const pax = {
    adultos: paxCount(url, "adultos", 1, 9, 2),
    criancas: paxCount(url, "criancas", 0, 8, 0),
    bebes: paxCount(url, "bebes", 0, 4, 0),
  };
  const temPax = ["adultos", "criancas", "bebes"].some((k) => url.searchParams.get(k) !== null);
  // Aceita codigo IATA OU nome de cidade. Quando nao reconhece, guarda o que
  // a pessoa digitou para AVISAR na pagina, em vez de trocar em silencio pelo
  // padrao — que era o comportamento antigo: "Porto Alegre" -> "Sao Paulo"
  // virava GRU->SAO, e "xyz" era aceito como aeroporto.
  const origemPedida = String(oQS || "").trim();
  const destinoPedido = String(dQS || "").trim();
  const origemIata = resolveAeroporto(origemPedida);
  const destinoIata = resolveAeroporto(destinoPedido);
  const naoEntendi = [
    origemPedida && !origemIata ? origemPedida : "",
    destinoPedido && !destinoIata ? destinoPedido : "",
  ].filter(Boolean);
  const rota = searched
    ? {
        origem: origemIata || RESULTS_ROUTE.origem,
        destino: destinoIata || RESULTS_ROUTE.destino,
        resumo: [periodo, temPax ? paxResumo(pax) : ""].filter(Boolean).join(" · ") || RESULTS_ROUTE.resumo,
      }
    : undefined;

  // So tenta a busca ao vivo quando ha uma rota de verdade para consultar
  // (usuario buscou algo). Sem credencial Amadeus, buscarVoosAoVivo devolve
  // ok:false IMEDIATAMENTE (nem tenta rede) — o custo extra aqui e zero no
  // caso comum (producao sem chave configurada). Qualquer falha ou demora
  // tambem cai no mesmo fallback, silenciosamente: a pagina nunca quebra nem
  // demora por causa de um parceiro externo fora do ar (ver o teto de tempo
  // em src/flights/buscarVoos.js).
  let voos;
  let voosReais = false;
  if (rota) {
    const resultado = await buscarVoosAoVivo({
      origem: rota.origem,
      destino: rota.destino,
      ida: idaQS,
      volta: voltaQS,
      pax,
    });
    if (resultado.ok && Array.isArray(resultado.voos) && resultado.voos.length > 0) {
      voos = resultado.voos;
      voosReais = true;
    }
  }

  sendHtml(res, 200, renderResultsPage({ rota, searched, pax: temPax ? pax : null, voos, voosReais, naoEntendi }));
}

// Interstitial de saida: registra o clique e resolve o link do parceiro. Um
// unico ponto que conserta o tracking e entrega a tela de transicao pos-clique.
// Quando a oferta tem aviasalesUrl (campo novo), constroi o link tp.media NA
// HORA usando TRAVELPAYOUTS_MARKER do env — nao armazena marker no codigo.
// Preserva UTMs da querystring e os usa como sub_id do Travelpayouts.
// ORIGEM ALTERAVEL: quando ?origem= muda de GRU para outro IATA (ex.: REC),
// reconstroi o aviasalesUrl com a nova origem, permitindo que pessoas de outros
// estados reservem a mesma rota (BUE 12-19 set).
function handleExitHtml(req, res, id, url) {
  const live = getOffer(id);
  const offer = live || CONTENT_OFFERS.find((o) => o.id === id);
  if (!offer) {
    sendHtml(res, 404, renderOffersPage(publishedLiveOffers(), {}));
    return;
  }
  
  // Extrai UTMs da querystring para tracking.
  const utmSource = url.searchParams.get("utm_source") || "";
  const utmMedium = url.searchParams.get("utm_medium") || "";
  const utmCampaign = url.searchParams.get("utm_campaign") || "";
  
  // Origem alteravel: permite que quem nao e de GRU reserve a mesma rota.
  const origemAlternativa = url.searchParams.get("origem") || "";
  
  // Constroi tp.media URL a partir de aviasalesUrl + marker do env.
  let affiliateUrl = live ? live.affiliate_url : offer.affiliateUrl || offer.affiliate_url;
  let aviasalesUrl = offer.aviasalesUrl;
  
  // Se origem foi alterada E a oferta tem aviasalesUrl, reconstroi a URL.
  if (origemAlternativa && aviasalesUrl && /^[A-Z]{3}$/.test(origemAlternativa.toUpperCase())) {
    const novaOrigem = origemAlternativa.toUpperCase();
    const origemOriginal = (offer.origem || "GRU").toUpperCase();
    // Troca a origem na URL do Aviasales: GRU1209BUE19091 -> REC1209BUE19091
    aviasalesUrl = aviasalesUrl.replace(
      new RegExp(`/${origemOriginal}(\\d{4})`, "g"),
      `/${novaOrigem}$1`
    );
  }
  
  if (aviasalesUrl) {
    const marker = (getConfig().travelpayouts && getConfig().travelpayouts.marker) || "";
    if (!marker) {
      // SEM MARKER: nao ha como rastrear a comissao. Em vez de mostrar um botao
      // que nao funciona ou enviar a pessoa para HTTP 409, devolvemos 200 com
      // uma pagina honesta que explica a limitacao (o renderer trata quando
      // affiliateUrl === null, mostrando o card da oferta sem link de reserva).
      sendHtml(res, 200, renderOfferPage(offer, {}));
      return;
    }
    // sub_id para Travelpayouts: {utm_source}_{offer_id}_{origem}, e.g. "wa_gru-eze_rec"
    const origemSuffix = origemAlternativa ? `_${origemAlternativa.toLowerCase()}` : "";
    const subId = utmSource ? `${utmSource}_${id}${origemSuffix}` : `${id}${origemSuffix}`;
    // Monta tp.media: https://tp.media/r?marker={marker}.{subId}&p=4114&u={aviasalesUrl}
    const markerWithSubId = `${marker}.${subId}`;
    const params = new URLSearchParams({
      marker: markerWithSubId,
      p: "4114", // Aviasales program ID
      u: aviasalesUrl,
    });
    affiliateUrl = `https://tp.media/r?${params.toString()}`;
  }
  
  // Sem link de afiliado, ou com esquema nao permitido (defesa contra
  // "javascript:" etc.): nao ha para onde mandar com seguranca; devolve o
  // detalhe da oferta.
  if (!affiliateUrl || !isSafeRedirectUrl(affiliateUrl)) {
    sendHtml(res, 409, renderOfferPage(offer, {}));
    return;
  }
  recordClick(id, req.headers["user-agent"]);
  sendHtml(res, 200, renderExitPage(offer, { affiliateUrl }));
}

// Codigo IATA: exatamente 3 letras (case-insensitive na entrada).
const IATA_RE = /^[A-Za-z]{3}$/;

// Interstitial de saida para a BUSCA DE VOO por rota (nao e uma oferta com id
// no catalogo — e a lista de resultados do parceiro para origem->destino). O
// botao "Selecionar" da lista de voos aponta para GET /saida/voo?origem=..&
// destino=.. em vez de ir direto para o Aviasales, para que esse caminho
// tambem passe pelo aviso "voce esta saindo do Aonde" (o ponto mais elogiado
// do site na auditoria de usuarios — antes, esse botao especifico pulava a
// interstitial). Ver src/render/exitFlight.js para o HTML.
function handleExitFlightHtml(req, res, url) {
  const origemRaw = url.searchParams.get("origem");
  const destinoRaw = url.searchParams.get("destino");
  if (!IATA_RE.test(origemRaw || "") || !IATA_RE.test(destinoRaw || "")) {
    sendJson(res, 400, {
      error:
        "Informe origem e destino como codigos de aeroporto (IATA) de 3 letras, ex.: /saida/voo?origem=GRU&destino=REC.",
    });
    return;
  }
  const origem = origemRaw.toUpperCase();
  const destino = destinoRaw.toUpperCase();
  const searchUrl = buildAviasalesSearchUrl(origem, destino);
  // Mesma defesa em profundidade do /saida/:id: so segue com esquema
  // http/https. Na pratica buildAviasalesSearchUrl sempre gera https, mas o
  // teto de seguranca fica aqui caso isso mude no futuro.
  if (!isSafeRedirectUrl(searchUrl)) {
    sendJson(res, 409, { error: "Nao foi possivel montar o link de busca do parceiro." });
    return;
  }
  // Mesmo log dos outros cliques (data/clicks.jsonl) — identificador
  // "voo:ORIGEM-DESTINO" deixa claro, na curadoria, que e clique de busca por
  // rota (e nao clique numa oferta com id do catalogo).
  recordClick(`voo:${origem}-${destino}`, req.headers["user-agent"]);
  sendHtml(res, 200, renderExitFlightPage({ origem, destino, searchUrl }));
}

/**
 * Cria o http.Server da API. NAO chama listen — deixa isso a cargo de quem usa
 * (scripts/serve.js na producao; server.listen(0) nos testes).
 * @returns {import("node:http").Server}
 */
export function createServer() {
  // Uma instancia de limitador POR SERVIDOR: isola o estado entre servidores
  // diferentes (cada teste sobe o seu via createServer()) e evita que
  // instancias concorrentes (se algum dia houver mais de um processo)
  // compartilhem baldes sem querer. Ver src/inboundRateLimiter.js.
  const inboundLimiter = createInboundRateLimiter();

  // Aplica o rate limiting inbound a uma classe de rota de ESCRITA publica.
  // Retorna true (e ja respondeu 429) se a requisicao deve ser bloqueada;
  // false se pode prosseguir. So se aplica aos 4 endpoints POST de escrita
  // publica listados na doc do modulo — GETs de pagina/leitura NUNCA passam
  // por aqui.
  function enforceInboundRateLimit(req, res, routeClass) {
    const key = `${routeClass}:${clientIp(req)}`;
    const result = inboundLimiter.take(key);
    if (result.ok) return false;
    sendJson(
      res,
      429,
      { error: "Muitas requisicoes. Aguarde um momento e tente novamente." },
      { "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) }
    );
    return true;
  }

  return http.createServer(async (req, res) => {
    // Anotado aqui para que sendHtml/sendText possam comprimir sem que os 27
    // pontos de chamada precisem carregar `req` adiante.
    res.aceitaEncoding = String((req.headers && req.headers["accept-encoding"]) || "");
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const method = req.method || "GET";

      // Preflight CORS.
      if (method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }

      if (method === "GET" && pathname === "/api/health") {
        handleHealth(res);
        return;
      }

      // ---- Assets estaticos (GET) ----
      if (method === "GET" && pathname.startsWith("/assets/estilo-") && pathname.endsWith(".css")) {
        handleStyleAsset(res, pathname);
        return;
      }

      // OG images para social sharing (servidos de public/og/).
      if (method === "GET" && pathname.startsWith("/og/")) {
        handleOgImage(res, pathname);
        return;
      }

      // ---- Paginas HTML (GET) ----
      if (method === "GET" && pathname === "/robots.txt") {
        handleRobots(res);
        return;
      }
      // A escolha do dia — o que o robo diario publica (ver src/daily/dailyPick.js).
      if (method === "GET" && pathname === "/hoje") {
        // Permite forcar uma data especifica via ?dia=AAAA-MM-DD (para testes e preview).
        const diaParam = url.searchParams.get("dia");
        const data = diaParam || new Date();
        sendHtml(res, 200, renderTodayPage(pacoteDoDia(data)));
        return;
      }
      if (method === "GET" && pathname === "/sitemap.xml") {
        handleSitemap(res);
        return;
      }
      if (method === "GET" && (pathname === "/" || pathname === "/home")) {
        handleHome(res);
        return;
      }
      if (method === "GET" && pathname === "/ofertas") {
        handleOffersHtml(res, url);
        return;
      }
      if (method === "GET" && pathname === "/resultados") {
        await handleResultsHtml(res, url);
        return;
      }
      if (method === "GET" && pathname === "/mapa") {
        sendHtml(res, 200, renderMapPage({ apiKey: getConfig().googleMaps.apiKey }));
        return;
      }
      if (method === "GET" && pathname === "/guias") {
        sendHtml(res, 200, renderGuidesIndexPage());
        return;
      }
      if (method === "GET" && pathname === "/ajuda") {
        sendHtml(res, 200, renderHelpPage());
        return;
      }
      if (method === "GET" && pathname === "/cancelamentos") {
        sendHtml(res, 200, renderCancelPage());
        return;
      }
      if (method === "GET" && pathname === "/alertas") {
        sendHtml(res, 200, renderAlertsPage());
        return;
      }
      // Precisa vir ANTES do match generico /saida/:id logo abaixo, senao
      // "/saida/voo" seria interpretado como id="voo" (oferta inexistente).
      if (method === "GET" && pathname === "/saida/voo") {
        handleExitFlightHtml(req, res, url);
        return;
      }
      const exitMatch = pathname.match(/^\/saida\/([^/]+)$/);
      if (method === "GET" && exitMatch) {
        handleExitHtml(req, res, decodeURIComponent(exitMatch[1]), url);
        return;
      }
      const offerHtmlMatch = pathname.match(/^\/ofertas\/([^/]+)$/);
      if (method === "GET" && offerHtmlMatch) {
        handleOfferHtml(res, decodeURIComponent(offerHtmlMatch[1]));
        return;
      }
      const guideHtmlMatch = pathname.match(/^\/guias\/([^/]+)$/);
      if (method === "GET" && guideHtmlMatch) {
        handleGuideHtml(res, decodeURIComponent(guideHtmlMatch[1]));
        return;
      }

      if (method === "GET" && pathname === "/api/offers") {
        handleListOffers(req, res, url);
        return;
      }

      // ---- Newsletter / alertas de preco (double opt-in, LGPD) ----
      if (pathname === "/api/newsletter/subscribe") {
        if (method !== "POST") {
          sendJson(res, 405, { error: "Metodo nao permitido; use POST." });
          return;
        }
        if (enforceInboundRateLimit(req, res, "newsletter-subscribe")) return;
        await handleNewsletterSubscribe(req, res);
        return;
      }

      if (pathname === "/api/newsletter/confirm") {
        if (method !== "GET") {
          sendJson(res, 405, { error: "Metodo nao permitido; use GET." });
          return;
        }
        handleNewsletterConfirm(req, res, url);
        return;
      }

      if (pathname === "/api/newsletter/unsubscribe") {
        // O link do e-mail e um GET. Antes devolvia 405 com JSON cru, embora o
        // proprio e-mail prometesse cancelar a inscricao em um clique. Agora
        // GET abre a pagina de confirmacao (que NAO muda estado: antivirus e
        // provedores pre-abrem links de e-mail) e o botao faz o POST.
        if (method === "GET") {
          sendHtml(res, 200, renderUnsubscribePage({ email: url.searchParams.get("email") || "" }));
          return;
        }
        if (method !== "POST") {
          sendJson(res, 405, { error: "Metodo nao permitido; use GET ou POST." });
          return;
        }
        if (enforceInboundRateLimit(req, res, "newsletter-unsubscribe")) return;
        await handleNewsletterUnsubscribe(req, res);
        return;
      }

      if (pathname === "/api/alerts") {
        if (method !== "POST") {
          sendJson(res, 405, { error: "Metodo nao permitido; use POST." });
          return;
        }
        if (enforceInboundRateLimit(req, res, "alerts")) return;
        await handleCreateAlert(req, res);
        return;
      }

      // /api/offers/:id/click
      const clickMatch = pathname.match(/^\/api\/offers\/([^/]+)\/click$/);
      if (clickMatch) {
        if (method !== "POST") {
          sendJson(res, 405, { error: "Metodo nao permitido; use POST." });
          return;
        }
        if (enforceInboundRateLimit(req, res, "offers-click")) return;
        handleClick(req, res, decodeURIComponent(clickMatch[1]));
        return;
      }

      // /api/offers/:id
      const offerMatch = pathname.match(/^\/api\/offers\/([^/]+)$/);
      if (offerMatch) {
        if (method !== "GET") {
          sendJson(res, 405, { error: "Metodo nao permitido; use GET." });
          return;
        }
        handleGetOffer(req, res, decodeURIComponent(offerMatch[1]));
        return;
      }

      // Navegador que pediu HTML recebe pagina; cliente de API recebe JSON.
      // Antes era JSON para todo mundo: quem digitava a URL errada ou seguia um
      // link velho via {"error":"Rota nao encontrada"} na tela, sem volta.
      if (querHtml(req, pathname)) sendHtml(res, 404, renderNotFoundPage({ caminho: pathname }));
      else sendJson(res, 404, { error: `Rota nao encontrada: ${method} ${pathname}` });
    } catch (err) {
      // Nunca derruba o processo por um request malformado.
      try {
        // O diagnostico vai para o LOG, nao para a tela: a mensagem interna nao
        // ajuda quem esta lendo e ainda expoe detalhe de implementacao.
        console.error("[aonde-affiliates] Falha ao responder:", err);
        if (querHtml(req, pathname)) sendHtml(res, 500, renderServerErrorPage());
        else sendJson(res, 500, { error: "Erro interno." });
      } catch {
        // Se ate o envio de erro falhar, encerra a resposta sem estourar.
        try {
          res.end();
        } catch {
          /* noop */
        }
      }
    }
  });
}
