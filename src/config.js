// Leitura de configuracao (variaveis de ambiente) + loader simples de .env.
//
// Nao usamos a dependencia "dotenv" para manter o modulo com zero dependencias
// de runtime. O loader abaixo e minimalista: le "aonde-affiliates/.env" (se
// existir), faz parse de linhas "CHAVE=VALOR" e preenche process.env apenas
// para chaves que ainda nao estejam definidas (variaveis ja setadas no
// ambiente/host sempre tem prioridade sobre o arquivo .env).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseLinkRegistry } from "./manualLinkRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = path.resolve(__dirname, "..");

function parseDotEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // remove aspas simples/duplas envolventes, se houver
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }
  return result;
}

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  let content;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    return; // falha silenciosa de leitura nao deve derrubar o modulo
  }
  const parsed = parseDotEnv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Carrega o .env da raiz do modulo (efeito colateral unico, na importacao).
loadDotEnv(path.join(MODULE_ROOT, ".env"));

/**
 * Retorna a configuracao atual lida diretamente de process.env.
 * Deliberadamente NAO faz cache: cada chamada le o ambiente na hora,
 * o que facilita testes (basta alterar process.env antes de chamar).
 */
export function getConfig() {
  return {
    travelpayouts: {
      token: process.env.TRAVELPAYOUTS_TOKEN || "",
      marker: process.env.TRAVELPAYOUTS_MARKER || "",
    },
    awin: {
      apiToken: process.env.AWIN_API_TOKEN || "",
      publisherId: process.env.AWIN_PUBLISHER_ID || "",
      advertiserIdDecolar: process.env.AWIN_ADVERTISER_ID_DECOLAR || "",
    },
    hurb: {
      trackedLink: process.env.HURB_TRACKED_LINK || "",
      // Registro opcional de links por rota/oferta (offerId ou "ORIGEM-DESTINO").
      // Ver src/manualLinkRegistry.js e .env.example para o formato.
      trackedLinksRegistry: parseLinkRegistry(process.env.HURB_TRACKED_LINKS_JSON),
    },
    passagensPromo: {
      trackedLink: process.env.PASSAGENS_PROMO_TRACKED_LINK || "",
      trackedLinksRegistry: parseLinkRegistry(process.env.PASSAGENS_PROMO_TRACKED_LINKS_JSON),
    },
    // URL base publica do site. Usada para montar endereco ABSOLUTO onde o
    // relativo nao serve: sitemap.xml, robots.txt, <link rel="canonical"> e as
    // metatags de compartilhamento (og:url/og:image). Sempre sem barra no fim.
    siteUrl: (process.env.AONDE_SITE_URL || "https://aonde.com.br").replace(/\/+$/, ""),
    // Google Maps Platform — usada pelo gerador de roteiros (Places API New).
    // Ver src/guides/ e docs/PESQUISA-GOOGLE.md.
    googleMaps: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    },
    // Atendimento. `whatsapp` = numero movel REAL em formato internacional so
    // com digitos (ex.: 5511999998888) para montar links wa.me. VAZIO por
    // padrao: sem numero, o site NAO promete WhatsApp (usa so o 0800 por voz).
    // NUNCA rotular o 0800 como WhatsApp — 0800 e linha fixa e nao recebe.
    atendimento: {
      whatsapp: (process.env.AONDE_WHATSAPP || "").replace(/\D/g, ""),
      telefone: process.env.AONDE_TELEFONE || "0800 942 0842",
    },
    // Amadeus Self-Service — Flight Price Analysis API (preco tipico de rota).
    // Ver src/partners/amadeus.js e docs/PESQUISA-PARCEIROS.md (secao Amadeus).
    // env: "test" (sandbox, default) ou "production".
    amadeus: {
      clientId: process.env.AMADEUS_CLIENT_ID || "",
      clientSecret: process.env.AMADEUS_CLIENT_SECRET || "",
      env: process.env.AMADEUS_ENV || "test",
    },
  };
}
