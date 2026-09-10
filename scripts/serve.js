#!/usr/bin/env node
// Sobe a API REST de curadoria.
//
// Uso:
//   node scripts/serve.js
//   AONDE_PORT=8080 node scripts/serve.js
//   PORT=10000 node scripts/serve.js   # PaaS (Render/Railway) injeta PORT
//
// Porta: PORT || AONDE_PORT || 3333. Host: 0.0.0.0 (obrigatorio em PaaS;
// localhost continua funcionando no desenvolvimento local).
// CORS: AONDE_CORS_ORIGIN (ausente = sem CORS).

import { createServer } from "../src/server.js";

const port = Number(process.env.PORT || process.env.AONDE_PORT) || 3333;
const host = "0.0.0.0";
const server = createServer();

server.listen(port, host, () => {
  console.log(`API de curadoria Aonde no ar em http://${host}:${port}`);
  console.log("Endpoints:");
  console.log(`  GET  http://localhost:${port}/api/health`);
  console.log(`  GET  http://localhost:${port}/api/offers?status=rascunho`);
  console.log(`  GET  http://localhost:${port}/api/offers/:id`);
  console.log(`  POST http://localhost:${port}/api/offers/:id/click`);
  if (process.env.AONDE_CORS_ORIGIN) {
    console.log(`CORS habilitado para origem: ${process.env.AONDE_CORS_ORIGIN}`);
  }
});
