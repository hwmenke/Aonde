// Testes da busca de voos "ao vivo" (src/flights/) e da integracao com
// GET /resultados (src/server.js). Cobre: mapeamento da resposta da Amadeus
// para o formato de FLIGHTS; fallback sem credencial; fallback em erro/
// timeout da API; e que a pagina NUNCA responde 500 nem trava, com ou sem
// credencial. Nenhum teste bate na rede de verdade — fetch e sempre mockado
// (setFetchImpl, o padrao do projeto — ver src/http.js).

import test from "node:test";
import assert from "node:assert/strict";

import { mapAmadeusOffersToFlights, formatDuracao, formatHora, nomeCia } from "../src/flights/mapAmadeus.js";
import { buscarVoosAoVivo } from "../src/flights/buscarVoos.js";
import { parseDataPtBr, dataIdaPadrao, dataVoltaPadrao } from "../src/flights/datas.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { resetAmadeusState } from "../src/partners/amadeus.js";
import { createServer } from "../src/server.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function amadeusToken(accessToken = "tok-voos") {
  return jsonResponse({ access_token: accessToken, expires_in: 1800, token_type: "Bearer" });
}

// Fixture de uma oferta valida da Flight Offers Search (shape publicamente
// documentado pela Amadeus — ver ressalva em searchFlightOffers).
function offer({
  id = "1",
  carrier = "AD",
  numero = "4102",
  saida = "2026-09-01T07:15:00",
  chegada = "2026-09-01T10:20:00",
  duracao = "PT3H05M",
  total = "1184.00",
  segundoSegmento = null,
} = {}) {
  const segments = [
    {
      departure: { iataCode: "GRU", at: saida },
      arrival: { iataCode: segundoSegmento ? segundoSegmento.origem : "REC", at: segundoSegmento ? segundoSegmento.chegadaPrimeiroTrecho : chegada },
      carrierCode: carrier,
      number: numero,
    },
  ];
  if (segundoSegmento) {
    segments.push({
      departure: { iataCode: segundoSegmento.origem, at: segundoSegmento.saidaSegundoTrecho },
      arrival: { iataCode: "REC", at: chegada },
      carrierCode: carrier,
      number: segundoSegmento.numero || numero,
    });
  }
  return {
    type: "flight-offer",
    id,
    itineraries: [{ duration: duracao, segments }],
    price: { currency: "BRL", total, grandTotal: total },
    validatingAirlineCodes: [carrier],
  };
}

function offersResponse(offers, dictionaries = { carriers: { AD: "AZUL LINHAS AEREAS", G3: "GOL LINHAS AEREAS", LA: "LATAM" } }) {
  return jsonResponse({ data: offers, dictionaries });
}

// Simula uma API travada: so "resolve" (rejeitando, como o fetch nativo faz)
// quando o AbortSignal de src/http.js dispara — igual ao fetch de verdade.
// Um mock que ignorasse o signal ficaria pendurado pra sempre e derrubaria o
// runner de teste (promise nunca resolvida).
function fetchQueTravaAteAbortar() {
  return (_url, opts) =>
    new Promise((_resolve, reject) => {
      const signal = opts && opts.signal;
      if (!signal) return; // nao deveria acontecer: sempre passamos timeoutMs
      const onAbort = () => {
        const err = new Error("A operacao foi abortada.");
        err.name = "AbortError";
        reject(err);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort);
    });
}

async function setupAmadeus(t, fetchImpl, { creds = true } = {}) {
  const snap = {
    id: process.env.AMADEUS_CLIENT_ID,
    secret: process.env.AMADEUS_CLIENT_SECRET,
    env: process.env.AMADEUS_ENV,
    timeout: process.env.AMADEUS_SEARCH_TIMEOUT_MS,
    maxResults: process.env.AMADEUS_SEARCH_MAX_RESULTS,
  };
  if (creds) {
    process.env.AMADEUS_CLIENT_ID = "client-id";
    process.env.AMADEUS_CLIENT_SECRET = "client-secret";
  } else {
    delete process.env.AMADEUS_CLIENT_ID;
    delete process.env.AMADEUS_CLIENT_SECRET;
  }
  delete process.env.AMADEUS_ENV;
  resetAmadeusState();
  if (fetchImpl) setFetchImpl(fetchImpl);

  t.after(() => {
    if (fetchImpl) resetFetchImpl();
    resetAmadeusState();
    for (const [key, envKey] of [
      [snap.id, "AMADEUS_CLIENT_ID"],
      [snap.secret, "AMADEUS_CLIENT_SECRET"],
      [snap.env, "AMADEUS_ENV"],
      [snap.timeout, "AMADEUS_SEARCH_TIMEOUT_MS"],
      [snap.maxResults, "AMADEUS_SEARCH_MAX_RESULTS"],
    ]) {
      if (key === undefined) delete process.env[envKey];
      else process.env[envKey] = key;
    }
  });
}

// ---------------------------------------------------------------------------
// mapAmadeusOffersToFlights — mapeamento puro (sem rede)
// ---------------------------------------------------------------------------

test("mapAmadeusOffersToFlights: voo direto vira { direto:true, paradas:'Direto' }", () => {
  const raw = { data: [offer({ carrier: "AD", numero: "4102", total: "1184.00" })], dictionaries: {} };
  const voos = mapAmadeusOffersToFlights(raw);
  assert.equal(voos.length, 1);
  const v = voos[0];
  assert.equal(v.cia, "Azul"); // da lista curada NOMES_CIA, nao do dicionario
  assert.equal(v.numero, "AD 4102 · direto");
  assert.equal(v.saida, "07:15");
  assert.equal(v.chegada, "10:20");
  assert.equal(v.duracao, "3h 05");
  assert.equal(v.paradas, "Direto");
  assert.equal(v.direto, true);
  assert.equal(v.preco, "R$ 1.184");
  assert.equal(v.parcela, "R$ 98,67");
  assert.equal(v.melhor, true); // unico voo -> mais barato por definicao
});

test("mapAmadeusOffersToFlights: voo com conexao vira { direto:false, paradas:'1 parada · <IATA>' }", () => {
  const raw = {
    data: [
      offer({
        carrier: "LA",
        numero: "3342",
        saida: "2026-09-01T06:30:00",
        chegada: "2026-09-01T11:45:00",
        duracao: "PT5H15M",
        total: "1092.00",
        segundoSegmento: {
          origem: "BSB",
          chegadaPrimeiroTrecho: "2026-09-01T08:20:00",
          saidaSegundoTrecho: "2026-09-01T09:10:00",
          numero: "3343",
        },
      }),
    ],
    dictionaries: {},
  };
  const voos = mapAmadeusOffersToFlights(raw);
  assert.equal(voos.length, 1);
  const v = voos[0];
  assert.equal(v.cia, "LATAM");
  assert.equal(v.numero, "LA 3342 · via BSB");
  assert.equal(v.direto, false);
  assert.equal(v.paradas, "1 parada · BSB");
  assert.equal(v.duracao, "5h 15");
});

test("mapAmadeusOffersToFlights: ordena por preco crescente e marca so o mais barato como melhor", () => {
  const raw = {
    data: [
      offer({ id: "a", carrier: "AD", numero: "1", total: "1300.00" }),
      offer({ id: "b", carrier: "G3", numero: "2", total: "999.00" }),
      offer({ id: "c", carrier: "LA", numero: "3", total: "1100.00" }),
    ],
    dictionaries: {},
  };
  const voos = mapAmadeusOffersToFlights(raw);
  assert.deepEqual(
    voos.map((v) => v.preco),
    ["R$ 999", "R$ 1.100", "R$ 1.300"]
  );
  assert.deepEqual(
    voos.map((v) => v.melhor),
    [true, false, false]
  );
});

test("mapAmadeusOffersToFlights: respeita opts.max", () => {
  const raw = {
    data: Array.from({ length: 10 }, (_, i) => offer({ id: String(i), numero: String(i), total: `${1000 + i}.00` })),
    dictionaries: {},
  };
  const voos = mapAmadeusOffersToFlights(raw, { max: 3 });
  assert.equal(voos.length, 3);
});

test("mapAmadeusOffersToFlights: pula ofertas malformadas sem derrubar as demais", () => {
  const raw = {
    data: [
      { itineraries: [] }, // sem segmentos
      { itineraries: [{ duration: "PT1H", segments: [] }] }, // segments vazio
      { itineraries: [{ duration: "nao-e-iso", segments: [{ departure: {}, arrival: {} }] }] }, // duracao invalida
      null,
      "string-solta",
      offer({ carrier: "G3", numero: "1748", total: "1236.00" }), // essa e valida
    ],
    dictionaries: {},
  };
  const voos = mapAmadeusOffersToFlights(raw);
  assert.equal(voos.length, 1);
  assert.equal(voos[0].cia, "GOL");
});

test("mapAmadeusOffersToFlights: sem dados reconheciveis devolve lista vazia (nunca lanca)", () => {
  assert.deepEqual(mapAmadeusOffersToFlights(null), []);
  assert.deepEqual(mapAmadeusOffersToFlights({}), []);
  assert.deepEqual(mapAmadeusOffersToFlights({ data: "nao-e-array" }), []);
});

test("nomeCia usa o dicionario da resposta quando o codigo nao esta na lista curada", () => {
  assert.equal(nomeCia("TP", { carriers: {} }), "TAP Portugal"); // lista curada
  assert.equal(nomeCia("XX", { carriers: { XX: "COMPANHIA TESTE" } }), "Companhia Teste");
  assert.equal(nomeCia("ZZ", {}), "ZZ"); // sem dicionario nem lista curada -> codigo cru
});

test("formatHora/formatDuracao toleram entrada invalida sem lancar", () => {
  assert.equal(formatHora(undefined), "");
  assert.equal(formatHora("data-invalida"), "");
  assert.equal(formatDuracao(null), "");
  assert.equal(formatDuracao("nao-iso"), "");
  assert.equal(formatDuracao("PT45M"), "0h 45");
  assert.equal(formatDuracao("PT3H"), "3h 00");
});

// ---------------------------------------------------------------------------
// src/flights/datas.js — parsing de datas pt-BR
// ---------------------------------------------------------------------------

test("parseDataPtBr reconhece ISO, 'DD mes YYYY' e DD/MM/YYYY", () => {
  assert.equal(parseDataPtBr("2026-08-12"), "2026-08-12");
  assert.equal(parseDataPtBr("12 ago 2026"), "2026-08-12");
  assert.equal(parseDataPtBr("12 de agosto de 2026"), "2026-08-12");
  assert.equal(parseDataPtBr("12/08/2026"), "2026-08-12");
});

test("parseDataPtBr rejeita entrada invalida sem lancar", () => {
  assert.equal(parseDataPtBr(""), null);
  assert.equal(parseDataPtBr(undefined), null);
  assert.equal(parseDataPtBr("qualquer coisa"), null);
  assert.equal(parseDataPtBr("31/02/2026"), null); // fevereiro nao tem 31 dias
});

test("dataIdaPadrao/dataVoltaPadrao geram um par de datas futuras consistente", () => {
  const hoje = new Date("2026-07-29T12:00:00Z");
  const ida = dataIdaPadrao(hoje, 30);
  assert.equal(ida, "2026-08-28");
  const volta = dataVoltaPadrao(ida, 7);
  assert.equal(volta, "2026-09-04");
  assert.equal(dataVoltaPadrao("data-invalida"), null);
});

// ---------------------------------------------------------------------------
// buscarVoosAoVivo — orquestracao (credencial / sucesso / falha / timeout)
// ---------------------------------------------------------------------------

test("buscarVoosAoVivo: sem credencial Amadeus devolve ok:false imediatamente, sem tentar rede", async (t) => {
  let chamou = false;
  await setupAmadeus(t, async () => {
    chamou = true;
    return jsonResponse({});
  }, { creds: false });

  const res = await buscarVoosAoVivo({ origem: "GRU", destino: "REC" });
  assert.equal(res.ok, false);
  assert.equal(res.motivo, "sem-credencial");
  assert.equal(chamou, false, "nao deveria tentar chamar a rede sem credencial");
});

test("buscarVoosAoVivo: com credencial e resposta valida, devolve voos mapeados", async (t) => {
  let chamadas = 0;
  await setupAmadeus(t, async (url) => {
    chamadas++;
    const u = String(url);
    if (u.includes("/security/oauth2/token")) return amadeusToken();
    if (u.includes("/v2/shopping/flight-offers")) {
      return offersResponse([offer({ carrier: "AD", numero: "4102", total: "1184.00" })]);
    }
    return jsonResponse({}, 404);
  });

  const res = await buscarVoosAoVivo({ origem: "GRU", destino: "REC", ida: "12 ago 2026", volta: "19 ago 2026" });
  assert.equal(res.ok, true);
  assert.equal(res.voos.length, 1);
  assert.equal(res.voos[0].preco, "R$ 1.184");
  assert.ok(chamadas >= 2, "deveria ter chamado token + busca de ofertas");
});

test("buscarVoosAoVivo: erro HTTP da Amadeus cai em ok:false (fallback), nunca lanca", async (t) => {
  await setupAmadeus(t, async (url) => {
    const u = String(url);
    if (u.includes("/security/oauth2/token")) return amadeusToken();
    return jsonResponse({ error: "boom" }, 500);
  });

  const res = await buscarVoosAoVivo({ origem: "GRU", destino: "REC" });
  assert.equal(res.ok, false);
  assert.ok(res.motivo === "erro" || res.motivo === "timeout-geral");
});

test("buscarVoosAoVivo: sem ofertas na resposta cai em ok:false, motivo sem-resultados", async (t) => {
  await setupAmadeus(t, async (url) => {
    const u = String(url);
    if (u.includes("/security/oauth2/token")) return amadeusToken();
    return offersResponse([]);
  });

  const res = await buscarVoosAoVivo({ origem: "GRU", destino: "REC" });
  assert.equal(res.ok, false);
  assert.equal(res.motivo, "sem-resultados");
});

test("buscarVoosAoVivo: timeout da API (fetch trava) cai em ok:false rapido, sem travar o teste", async (t) => {
  const snapTimeout = process.env.AMADEUS_SEARCH_TIMEOUT_MS;
  process.env.AMADEUS_SEARCH_TIMEOUT_MS = "30"; // curtissimo, so pra este teste ser rapido
  // fetch que nunca resolve, simulando uma API travada.
  await setupAmadeus(t, fetchQueTravaAteAbortar());
  t.after(() => {
    if (snapTimeout === undefined) delete process.env.AMADEUS_SEARCH_TIMEOUT_MS;
    else process.env.AMADEUS_SEARCH_TIMEOUT_MS = snapTimeout;
  });

  const inicio = Date.now();
  const res = await buscarVoosAoVivo({ origem: "GRU", destino: "REC" });
  const duracaoMs = Date.now() - inicio;

  assert.equal(res.ok, false);
  assert.ok(duracaoMs < 2000, `deveria cair no fallback rapido, levou ${duracaoMs}ms`);
});

test("buscarVoosAoVivo: entrada invalida (origem malformada) nunca lanca, so devolve ok:false", async (t) => {
  await setupAmadeus(t, async (url) => {
    const u = String(url);
    if (u.includes("/security/oauth2/token")) return amadeusToken();
    return jsonResponse({}, 404); // nao deveria nem chegar aqui
  });

  await assert.doesNotReject(async () => {
    const res = await buscarVoosAoVivo({ origem: "1AB", destino: "REC" }); // origem invalida (nao e so letras)
    assert.equal(res.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Integracao com GET /resultados (src/server.js) — a pagina nunca quebra
// ---------------------------------------------------------------------------

async function withServer(fn) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(base, path) {
  const res = await fetch(base + path);
  const body = await res.text();
  return { status: res.status, body };
}

test("GET /resultados sem credencial Amadeus: continua servindo os voos de exemplo (200)", async (t) => {
  await setupAmadeus(t, null, { creds: false });

  await withServer(async (base) => {
    const r = await get(base, "/resultados?origem=GRU&destino=REC");
    assert.equal(r.status, 200);
    assert.ok(r.body.includes("voos de exemplo"), "sem credencial, deve continuar mostrando os voos de exemplo");
  });
});

test("GET /resultados com credencial + Amadeus respondendo: mostra voos reais mapeados", async (t) => {
  await setupAmadeus(t, async (url) => {
    const u = String(url);
    if (u.includes("/security/oauth2/token")) return amadeusToken();
    if (u.includes("/v2/shopping/flight-offers")) {
      return offersResponse([offer({ carrier: "AD", numero: "9999", total: "777.00" })]);
    }
    return jsonResponse({}, 404);
  });

  await withServer(async (base) => {
    const r = await get(base, "/resultados?origem=GRU&destino=REC&ida=12+ago+2026&volta=19+ago+2026");
    assert.equal(r.status, 200);
    // O voo real mapeado (numero de voo/preco unicos desta fixture) aparece
    // na pagina — nao e mais so a lista fixa de 5 voos de amostra.
    assert.ok(r.body.includes("9999"), "deveria conter o numero do voo real retornado pela Amadeus");
    assert.ok(r.body.includes("R$ 777"), "deveria conter o preco real retornado pela Amadeus");
  });
});

test("GET /resultados com credencial mas Amadeus fora do ar: cai no fallback, nunca 500", async (t) => {
  await setupAmadeus(t, async () => jsonResponse({ error: "fora do ar" }, 503));

  await withServer(async (base) => {
    const r = await get(base, "/resultados?origem=GRU&destino=REC");
    assert.equal(r.status, 200);
    assert.ok(r.body.includes("voos de exemplo"), "erro na Amadeus deve cair no fallback de exemplo");
  });
});

test("GET /resultados com credencial e Amadeus travando (timeout curto): responde rapido, nunca 500", async (t) => {
  const snapTimeout = process.env.AMADEUS_SEARCH_TIMEOUT_MS;
  process.env.AMADEUS_SEARCH_TIMEOUT_MS = "50";
  await setupAmadeus(t, fetchQueTravaAteAbortar()); // fetch que nunca resolve
  t.after(() => {
    if (snapTimeout === undefined) delete process.env.AMADEUS_SEARCH_TIMEOUT_MS;
    else process.env.AMADEUS_SEARCH_TIMEOUT_MS = snapTimeout;
  });

  await withServer(async (base) => {
    const inicio = Date.now();
    const r = await get(base, "/resultados?origem=GRU&destino=REC");
    const duracaoMs = Date.now() - inicio;
    assert.equal(r.status, 200);
    assert.ok(r.body.includes("voos de exemplo"));
    assert.ok(duracaoMs < 3000, `pagina nao deveria travar esperando a Amadeus, levou ${duracaoMs}ms`);
  });
});

test("GET /resultados sem busca (sem origem/destino): nao tenta a Amadeus mesmo com credencial", async (t) => {
  let chamou = false;
  await setupAmadeus(t, async () => {
    chamou = true;
    return jsonResponse({}, 500);
  });

  await withServer(async (base) => {
    const r = await get(base, "/resultados");
    assert.equal(r.status, 200);
    assert.ok(r.body.includes("voos de exemplo"));
  });
  assert.equal(chamou, false, "pagina generica (sem busca) nao deveria chamar a Amadeus");
});
