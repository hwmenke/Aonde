#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ROBO DIARIO — imprime (ou grava) a escolha do dia: 1-2 achados com o roteiro
// em topicos. Feito para rodar uma vez por dia num cron/Routine.
//
//   node scripts/daily-pick.js                  # texto no terminal
//   node scripts/daily-pick.js --json           # JSON (para e-mail/bot/API)
//   node scripts/daily-pick.js --html saida.html
//   node scripts/daily-pick.js --data 2026-08-15 --quantidade 1
//   node scripts/daily-pick.js --pesquisar Ilhabela   # pesquisa ao vivo (Places)
//
// A pagina /hoje do site serve exatamente o mesmo pacote — este script existe
// para quem quiser mandar por e-mail/WhatsApp ou publicar em outro canal.
//
// Conteudo: usa os roteiros editoriais. Para um destino sem roteiro, --pesquisar
// chama o Google Places (precisa de GOOGLE_MAPS_API_KEY); sem chave ele diz que
// nao conseguiu, em vez de inventar roteiro.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";

import { pacoteDoDia, pesquisarDestino, dataValida } from "../src/daily/dailyPick.js";
import { renderTodayPage } from "../src/render/htmlRenderer.js";

function arg(nome, padrao = null) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return padrao;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

function bullets(r) {
  return (r.bullets || [])
    .map((b) => {
      const pontos = b.pontos && b.pontos.length ? ` ${b.pontos.join(" · ")}` : "";
      const comer = b.ondeComer ? `\n      Onde comer: ${b.ondeComer}` : "";
      return `  • Dia ${b.dia} — ${b.titulo}${pontos ? `\n     ${pontos.trim()}` : ""}${comer}`;
    })
    .join("\n");
}

async function main() {
  const destinoPesquisa = arg("pesquisar");
  if (typeof destinoPesquisa === "string") {
    const r = await pesquisarDestino(destinoPesquisa);
    if (!r.ok) {
      console.error(`Não consegui pesquisar "${destinoPesquisa}": ${r.motivo}.`);
      console.error("Defina GOOGLE_MAPS_API_KEY para habilitar a pesquisa ao vivo (ver .env.example).");
      process.exitCode = 1;
      return;
    }
    console.log(`\n${r.destino} — roteiro pesquisado\n`);
    console.log(bullets(r));
    console.log(`\n${r.atribuicao}`);
    return;
  }

  const dataArg = arg("data");
  if (typeof dataArg === "string" && !dataValida(dataArg)) {
    console.error(`Data invalida: "${dataArg}". Use o formato AAAA-MM-DD (ex.: 2026-08-15).`);
    process.exitCode = 1;
    return;
  }
  const data = typeof dataArg === "string" ? dataArg : new Date();
  const quantidade = Number.parseInt(arg("quantidade", "2"), 10) || 2;
  const pacote = pacoteDoDia(data, { quantidade });

  if (arg("json")) {
    console.log(JSON.stringify(pacote, null, 2));
    return;
  }

  const htmlPath = arg("html");
  if (typeof htmlPath === "string") {
    writeFileSync(htmlPath, renderTodayPage(pacote), "utf-8");
    console.log(`Página do dia gravada em ${htmlPath}`);
    return;
  }

  if (!pacote.itens.length) {
    console.log(`Nenhuma escolha para ${pacote.dia}: nenhuma oferta tem roteiro editorial correspondente.`);
    return;
  }
  console.log(`\n=== A escolha do dia — ${pacote.dia} ===`);
  for (const it of pacote.itens) {
    const o = it.oferta;
    const r = it.roteiro;
    console.log(`\n${o.origemCidade} → ${o.cidade} · ${o.preco} ida e volta (${o.datas}) · ${o.badge}`);
    console.log(`${r.titulo}`);
    if (r.resumo) console.log(`${r.resumo}`);
    console.log("");
    console.log(bullets(r));
    if (r.melhorMes) console.log(`\n  Melhor mês pelo nosso histórico: ${r.melhorMes}`);
    if (r.foto && r.foto.url) console.log(`  Foto: ${r.foto.url}${r.foto.credito ? ` (${r.foto.credito})` : ""}`);
    console.log(`  Oferta: ${o.href}   Roteiro completo: ${r.href}`);
  }
  console.log("\nPreços são conferidos no site do parceiro antes da compra.\n");
}

main().catch((err) => {
  console.error("Falha no robô diário:", err && err.message ? err.message : err);
  process.exitCode = 1;
});
