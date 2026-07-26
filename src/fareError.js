// Deteccao de erro de tarifa (heuristica de triagem).
//
// "Erro de tarifa" e uma passagem publicada muito abaixo do normal, geralmente
// por falha de precificacao da companhia/consolidador. Este modulo NAO decide
// nada sozinho: ele apenas SINALIZA candidatos para a curadoria humana revisar.
//
// IMPORTANTE — esta e uma HEURISTICA de triagem, nao uma verdade. A curadoria
// decide o que publicar; o modulo nunca publica nada por conta propria. Sem
// amostra historica suficiente, a heuristica se recusa a sinalizar (evita
// falso positivo em cima de pouca informacao).
//
// Regra: so sinaliza (isFareError = true) quando HA amostra suficiente
// (sampleCount >= minSamples) E o desconto sobre a media historica atinge o
// limiar (discountPct >= minDiscountPct).

const DEFAULT_MIN_DISCOUNT_PCT = 60;
const DEFAULT_MIN_SAMPLES = 10;

/**
 * @param {object} input
 * @param {number} input.precoCentavos preco atual da oferta, em centavos
 * @param {number} input.mediaCentavos media historica da rota, em centavos
 * @param {number} input.sampleCount numero de observacoes que sustentam a media
 * @param {object} [options]
 * @param {number} [options.minDiscountPct=60] desconto minimo (%) para sinalizar
 * @param {number} [options.minSamples=10] amostra minima para sinalizar
 * @returns {{ isFareError: boolean, discountPct: number|null, reason: string }}
 */
export function detectFareError(input = {}, options = {}) {
  const { precoCentavos, mediaCentavos, sampleCount } = input;
  const minDiscountPct = options.minDiscountPct ?? DEFAULT_MIN_DISCOUNT_PCT;
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;

  // Entrada invalida: sem media confiavel nao ha como estimar desconto.
  if (
    typeof mediaCentavos !== "number" ||
    Number.isNaN(mediaCentavos) ||
    mediaCentavos <= 0 ||
    typeof precoCentavos !== "number" ||
    Number.isNaN(precoCentavos)
  ) {
    return {
      isFareError: false,
      discountPct: null,
      reason:
        "Nao sinalizado: sem media historica valida para estimar o desconto (media ausente ou <= 0).",
    };
  }

  const discountPct = Math.max(
    0,
    Math.round(((mediaCentavos - precoCentavos) / mediaCentavos) * 100)
  );

  const samples = typeof sampleCount === "number" && !Number.isNaN(sampleCount) ? sampleCount : 0;

  if (samples < minSamples) {
    return {
      isFareError: false,
      discountPct,
      reason: `Nao sinalizado: amostra insuficiente (${samples} de ${minSamples} observacoes minimas) — heuristica exige historico para reduzir falso positivo.`,
    };
  }

  if (discountPct < minDiscountPct) {
    return {
      isFareError: false,
      discountPct,
      reason: `Nao sinalizado: desconto de ${discountPct}% abaixo do limiar de ${minDiscountPct}% (amostra de ${samples} observacoes).`,
    };
  }

  return {
    isFareError: true,
    discountPct,
    reason: `Suspeita de erro de tarifa: desconto de ${discountPct}% (>= ${minDiscountPct}%) sobre a media, com ${samples} observacoes. HEURISTICA — requer confirmacao da curadoria antes de publicar.`,
  };
}
