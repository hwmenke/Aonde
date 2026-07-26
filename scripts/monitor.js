#!/usr/bin/env node
// CLI do job de monitoramento de tarifas.
//
// Uso:
//   node scripts/monitor.js --routes GRU-LIS,GRU-MIA,GIG-EZE [--currency BRL]
//     [--window-days 90] [--media-fallback amadeus]
//
// --media-fallback amadeus: quando o historico proprio de uma rota ainda nao
// tem amostra suficiente, usa a mediana dos quartis da Amadeus Flight Price
// Analysis API como media de rota (exige AMADEUS_CLIENT_ID/SECRET). Default:
// "none" (so historico proprio).
//
// Roda runMonitor sobre as rotas informadas e imprime um resumo legivel em
// pt-BR (rotas ok/falhas, ofertas geradas, suspeitas de erro de tarifa).
//
// Agendamento (cron / GitHub Actions): ver a secao "Curadoria: historico,
// monitoramento e API" do README.md.

import { runMonitor } from "../src/monitor.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--routes") args.routes = argv[++i];
    else if (token === "--currency") args.currency = argv[++i];
    else if (token === "--window-days") args.windowDays = Number(argv[++i]);
    else if (token === "--media-fallback") args.mediaFallback = argv[++i];
  }
  return args;
}

function parseRoutes(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [origin, destination] = pair.split("-").map((s) => s.trim().toUpperCase());
      return { origin, destination };
    })
    .filter((r) => r.origin && r.destination);
}

function formatCentavos(centavos, currency) {
  if (typeof centavos !== "number") return "n/d";
  return `${currency} ${(centavos / 100).toFixed(2)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const routes = parseRoutes(args.routes);
  const currency = args.currency || "BRL";

  if (routes.length === 0) {
    console.error(
      "Uso: node scripts/monitor.js --routes GRU-LIS,GRU-MIA,GIG-EZE [--currency BRL] [--window-days 90] [--media-fallback amadeus]"
    );
    process.exitCode = 1;
    return;
  }

  const mediaFallback = args.mediaFallback === "amadeus" ? "amadeus" : "none";

  console.log(
    `Monitor iniciado — ${routes.length} rota(s), moeda ${currency}` +
      (mediaFallback === "amadeus" ? ", fallback de media: Amadeus." : ".")
  );

  const result = await runMonitor({
    routes,
    currency,
    windowDays: args.windowDays,
    mediaFallback,
  });

  console.log("\n=== Resumo por rota ===");
  for (const [route, info] of Object.entries(result.perRoute)) {
    if (info.ok) {
      const media =
        typeof info.mediaCentavos === "number"
          ? formatCentavos(info.mediaCentavos, currency)
          : "sem media";
      const source =
        info.statsSource === "amadeus-median"
          ? " (Amadeus)"
          : info.statsSource === "own-history"
          ? " (historico)"
          : "";
      const fare = info.isFareError ? " [SUSPEITA DE ERRO DE TARIFA]" : "";
      console.log(`  OK    ${route}: ${info.dealsFound} deal(s), media ${media}${source}${fare}`);
    } else {
      console.log(`  FALHA ${route}: ${info.error}`);
    }
  }

  const suspeitas = result.offers.filter((o) => o.is_erro_tarifa);

  console.log("\n=== Ofertas geradas ===");
  if (result.offers.length === 0) {
    console.log("  (nenhuma)");
  } else {
    for (const offer of result.offers) {
      console.log(
        `  ${offer.id}: ${formatCentavos(offer.preco_centavos, currency)}` +
          (offer.desconto_pct != null ? `, -${offer.desconto_pct}%` : "") +
          (offer.is_erro_tarifa ? " [ERRO DE TARIFA?]" : "")
      );
    }
  }

  console.log(
    `\nTotal: ${result.offers.length} oferta(s) em rascunho, ${suspeitas.length} suspeita(s) de erro de tarifa.`
  );
  console.log("Rascunhos persistidos em data/offers.json. Revise na curadoria antes de publicar.");
}

main().catch((err) => {
  console.error("Erro inesperado no monitor:", err);
  process.exitCode = 1;
});
