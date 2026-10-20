// Teto da busca ao vivo: limite por cliente, teto de buscas simultâneas e
// uma única ida ao parceiro quando a mesma consulta já está em curso.
// Quem desiste (sinal abortado) cancela o trabalho só quando não resta
// mais ninguém esperando o mesmo resultado.

const JANELA_MS = 60_000;
const MAX_TAXA_PADRAO = 30;
const MAX_SIMULTANEAS_PADRAO = 4;
const MAX_BALDES = 1000;

const baldes = new Map();
const trabalhos = new Map();
let emCurso = 0;
let recusas = 0;

function inteiroEnv(nome, padrao) {
  const raw = process.env[nome];
  if (raw === undefined || raw === null || String(raw).trim() === "") return padrao;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export function chaveDaBusca({ origem, destino, ida, volta, pax } = {}) {
  const adultos = pax && Number.isFinite(Number(pax.adultos)) ? Number(pax.adultos) : 1;
  const criancas = pax && Number.isFinite(Number(pax.criancas)) ? Number(pax.criancas) : 0;
  const bebes = pax && Number.isFinite(Number(pax.bebes)) ? Number(pax.bebes) : 0;
  return [origem || "", destino || "", ida || "", volta || "", adultos, criancas, bebes].join("|");
}

function consumirTaxa(cliente, max, agora = Date.now()) {
  const ip = cliente || "desconhecido";
  let balde = baldes.get(ip);
  if (!balde || agora - balde.inicio >= JANELA_MS) {
    balde = { inicio: agora, n: 0 };
    baldes.set(ip, balde);
  }
  while (baldes.size > MAX_BALDES) {
    const primeiro = baldes.keys().next().value;
    baldes.delete(primeiro);
  }
  balde.n += 1;
  return balde.n <= max;
}

function esquecerSinal(sinal, fn) {
  if (sinal && typeof sinal.removeEventListener === "function") {
    sinal.removeEventListener("abort", fn);
  }
}

/**
 * Executa `run(signal)` uma vez por chave enquanto a busca estiver em curso.
 * @returns {Promise<{ok:boolean, motivo?:string}>}
 */
export function coordenarBusca(params, run, limites = {}) {
  const chave = chaveDaBusca(params);
  const existente = trabalhos.get(chave);
  if (existente) return existente.entrar(params && params.signal);

  const maxTaxa = limites.taxa || inteiroEnv("AONDE_LIVE_SEARCH_MAX", MAX_TAXA_PADRAO);
  const maxSimultaneas = limites.simultaneas || inteiroEnv("AONDE_LIVE_SEARCH_CONCURRENCY", MAX_SIMULTANEAS_PADRAO);
  if (!consumirTaxa(params && params.cliente, maxTaxa)) {
    recusas += 1;
    return Promise.resolve({ ok: false, motivo: "capacidade" });
  }
  if (emCurso >= maxSimultaneas) {
    recusas += 1;
    return Promise.resolve({ ok: false, motivo: "capacidade" });
  }

  const controller = new AbortController();
  const inscritos = new Set();
  emCurso += 1;

  const job = {
    entrar(signal) {
      const item = {};
      const sair = () => {
        if (!inscritos.has(item)) return;
        inscritos.delete(item);
        esquecerSinal(signal, sair);
        if (inscritos.size === 0) controller.abort();
      };
      item.sair = sair;
      inscritos.add(item);
      if (signal && signal.aborted) sair();
      else if (signal && typeof signal.addEventListener === "function") {
        signal.addEventListener("abort", sair, { once: true });
      }
      return trabalho.finally(() => esquecerSinal(signal, sair));
    },
  };

  const trabalho = Promise.resolve()
    .then(() => run(controller.signal))
    .catch((err) => ({ ok: false, motivo: "erro", detalhe: (err && err.message) || String(err) }))
    .finally(() => {
      emCurso = Math.max(0, emCurso - 1);
      trabalhos.delete(chave);
    });

  trabalhos.set(chave, job);
  return job.entrar(params && params.signal);
}

export function estatisticasBuscaAoVivo() {
  return { emCurso, chaves: trabalhos.size, baldes: baldes.size, recusas };
}

/** Só para testes: zera o estado do processo. */
export function resetarBuscaAoVivo() {
  trabalhos.clear();
  baldes.clear();
  emCurso = 0;
  recusas = 0;
}
