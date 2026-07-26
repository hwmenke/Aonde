#!/usr/bin/env node
// CLI: gera um roteiro de viagem com pontos turisticos reais (Google Places
// API New) e imprime em markdown (todo em bullet points).
//
// Uso:
//   node scripts/roteiro.js "Recife" [--dias 5] [--regiao BR] [--out roteiro-recife.md]
//
// Requer GOOGLE_MAPS_API_KEY no ambiente ou em aonde-affiliates/.env
// (ver .env.example). Mensagens de erro/uso em pt-BR.

import { writeFileSync } from "node:fs";

import { buildItinerary, renderItineraryMarkdown } from "../src/guides/itineraryBuilder.js";

const USAGE = `Uso: node scripts/roteiro.js "<destino>" [--dias N] [--regiao BR] [--out arquivo.md]

  <destino>       Nome do destino (ex.: "Recife"). Obrigatorio.
  --dias N        Numero de dias do roteiro (default: 5).
  --regiao COD    Codigo de regiao para a Places API (ex.: BR).
  --out ARQUIVO   Grava o markdown no arquivo indicado (alem de imprimir).

Requer GOOGLE_MAPS_API_KEY no ambiente ou em aonde-affiliates/.env.`;

// Parser simples de argumentos (sem dependencias — padrao do modulo).
function parseArgs(argv) {
  const opts = { destination: null, dias: 5, regiao: undefined, out: null };
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dias") {
      opts.dias = parseInt(argv[++i], 10);
    } else if (arg === "--regiao") {
      opts.regiao = argv[++i];
    } else if (arg === "--out") {
      opts.out = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else {
      positionals.push(arg);
    }
  }

  opts.destination = positionals[0] || null;
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!opts.destination) {
    console.error("Erro: informe o destino.\n");
    console.error(USAGE);
    process.exit(1);
  }

  if (!Number.isInteger(opts.dias) || opts.dias <= 0) {
    console.error(`Erro: --dias deve ser um inteiro positivo (recebido: "${opts.dias}").`);
    process.exit(1);
  }

  const itinerary = await buildItinerary({
    destination: opts.destination,
    days: opts.dias,
    regionCode: opts.regiao,
  });

  if (!itinerary.ok) {
    console.error(`Erro ao gerar o roteiro: ${itinerary.error}`);
    process.exit(1);
  }

  const markdown = renderItineraryMarkdown(itinerary);
  console.log(markdown);

  if (opts.out) {
    try {
      writeFileSync(opts.out, markdown + "\n", "utf-8");
      console.error(`\nRoteiro gravado em ${opts.out}`);
    } catch (err) {
      console.error(`\nErro ao gravar em ${opts.out}: ${(err && err.message) || err}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  // Rede de seguranca: buildItinerary nao deveria lancar, mas garantimos saida
  // limpa em pt-BR caso algo inesperado ocorra.
  console.error(`Erro inesperado: ${(err && err.message) || err}`);
  process.exit(1);
});
