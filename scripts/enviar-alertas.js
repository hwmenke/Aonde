#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WORKER DE ENVIO — processa a fila de alertas e manda os e-mails.
//
//   node scripts/enviar-alertas.js              # processa ate 200 pendentes
//   node scripts/enviar-alertas.js --limite 50
//   node scripts/enviar-alertas.js --json
//
// Feito para rodar num cron. E IDEMPOTENTE: rodar duas vezes seguidas nao
// reenvia o que ja saiu (checkpoint em data/alert_queue.checkpoint).
//
// Sem AONDE_EMAIL_PROVIDER configurado ele roda em modo "registro": processa a
// fila, grava o log e DIZ que nao enviou nada. Nao finge envio — quem confia
// num alerta que nunca chega perde a viagem, nao o e-mail.
// ---------------------------------------------------------------------------

import { processarFila } from "../src/newsletter/worker.js";
import { provedorConfigurado } from "../src/newsletter/sender.js";

function arg(nome, padrao = null) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return padrao;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const limite = Number.parseInt(arg("limite", "200"), 10) || 200;
const prov = provedorConfigurado();

const r = await processarFila({ limite });

if (arg("json")) {
  console.log(JSON.stringify(r, null, 2));
} else {
  if (r.modo === "registro") {
    console.log("MODO REGISTRO — nenhum e-mail foi enviado de verdade.");
    console.log(prov && prov.erro ? `  Motivo: ${prov.erro}` : "  Motivo: AONDE_EMAIL_PROVIDER nao definida.");
    console.log("  Configure AONDE_EMAIL_PROVIDER, AONDE_EMAIL_API_KEY e AONDE_EMAIL_FROM (ver .env.example).\n");
  } else {
    console.log(`Provedor: ${r.modo}\n`);
  }
  console.log(`Lidos da fila:        ${r.lidos}`);
  console.log(`Enviados:             ${r.enviados}`);
  console.log(`Pulados:              ${r.pulados}   (descadastrado, sem provedor ou linha invalida)`);
  console.log(`Falhas temporarias:   ${r.falhas}   (ficam na fila para a proxima rodada)`);
  console.log(`Ainda pendentes:      ${r.pendentesRestantes}`);
}
if (r.falhas > 0) process.exitCode = 1;
