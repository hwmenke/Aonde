import test from "node:test";
import assert from "node:assert/strict";

import {
  buildItinerary,
  renderItineraryMarkdown,
  weightedScore,
} from "../src/guides/itineraryBuilder.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// -----------------------------------------------------------------------
// Helpers de fixture
// -----------------------------------------------------------------------

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Ponto turistico i (1..N). Score ponderado DECRESCE com i (rating fixo,
// ratingCount decrescente) => place 1 e o melhor. `geo` controla se tem lat/lng.
function makeAttraction(i, { total = 12, geo = true, summary } = {}) {
  const place = {
    id: `attr-${i}`,
    displayName: { text: `Atracao ${i}`, languageCode: "pt-BR" },
    formattedAddress: `Rua ${i}, Recife`,
    types: ["tourist_attraction"],
    googleMapsUri: `https://maps.google.com/?cid=${i}`,
    rating: 4.5,
    userRatingCount: (total - i + 1) * 1000, // decresce com i
  };
  if (geo) place.location = { latitude: -8.0 - i * 0.01, longitude: -34.9 + i * 0.01 };
  if (summary != null) place.editorialSummary = { text: summary, languageCode: "pt-BR" };
  return place;
}

function makeRestaurant(i) {
  return {
    id: `rest-${i}`,
    displayName: { text: `Restaurante ${i}`, languageCode: "pt-BR" },
    formattedAddress: `Av. ${i}, Recife`,
    types: ["restaurant"],
    googleMapsUri: `https://maps.google.com/?cid=r${i}`,
    rating: 4.6,
    userRatingCount: 500,
    location: { latitude: -8.05, longitude: -34.88 },
  };
}

// Instala um fetch mock que distingue as duas buscas pelo includedType do corpo.
function installFetch({ attractions = [], restaurants = [], attractionsStatus = 200 } = {}) {
  setFetchImpl(async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.includedType === "restaurant") {
      return jsonResponse({ places: restaurants });
    }
    // tourist_attraction (default)
    if (attractionsStatus !== 200) {
      return jsonResponse({ error: { message: "falha" } }, attractionsStatus);
    }
    return jsonResponse({ places: attractions });
  });
}

function withApiKey(fn) {
  return async (t) => {
    const original = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = "fake-key";
    t.after(() => {
      resetFetchImpl();
      if (original === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
      else process.env.GOOGLE_MAPS_API_KEY = original;
    });
    await fn(t);
  };
}

// -----------------------------------------------------------------------
// weightedScore
// -----------------------------------------------------------------------

test("weightedScore combina rating e volume (mais avaliacoes desempata)", () => {
  const poucas = { rating: 5.0, ratingCount: 3 };
  const muitas = { rating: 4.7, ratingCount: 20000 };
  assert.ok(weightedScore(muitas) > weightedScore(poucas));
  // Sem rating => score 0
  assert.equal(weightedScore({ ratingCount: 100 }), 0);
});

// -----------------------------------------------------------------------
// Distribuicao em 5 dias com 12 lugares
// -----------------------------------------------------------------------

test(
  "buildItinerary distribui 12 lugares em 5 dias de forma equilibrada",
  withApiKey(async () => {
    const attractions = Array.from({ length: 12 }, (_, k) => makeAttraction(k + 1));
    const restaurants = Array.from({ length: 5 }, (_, k) => makeRestaurant(k + 1));
    installFetch({ attractions, restaurants });

    const it = await buildItinerary({ destination: "Recife", days: 5, regionCode: "BR" });

    assert.equal(it.ok, true);
    assert.equal(it.destination, "Recife");
    assert.equal(it.days.length, 5);

    // Todos os 12 pontos foram distribuidos, sem perdas nem duplicatas.
    const totalPontos = it.days.reduce((s, d) => s + d.pontos.length, 0);
    assert.equal(totalPontos, 12);

    // Equilibrio: round-robin de 12/5 => contagens 3,3,2,2,2 (cada dia 2-3,
    // diferenca max<->min <= 1, nenhum dia vazio).
    const counts = it.days.map((d) => d.pontos.length);
    assert.equal(Math.max(...counts) - Math.min(...counts) <= 1, true);
    assert.equal(Math.min(...counts) >= 2, true);
    assert.equal(Math.max(...counts) <= 3, true);

    // Numeracao sequencial dos dias.
    assert.deepEqual(it.days.map((d) => d.n), [1, 2, 3, 4, 5]);

    // Cada dia tem 1 restaurante sugerido.
    for (const d of it.days) {
      assert.ok(d.restaurante && d.restaurante.nome, `dia ${d.n} deve ter restaurante`);
    }

    // Atribuicao obrigatoria presente.
    assert.equal(it.attribution, "Dados de lugares: Google");
  })
);

// -----------------------------------------------------------------------
// Ordenacao por nota ponderada (sem geo => preserva a ordem do round-robin,
// que segue o ranking por score)
// -----------------------------------------------------------------------

test(
  "buildItinerary ordena por nota ponderada: o melhor ponto cai no dia 1",
  withApiKey(async () => {
    // Sem geo: orderByProximity nao reordena, entao a ordem por score e visivel.
    const attractions = Array.from({ length: 12 }, (_, k) =>
      makeAttraction(k + 1, { geo: false })
    );
    installFetch({ attractions, restaurants: [] });

    const it = await buildItinerary({ destination: "Recife", days: 5 });

    // Atracao 1 tem o maior score (maior ratingCount) => primeiro ponto do dia 1.
    assert.equal(it.days[0].pontos[0].nome, "Atracao 1");
    // Dia 1 (round-robin) recebe os indices 0,5,10 do ranking => Atracao 1,6,11.
    assert.deepEqual(
      it.days[0].pontos.map((p) => p.nome),
      ["Atracao 1", "Atracao 6", "Atracao 11"]
    );
  })
);

// -----------------------------------------------------------------------
// Sem editorialSummary => resumo omitido
// -----------------------------------------------------------------------

test(
  "buildItinerary omite resumo quando o lugar nao tem editorialSummary",
  withApiKey(async () => {
    const attractions = [
      makeAttraction(1, { summary: "Marco historico da cidade." }),
      makeAttraction(2), // sem summary
    ];
    installFetch({ attractions, restaurants: [] });

    const it = await buildItinerary({ destination: "Recife", days: 2, withRestaurants: false });
    const todos = it.days.flatMap((d) => d.pontos);
    const comResumo = todos.find((p) => p.nome === "Atracao 1");
    const semResumo = todos.find((p) => p.nome === "Atracao 2");

    assert.equal(comResumo.resumo, "Marco historico da cidade.");
    assert.equal("resumo" in semResumo, false); // chave ausente, nao undefined
  })
);

// -----------------------------------------------------------------------
// Erro HTTP na busca de pontos => ok:false
// -----------------------------------------------------------------------

test(
  "buildItinerary retorna ok:false quando a busca de pontos falha (HTTP)",
  withApiKey(async () => {
    installFetch({ attractionsStatus: 500 });
    const it = await buildItinerary({ destination: "Recife", days: 5 });
    assert.equal(it.ok, false);
    assert.deepEqual(it.days, []);
    assert.ok(it.error);
  })
);

// -----------------------------------------------------------------------
// Sem API key => ok:false com instrucao
// -----------------------------------------------------------------------

test("buildItinerary sem API key retorna ok:false com instrucao", async (t) => {
  const original = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = original;
  });

  const it = await buildItinerary({ destination: "Recife", days: 5 });
  assert.equal(it.ok, false);
  assert.match(it.error, /GOOGLE_MAPS_API_KEY/);
});

// -----------------------------------------------------------------------
// destination obrigatorio
// -----------------------------------------------------------------------

test("buildItinerary exige destination", async () => {
  const it = await buildItinerary({ days: 5 });
  assert.equal(it.ok, false);
  assert.match(it.error, /destination/);
});

// -----------------------------------------------------------------------
// renderItineraryMarkdown — tudo em bullets, sem "undefined", com atribuicao
// -----------------------------------------------------------------------

test(
  "renderItineraryMarkdown gera markdown todo em bullets, sem undefined, com atribuicao",
  withApiKey(async () => {
    const attractions = [
      makeAttraction(1, { summary: "Ponto historico." }),
      makeAttraction(2), // sem summary
      makeAttraction(3, { summary: "Vista para o mar." }),
    ];
    const restaurants = [makeRestaurant(1), makeRestaurant(2)];
    installFetch({ attractions, restaurants });

    const it = await buildItinerary({ destination: "Recife", days: 2 });
    const md = renderItineraryMarkdown(it);

    // Comeca com titulo '#'
    assert.match(md, /^# Roteiro de 2 dias — Recife/);

    // Sem "undefined" em lugar nenhum
    assert.equal(md.includes("undefined"), false);

    // Todo item de conteudo e bullet: cada linha nao-vazia ou comeca com '#'
    // (o titulo) ou e um bullet ('- ' possivelmente indentado).
    const lines = md.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      const isTitle = line.startsWith("#");
      const isBullet = /^\s*- /.test(line);
      assert.ok(isTitle || isBullet, `linha nao e titulo nem bullet: "${line}"`);
    }

    // Atribuicao obrigatoria no rodape, em bullet
    assert.match(md, /- Dados de lugares: Google/);
    // Data de geracao
    assert.match(md, /- Roteiro gerado em \d{4}-\d{2}-\d{2}/);

    // Ha sub-bullet de restaurante
    assert.match(md, /Sugestao de restaurante/);

    // Um ponto com resumo aparece com o texto do editorialSummary
    assert.ok(md.includes("Ponto historico.") || md.includes("Vista para o mar."));
  })
);

test("renderItineraryMarkdown de um roteiro invalido nao vaza undefined", () => {
  const md = renderItineraryMarkdown({ ok: false, error: "sem chave" });
  assert.equal(md.includes("undefined"), false);
  assert.match(md, /^# Roteiro indisponivel/);
  assert.match(md, /sem chave/);
});
