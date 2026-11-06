import test from "node:test";
import assert from "node:assert/strict";
import { buscarVoosAoVivo } from "../src/flights/buscarVoos.js";
import { validarConsulta } from "../src/flights/consulta.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { resetAmadeusState } from "../src/partners/amadeus.js";
import { resetarBuscaAoVivo } from "../src/flights/buscaAoVivoLimite.js";

// Às 02:30 UTC ainda é 31/07 em São Paulo.
const agora = new Date("2026-08-01T02:30:00Z");
const rota = { origem: "GRU", destino: "REC" };

function preparar(t) {
  const nomes = ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET", "AMADEUS_ENV"];
  const anteriores = nomes.map((nome) => process.env[nome]);
  process.env.AMADEUS_CLIENT_ID = "teste";
  process.env.AMADEUS_CLIENT_SECRET = "teste";
  delete process.env.AMADEUS_ENV;
  resetAmadeusState();
  resetarBuscaAoVivo();
  const chamadas = [];
  setFetchImpl(async (url) => {
    chamadas.push(new URL(url));
    const payload = String(url).includes("/security/oauth2/token")
      ? { access_token: "teste", expires_in: 1800, token_type: "Bearer" }
      : { data: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  t.after(() => {
    resetFetchImpl();
    resetAmadeusState();
    resetarBuscaAoVivo();
    nomes.forEach((nome, i) => {
      if (anteriores[i] === undefined) delete process.env[nome];
      else process.env[nome] = anteriores[i];
    });
  });
  return chamadas;
}

for (const ida of ["2026-07-30", "30/07/2026", "30 jul 2026"]) {
  test(`busca direta bloqueia ida passada ${ida} sem HTTP, mesmo com volta futura`, async (t) => {
    const chamadas = preparar(t);
    const resultado = await buscarVoosAoVivo({ ...rota, ida, volta: "2026-08-08" }, { agora });
    assert.deepEqual(resultado, { ok: false, motivo: "datas-passadas" });
    assert.equal(chamadas.length, 0, "nem token nem ofertas devem ser consultados");
  });
}

for (const ida of ["2026-07-31", "01/08/2026"]) {
  test(`busca direta permite hoje/futuro ${ida} no fuso do produto`, async (t) => {
    const chamadas = preparar(t);
    const resultado = await buscarVoosAoVivo({ ...rota, ida, volta: "2026-08-08" }, { agora });
    assert.deepEqual(resultado, { ok: false, motivo: "sem-resultados" });
    const busca = chamadas.find((url) => url.pathname.endsWith("/flight-offers"));
    assert.ok(busca);
    assert.equal(busca.searchParams.get("departureDate"), ida === "2026-07-31" ? ida : "2026-08-01");
    assert.equal(busca.searchParams.get("returnDate"), "2026-08-08");
  });
}

test("busca direta bloqueia a mesma ida após a virada do dia do produto", async (t) => {
  const chamadas = preparar(t);
  const resultado = await buscarVoosAoVivo({ ...rota, ida: "2026-07-31" }, {
    agora: new Date("2026-08-01T03:30:00Z"),
  });
  assert.deepEqual(resultado, { ok: false, motivo: "datas-passadas" });
  assert.equal(chamadas.length, 0);
});

test("busca direta sem datas mantém o par padrão futuro de 30 + 7 dias", async (t) => {
  const chamadas = preparar(t);
  const resultado = await buscarVoosAoVivo(rota, { agora });
  assert.equal(resultado.motivo, "sem-resultados");
  const busca = chamadas.find((url) => url.pathname.endsWith("/flight-offers"));
  assert.ok(busca);
  assert.equal(busca.searchParams.get("departureDate"), "2026-08-31");
  assert.equal(busca.searchParams.get("returnDate"), "2026-09-07");
});

test("busca direta com somente volta passada não chama HTTP", async (t) => {
  const chamadas = preparar(t);
  const resultado = await buscarVoosAoVivo({ ...rota, volta: "2026-07-30" }, { agora });
  assert.equal(resultado.ok, false);
  assert.equal(chamadas.length, 0);
});

test("busca direta também bloqueia passado com o relógio padrão", async (t) => {
  const chamadas = preparar(t);
  const resultado = await buscarVoosAoVivo({ ...rota, ida: "2000-01-01", volta: "2999-01-08" });
  assert.deepEqual(resultado, { ok: false, motivo: "datas-passadas" });
  assert.equal(chamadas.length, 0);
});

test("validarConsulta sem contexto rejeita passado e permite futuro", () => {
  const passada = validarConsulta({ ...rota, ida: "2000-01-01", volta: "2999-01-08" });
  assert.equal(passada.ok, false);
  assert.ok(passada.erros.some((erro) => erro.campo === "ida" && erro.mensagem.includes("futura")));
  assert.equal(validarConsulta({ ...rota, ida: "2999-01-01", volta: "2999-01-08" }).ok, true);
});

test("validarConsulta mantém hoje explícito e datas opcionais", () => {
  const entrada = { ...rota, ida: "2026-07-31", volta: "2026-08-08" };
  assert.equal(validarConsulta(entrada, { hoje: "2026-07-31" }).ok, true);
  assert.equal(validarConsulta(entrada, { hoje: "2026-08-01" }).ok, false);
  assert.equal(validarConsulta(rota, { exigirDatas: false }).ok, true);
});
