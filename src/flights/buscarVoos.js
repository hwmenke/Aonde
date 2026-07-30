// Orquestra a busca de voos "ao vivo" para GET /resultados (ver
// handleResultsHtml em src/server.js — o UNICO chamador desta funcao).
//
// Com credenciais Amadeus configuradas (AMADEUS_CLIENT_ID/SECRET), tenta
// buscar ofertas reais via Flight Offers Search e mapeia para o formato de
// FLIGHTS (src/render/aondeContent.js). Sem credenciais, ou em QUALQUER falha
// ou demora, devolve ok:false — o chamador cai no mesmo fallback de exemplo
// que ja existia antes desta integracao, silenciosamente.
//
// REGRA DE OURO (honestidade + robustez): esta funcao NUNCA lanca excecao e
// NUNCA deixa o chamador esperar mais que um teto curto e configuravel — a
// pagina de resultados nao pode quebrar nem ficar lenta por causa de um
// parceiro externo fora do ar.

import { hasAmadeusCredentials, searchFlightOffers } from "../partners/amadeus.js";
import { mapAmadeusOffersToFlights } from "./mapAmadeus.js";
import { parseDataPtBr, dataIdaPadrao, dataVoltaPadrao } from "./datas.js";

// Timeout de CADA chamada HTTP (token + busca) da tentativa ao vivo.
// Configuravel via AMADEUS_SEARCH_TIMEOUT_MS (ver .env.example). Curto de
// proposito: e melhor cair no fallback de exemplo rapido do que fazer a
// pessoa esperar por uma API fora do ar.
const DEFAULT_TIMEOUT_MS = 3000;
// Quantos voos (os mais baratos) a tela mostra quando a busca e real.
const DEFAULT_MAX_RESULTS = 6;
// Margem sobre o timeout de cada chamada usada no teto GERAL (Promise.race,
// abaixo): cobre o caso raro em que o timeout do proprio http.js nao dispara
// a tempo por algum motivo. Nunca deixamos o total passar disso.
const TETO_GERAL_MARGEM_MS = 1000;

function lerIntEnv(nomeEnv, padrao) {
  const raw = process.env[nomeEnv];
  if (raw === undefined || raw === null || String(raw).trim() === "") return padrao;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

function timeoutMsConfigurado() {
  return lerIntEnv("AMADEUS_SEARCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
}

function maxResultadosConfigurado() {
  const n = lerIntEnv("AMADEUS_SEARCH_MAX_RESULTS", DEFAULT_MAX_RESULTS);
  return Math.min(n, 20);
}

/**
 * Resolve as datas de ida/volta a partir do que o usuario digitou no
 * formulario ("ida"/"volta", texto livre pt-BR — ver searchCardHtml em
 * src/render/htmlRenderer.js). A busca AO VIVO e sempre ida e volta: a tela
 * mostra o preco com o rotulo fixo "ida e volta, por pessoa" (nao editavel
 * por este modulo — ver src/render/htmlRenderer.js), entao buscar so ida
 * mostraria um preco que nao bate com o rotulo. Quando o usuario nao
 * informou uma data reconhecivel, usa um par de datas padrao (daqui a 30
 * dias, viagem de 7 dias) so para a consulta ter uma data concreta — a
 * pessoa escolhe as datas de verdade no site do parceiro, como o aviso
 * abaixo dos resultados sempre deixou claro.
 */
function resolverDatas({ ida, volta } = {}, agora = new Date()) {
  const departureDate = parseDataPtBr(ida) || dataIdaPadrao(agora);
  const returnDate = parseDataPtBr(volta) || dataVoltaPadrao(departureDate);
  return { departureDate, returnDate };
}

/**
 * Busca voos ao vivo para origem/destino. Nunca lanca excecao. Retorno:
 *   { ok: true, voos: [...] }                                — sucesso
 *   { ok: false, motivo: "sem-credencial"|"sem-resultados"|"erro"|"timeout-geral", detalhe? }
 * `motivo`/`detalhe` sao so para diagnostico interno (logs/testes) — o
 * chamador (src/server.js) so olha `ok` e decide cair no fallback de exemplo.
 *
 * @param {object} params
 * @param {string} params.origem IATA de origem (ja validado pelo chamador)
 * @param {string} params.destino IATA de destino (ja validado pelo chamador)
 * @param {string} [params.ida] data de ida digitada (texto livre pt-BR)
 * @param {string} [params.volta] data de volta digitada (texto livre pt-BR)
 * @param {{adultos?:number, criancas?:number, bebes?:number}} [params.pax]
 */
export async function buscarVoosAoVivo({ origem, destino, ida, volta, pax } = {}) {
  if (!hasAmadeusCredentials()) {
    return { ok: false, motivo: "sem-credencial" };
  }

  const timeoutMs = timeoutMsConfigurado();
  const max = maxResultadosConfigurado();
  const { departureDate, returnDate } = resolverDatas({ ida, volta });

  const adultos = pax && Number.isFinite(pax.adultos) && pax.adultos > 0 ? pax.adultos : 1;
  const criancas = pax && Number.isFinite(pax.criancas) && pax.criancas > 0 ? pax.criancas : 0;
  const bebes = pax && Number.isFinite(pax.bebes) && pax.bebes > 0 ? pax.bebes : 0;

  const buscaPromise = executarBusca({
    origem,
    destino,
    departureDate,
    returnDate,
    adultos,
    criancas,
    bebes,
    timeoutMs,
    max,
  });

  // Teto duro: garante que handleResultsHtml nunca fica preso alem disso,
  // mesmo se algo abaixo nao respeitar o timeoutMs individual. O timer e
  // desarmado (clearTimeout) e nao mantem o processo vivo (unref), entao nao
  // atrasa nem os testes nem o encerramento do servidor.
  let timer;
  const tetoPromise = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, motivo: "timeout-geral" }),
      timeoutMs + TETO_GERAL_MARGEM_MS
    );
    if (timer && typeof timer.unref === "function") timer.unref();
  });

  try {
    return await Promise.race([buscaPromise, tetoPromise]);
  } catch (err) {
    // Defesa extra: buscarVoosAoVivo NUNCA lanca, mesmo se algo inesperado
    // escapar do tratamento interno (searchFlightOffers/mapAmadeusOffersToFlights
    // ja nao lancam, por contrato — isto e so um cinto de seguranca a mais).
    return { ok: false, motivo: "erro", detalhe: (err && err.message) || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function executarBusca({
  origem,
  destino,
  departureDate,
  returnDate,
  adultos,
  criancas,
  bebes,
  timeoutMs,
  max,
}) {
  const res = await searchFlightOffers({
    origin: origem,
    destination: destino,
    departureDate,
    returnDate,
    adults: adultos,
    children: criancas,
    infants: bebes,
    currency: "BRL",
    max,
    timeoutMs,
    retries: 0, // busca ao vivo precisa ser rapida; o fallback ja cobre a falha
  });

  if (!res.ok) {
    return { ok: false, motivo: "erro", detalhe: res.error };
  }

  const voos = mapAmadeusOffersToFlights(res.data, { max });
  if (!voos.length) {
    return { ok: false, motivo: "sem-resultados" };
  }

  return { ok: true, voos };
}
