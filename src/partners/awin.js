// Awin (rede de afiliados que hospeda Decolar.com e outras OTAs)
//
// API REST real, autenticacao OAuth2 (Bearer, token pessoal). Requer estar
// aprovado na rede Awin E no programa do anunciante especifico (ex.: Decolar)
// para que os links gerados gerem comissao. Ver docs/PESQUISA-PARCEIROS.md.
//
// Rate limit documentado: 20 requisicoes/minuto por usuario. A camada http.js
// ja aplica esse limite (bucket "api.awin.com/", 20/min) a TODAS as chamadas
// que passam por aqui — inclusive cada chamada do modo lote.

import { httpRequest } from "../http.js";
import { getConfig } from "../config.js";

const API_BASE = "https://api.awin.com";

export const AWIN_RATE_LIMIT = { requestsPerMinute: 20 };

// Maximo de links por chamada ao endpoint de lote (limite documentado da Awin).
const BATCH_MAX_PER_CALL = 100;

// Mensagens-padrao de credencial ausente, compartilhadas entre single e lote.
const MSG_NO_TOKEN =
  "AWIN_API_TOKEN nao configurado. Crie um token OAuth2 pessoal em ui.awin.com/awin-api.";
const MSG_NO_PUBLISHER =
  "AWIN_PUBLISHER_ID nao configurado (ou nao informado em options.publisherId).";
const MSG_NO_ADVERTISER =
  "advertiserId nao informado. Configure AWIN_ADVERTISER_ID_DECOLAR ou passe options.advertiserId (requer estar aprovado no programa do anunciante).";

// --- Helpers privados compartilhados entre single e lote ---------------------

/** Monta o corpo de requisicao de UM link (mesmo formato do single e do lote). */
function buildAwinLinkRequest({ advertiserId, destinationUrl, campaign, clickref }) {
  return {
    advertiserId: Number(advertiserId),
    destinationUrl,
    parameters: {
      campaign: campaign || "aonde-passagens",
      clickref: clickref || "",
    },
  };
}

/** Extrai o link gerado de um objeto de resposta (url/shortUrl/shortLink). */
function extractAwinUrl(obj) {
  return obj?.shortUrl || obj?.shortLink || obj?.url;
}

/** Cabecalhos padrao (auth Bearer + JSON), iguais no single e no lote. */
function awinHeaders(apiToken) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiToken}`,
  };
}

/** Resume um corpo bruto (para mensagens de erro) sem estourar o tamanho. */
function summarizeBody(data) {
  let s;
  try {
    s = typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    s = String(data);
  }
  if (s == null) return "null";
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

/**
 * getDealLink("awin", options)
 * options: { destinationUrl, advertiserId, publisherId, campaign, subId }
 */
export async function getDealLinkAwin(options = {}) {
  const config = getConfig().awin;
  const apiToken = config.apiToken;
  const publisherId = options.publisherId || config.publisherId;
  const advertiserId = options.advertiserId || config.advertiserIdDecolar;
  const destinationUrl = options.destinationUrl;

  if (!apiToken) {
    return { ok: false, partner: "awin", method: "api", error: MSG_NO_TOKEN };
  }
  if (!publisherId) {
    return { ok: false, partner: "awin", method: "api", error: MSG_NO_PUBLISHER };
  }
  if (!advertiserId) {
    return { ok: false, partner: "awin", method: "api", error: MSG_NO_ADVERTISER };
  }
  if (!destinationUrl) {
    return { ok: false, partner: "awin", method: "api", error: "destinationUrl e obrigatorio" };
  }

  const body = buildAwinLinkRequest({
    advertiserId,
    destinationUrl,
    campaign: options.campaign,
    clickref: options.subId || options.clickref,
  });

  const res = await httpRequest(`${API_BASE}/publishers/${publisherId}/linkbuilder/generate`, {
    method: "POST",
    headers: awinHeaders(apiToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      ok: false,
      partner: "awin",
      method: "api",
      error: res.error || "Falha ao chamar o Awin Link Builder",
    };
  }

  const url = extractAwinUrl(res.data);
  if (!url) {
    return {
      ok: false,
      partner: "awin",
      method: "api",
      error: "Resposta da API nao trouxe um link valido (esperado url/shortUrl)",
    };
  }

  return { ok: true, url, partner: "awin", method: "api" };
}

/**
 * Interpreta UM item do array `responses[]` da resposta de lote da Awin.
 * Cada item tem o formato { status, body }, onde status e o HTTP status code
 * daquele link e body o payload (objeto com url/shortUrl, ou detalhe do erro).
 *
 * @returns {{ok: true, url: string} | {ok: false, error: string}}
 */
function parseBatchResponseItem(r) {
  if (!r || typeof r !== "object") {
    return { ok: false, error: "resposta ausente ou invalida para este item no lote" };
  }
  const status = r.status;
  if (status !== 200) {
    const detail =
      typeof r.body === "string"
        ? r.body
        : r.body?.message || r.body?.error || summarizeBody(r.body);
    return {
      ok: false,
      error: `Item falhou (status ${status ?? "?"})${detail ? `: ${detail}` : ""}`,
    };
  }
  const url = extractAwinUrl(r.body);
  if (!url) {
    return { ok: false, error: "Resposta do item nao trouxe um link valido (esperado url/shortUrl)" };
  }
  return { ok: true, url };
}

/**
 * getDealLinksAwinBatch(items, options)
 *
 * Gera varios links de afiliado Awin em lote via
 * `POST /publishers/{publisherId}/linkbuilder/generate-batch` (a-validar: grafia
 * confirmada em developer.awin.com/apidocs/generatebatchlinks; nao emite short
 * links). Ate 100 links por chamada; acima disso, os itens sao divididos
 * automaticamente em chunks de 100 e enviados em chamadas sequenciais — CADA
 * chamada consome uma ficha do rate limit 20/min (aplicado pela camada http.js).
 *
 * @param {Array<{destinationUrl: string, advertiserId?: string|number, campaign?: string, clickref?: string}>} items
 * @param {{publisherId?: string}} [options]
 * @returns {Promise<{ok: boolean, partner: string, method: string, error?: string, results?: Array, succeeded?: number, failed?: number}>}
 */
export async function getDealLinksAwinBatch(items, options = {}) {
  try {
    const config = getConfig().awin;
    const apiToken = config.apiToken;
    const publisherId = options.publisherId || config.publisherId;
    const defaultAdvertiserId = config.advertiserIdDecolar;

    // --- Validacao de entrada ---
    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: false,
        partner: "awin",
        method: "api-batch",
        error: "items deve ser um array nao-vazio de { destinationUrl, advertiserId?, campaign?, clickref? }",
      };
    }
    if (!apiToken) {
      return { ok: false, partner: "awin", method: "api-batch", error: MSG_NO_TOKEN };
    }
    if (!publisherId) {
      return { ok: false, partner: "awin", method: "api-batch", error: MSG_NO_PUBLISHER };
    }

    const endpoint = `${API_BASE}/publishers/${publisherId}/linkbuilder/generate-batch`;
    const results = [];

    // Divide em chunks de ate 100 e envia sequencialmente (preserva a ordem
    // global via o offset `start`).
    for (let start = 0; start < items.length; start += BATCH_MAX_PER_CALL) {
      const chunk = items.slice(start, start + BATCH_MAX_PER_CALL);
      const requestBody = chunk.map((item) =>
        buildAwinLinkRequest({
          advertiserId: item.advertiserId || defaultAdvertiserId,
          destinationUrl: item.destinationUrl,
          campaign: item.campaign,
          clickref: item.clickref,
        })
      );

      const res = await httpRequest(endpoint, {
        method: "POST",
        headers: awinHeaders(apiToken),
        body: JSON.stringify(requestBody),
      });

      // Falha da propria chamada HTTP invalida a operacao inteira.
      if (!res.ok) {
        return {
          ok: false,
          partner: "awin",
          method: "api-batch",
          error: res.error || "Falha ao chamar o Awin Link Builder (lote)",
        };
      }

      const responses = res.data?.responses;
      if (!Array.isArray(responses)) {
        return {
          ok: false,
          partner: "awin",
          method: "api-batch",
          error: `Resposta da API em formato inesperado (esperado responses[]): ${summarizeBody(res.data)}`,
        };
      }

      // Mapeia item a item, na mesma ordem de entrada. Uma falha individual
      // (status != 200) nao invalida os demais.
      chunk.forEach((item, i) => {
        const index = start + i;
        const parsed = parseBatchResponseItem(responses[i]);
        if (parsed.ok) {
          results.push({ ok: true, url: parsed.url, index, destinationUrl: item.destinationUrl });
        } else {
          results.push({ ok: false, error: parsed.error, index, destinationUrl: item.destinationUrl });
        }
      });
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    return { ok: true, partner: "awin", method: "api-batch", results, succeeded, failed };
  } catch (err) {
    // Rede de seguranca: nunca lanca excecao nao tratada.
    return {
      ok: false,
      partner: "awin",
      method: "api-batch",
      error: (err && err.message) || String(err),
    };
  }
}
