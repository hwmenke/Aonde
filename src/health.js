// Health-check de configuracao (sem rede).
//
// validateConfig() inspeciona apenas o ambiente/config (via getConfig()) e
// classifica cada parceiro em "ready" (100% utilizavel agora), "partial"
// (utilizavel com limitacao) ou "notConfigured". NAO faz nenhuma chamada de
// rede: e uma leitura pura de process.env, util para um endpoint de health,
// um script de diagnostico ou a saida de um CLI. Todas as notas sao em
// pt-BR e apontam a variavel que falta e onde obte-la.

import { getConfig } from "./config.js";

/**
 * Valida a configuracao atual (env vars) de todos os parceiros, sem tocar a
 * rede. Retorna listas de prontidao e o detalhamento por parceiro.
 *
 * @returns {{
 *   ready: string[],
 *   partial: string[],
 *   notConfigured: string[],
 *   partners: Record<string, { ready: boolean, missing: string[], notes: string }>
 * }}
 */
export function validateConfig() {
  const config = getConfig();

  const partners = {
    travelpayouts: checkTravelpayouts(config.travelpayouts),
    awin: checkAwin(config.awin),
    hurb: checkManual("hurb", config.hurb, {
      linkVar: "HURB_TRACKED_LINK",
      registryVar: "HURB_TRACKED_LINKS_JSON",
      panel: "painel do Clube Hurb (clubehu.com.br), na opcao \"Traquear URL\"",
    }),
    "passagens-promo": checkManual("passagens-promo", config.passagensPromo, {
      linkVar: "PASSAGENS_PROMO_TRACKED_LINK",
      registryVar: "PASSAGENS_PROMO_TRACKED_LINKS_JSON",
      panel: "Portal do Afiliado da Parceiros Promo (parceirospromo.com.br)",
    }),
  };

  const ready = [];
  const partial = [];
  const notConfigured = [];

  for (const [name, detail] of Object.entries(partners)) {
    if (detail.status === "ready") ready.push(name);
    else if (detail.status === "partial") partial.push(name);
    else notConfigured.push(name);
  }

  // Cada detalhe expoe apenas { ready, missing, notes } no contrato publico;
  // "status" e um detalhe interno usado so para montar as listas acima.
  const partnersPublic = {};
  for (const [name, detail] of Object.entries(partners)) {
    partnersPublic[name] = {
      ready: detail.status === "ready",
      missing: detail.missing,
      notes: detail.notes,
    };
  }

  return { ready, partial, notConfigured, partners: partnersPublic };
}

// -----------------------------------------------------------------------------
// Travelpayouts: marker habilita a geracao de link (template tp.media); token
// habilita a busca de ofertas (Data API). Um sem o outro => partial.
// -----------------------------------------------------------------------------
function checkTravelpayouts(tp) {
  const hasMarker = Boolean(tp.marker);
  const hasToken = Boolean(tp.token);

  if (hasMarker && hasToken) {
    return {
      status: "ready",
      missing: [],
      notes:
        "Geracao de links (template tp.media) e busca de ofertas (Data API) disponiveis.",
    };
  }

  if (hasMarker && !hasToken) {
    return {
      status: "partial",
      missing: ["TRAVELPAYOUTS_TOKEN"],
      notes:
        "Geracao de links (template tp.media) funciona. Falta TRAVELPAYOUTS_TOKEN para busca de ofertas (Data API); pegue o API token em travelpayouts.com -> Profile.",
    };
  }

  if (!hasMarker && hasToken) {
    return {
      status: "partial",
      missing: ["TRAVELPAYOUTS_MARKER"],
      notes:
        "Busca de ofertas (Data API) funciona, mas os deals saem sem link de afiliado rastreavel. Falta TRAVELPAYOUTS_MARKER (Partner ID em travelpayouts.com -> Profile) para gerar links.",
    };
  }

  return {
    status: "notConfigured",
    missing: ["TRAVELPAYOUTS_MARKER", "TRAVELPAYOUTS_TOKEN"],
    notes:
      "Nada configurado. Cadastre-se em travelpayouts.com: o marker (Partner ID) habilita a geracao de links e o token (API token) habilita a busca de ofertas.",
  };
}

// -----------------------------------------------------------------------------
// Awin: apiToken + publisherId sao obrigatorios para o Link Builder. O
// advertiserIdDecolar so define o anunciante padrao (Decolar); sem ele o
// parceiro continua ready, mas exige options.advertiserId em cada chamada.
// -----------------------------------------------------------------------------
function checkAwin(awin) {
  const hasToken = Boolean(awin.apiToken);
  const hasPublisher = Boolean(awin.publisherId);
  const hasAdvertiser = Boolean(awin.advertiserIdDecolar);

  if (hasToken && hasPublisher) {
    if (hasAdvertiser) {
      return {
        status: "ready",
        missing: [],
        notes: "Link Builder pronto (token, publisher e anunciante padrao Decolar configurados).",
      };
    }
    return {
      status: "ready",
      missing: [],
      notes:
        "Link Builder pronto. AWIN_ADVERTISER_ID_DECOLAR ausente: sem o anunciante padrao, informe options.advertiserId em cada chamada (requer estar aprovado no programa do anunciante).",
    };
  }

  const missing = [];
  if (!hasToken) missing.push("AWIN_API_TOKEN");
  if (!hasPublisher) missing.push("AWIN_PUBLISHER_ID");

  return {
    status: "notConfigured",
    missing,
    notes:
      "Link Builder indisponivel. AWIN_API_TOKEN (token OAuth2 pessoal em ui.awin.com/awin-api) e AWIN_PUBLISHER_ID (painel ui.awin.com) sao ambos obrigatorios.",
  };
}

// -----------------------------------------------------------------------------
// Hurb / Parceiros Promo: sem API publica. Basta um link global OU ao menos
// uma entrada no registro por rota/oferta para ficar utilizavel. A geracao
// dos links continua manual no painel do parceiro.
// -----------------------------------------------------------------------------
function checkManual(name, cfg, { linkVar, registryVar, panel }) {
  const hasGlobal = Boolean(cfg.trackedLink);
  const registrySize = cfg.trackedLinksRegistry
    ? Object.keys(cfg.trackedLinksRegistry).length
    : 0;
  const hasRegistry = registrySize > 0;

  const manualReminder = `Lembrete: a geracao do link e manual, feita no ${panel}; este modulo apenas repassa o link ja traqueado.`;

  if (hasGlobal || hasRegistry) {
    const parts = [];
    if (hasGlobal) parts.push(`link global (${linkVar}) configurado`);
    if (hasRegistry) parts.push(`${registrySize} link(s) por rota/oferta em ${registryVar}`);
    return {
      status: "ready",
      missing: [],
      notes: `${parts.join(" e ")}. ${manualReminder}`,
    };
  }

  return {
    status: "notConfigured",
    missing: [linkVar, registryVar],
    notes: `Nenhum link configurado. Defina ${linkVar} (fallback global) ou cadastre links por rota/oferta em ${registryVar}. ${manualReminder}`,
  };
}
