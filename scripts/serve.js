#!/usr/bin/env node
// Sobe a API REST de curadoria.
//
// Uso:
//   node scripts/serve.js
//   AONDE_PORT=8080 node scripts/serve.js
//
// Porta: AONDE_PORT (default 3333). CORS: AONDE_CORS_ORIGIN (ausente = sem CORS).

import { createServer } from "../src/server.js";

const port = Number(process.env.AONDE_PORT) || 3333;
const server = createServer();

server.listen(port, () => {
  console.log(`API de curadoria Aonde no ar em http://localhost:${port}`);
  console.log("Endpoints:");
  console.log(`  GET  http://localhost:${port}/api/health`);
  console.log(`  GET  http://localhost:${port}/api/offers?status=rascunho`);
  console.log(`  GET  http://localhost:${port}/api/offers/:id`);
  console.log(`  POST http://localhost:${port}/api/offers/:id/click`);
  if (process.env.AONDE_CORS_ORIGIN) {
    console.log(`CORS habilitado para origem: ${process.env.AONDE_CORS_ORIGIN}`);
  }
});
