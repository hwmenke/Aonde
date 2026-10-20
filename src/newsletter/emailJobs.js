// Fila durável dos e-mails de confirmação. O pedido HTTP só é aceito depois
// que o trabalho está no disco. Falha do provedor deixa o trabalho em "falha"
// para nova tentativa, em vez de sumir com o aceite.

import path from "node:path";
import crypto from "node:crypto";

import { resolveDataDir, readJsonSafe, writeJsonAtomic } from "../store/dataDir.js";

function jobsFile() {
  return path.join(resolveDataDir(), "email_jobs.json");
}

function readJobs() {
  const data = readJsonSafe(jobsFile(), []);
  return Array.isArray(data) ? data : [];
}

export function listEmailJobs() {
  return readJobs();
}

export function enqueueEmailJob({ tipo, para, payload } = {}) {
  const job = {
    id: crypto.randomUUID(),
    tipo: String(tipo || ""),
    para: String(para || ""),
    payload: payload && typeof payload === "object" ? payload : {},
    estado: "pendente",
    tentativas: 0,
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    erro: null,
  };
  const all = readJobs();
  all.push(job);
  writeJsonAtomic(jobsFile(), all);
  return job;
}

export function markEmailJob(id, estado, erro) {
  const all = readJobs();
  const index = all.findIndex((job) => job && job.id === id);
  if (index === -1) return null;
  const falhou = estado === "falha";
  all[index] = {
    ...all[index],
    estado,
    tentativas: (all[index].tentativas || 0) + (falhou ? 1 : 0),
    erro: erro ? String(erro).slice(0, 300) : null,
    atualizadoEm: new Date().toISOString(),
  };
  writeJsonAtomic(jobsFile(), all);
  return all[index];
}
