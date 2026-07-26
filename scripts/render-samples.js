#!/usr/bin/env node
// CLI: gera as PAGINAS HTML DE AMOSTRA do Aonde a partir de FIXTURES
// commitadas (nunca faz rede). Escreve, por padrao em samples/:
//   - roteiro-recife.html  (saida de renderItineraryPage)
//   - ofertas.html         (saida de renderOffersPage)
//
// Uso:
//   node scripts/render-samples.js [--out samples/]
//
// As paginas sao AUTOCONTIDAS (CSS inline) e resilientes: toda imagem externa
// tem fallback de placeholder SVG via onerror, entao abrem mesmo offline.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  renderItineraryPage,
  renderTodayPage,
} from "../src/render/htmlRenderer.js";
import { sampleItinerary } from "../src/render/sampleData.js";
import { OFFERS as CONTENT_OFFERS } from "../src/render/aondeContent.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = { out: "samples" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      opts.out = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Uso: node scripts/render-samples.js [--out samples/]\n\n" +
        "  --out DIR   Diretorio de saida (default: samples/).\n\n" +
        "Gera roteiro-recife.html e ofertas.html a partir de fixtures (sem rede)."
    );
    return;
  }

  const outDir = resolve(REPO_ROOT, opts.out);
  mkdirSync(outDir, { recursive: true });

  // Uma oferta editorial com detalhe rico (texto/dicas/flex) para a pagina de detalhe.
  const ofertaDetalhe = CONTENT_OFFERS.find((o) => o.id === "gru-lis") || CONTENT_OFFERS[0];

  const pages = [
    ["index.html", renderHomePage({})],
    // Feed a partir da MESMA curadoria (CONTENT_OFFERS) usada no detalhe/home/saida,
    // para nao haver oferta com preco/selo diferente entre paginas (fonte unica por id).
    ["ofertas.html", renderOffersPage([], { title: "Ofertas de viagem — Aonde" })],
    ["hoje.html", renderTodayPage(pacoteDoDia(new Date()))],
    ["oferta.html", renderOfferPage(ofertaDetalhe, {
      related: CONTENT_OFFERS.filter((o) => o.id !== ofertaDetalhe.id && o.tipo === ofertaDetalhe.tipo).slice(0, 3),
    })],
    ["guias.html", renderGuidesIndexPage()],
    ["guia-salvador.html", renderGuidePage("salvador")],
    ["resultados.html", renderResultsPage({ searched: true, rota: { origem: "GRU", destino: "SSA", resumo: "1 – 8 set · 2 adultos" } })],
    // Sem chave nas amostras: renderiza o fallback clicavel (as amostras nao fazem rede).
    ["mapa.html", renderMapPage({ apiKey: "" })],
    // Pagina de saida: precisa de um affiliate_url; usamos um demo.
    ["saida.html", renderExitPage({ ...ofertaDetalhe, affiliateUrl: "https://tp.media/r?marker=demo" }, { affiliateUrl: "https://tp.media/r?marker=demo" })],
    ["ajuda.html", renderHelpPage()],
    ["cancelamentos.html", renderCancelPage()],
    ["alertas.html", renderAlertsPage()],
    ["roteiro-recife.html", renderItineraryPage(sampleItinerary)],
  ];

  console.log("Paginas de amostra geradas:");
  for (const [name, html] of pages) {
    const p = join(outDir, name);
    writeFileSync(p, html, "utf8");
    console.log(`  - ${p}`);
  }
  console.log("Abra no navegador — sao autocontidas (fallback de imagem embutido).");
}

main();
