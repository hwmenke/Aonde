export function isPositiveCentavos(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/** Parse display strings like "R$ 1.570" / "R$ 1.570,50" into centavos; else null. */
export function precoCentavosOferta(offer) {
  if (offer?.preco_centavos != null) {
    return isPositiveCentavos(offer.preco_centavos) ? offer.preco_centavos : null;
  }
  const raw = typeof offer?.preco === "string" ? offer.preco.trim() : "";
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(/^R\$/i, "");
  // pt-BR: 1.570,50 or 1570,50 or 1.570
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    const [reais, cents = "0"] = cleaned.replace(/\./g, "").split(",");
    const value = Number(reais) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
    return isPositiveCentavos(value) ? value : null;
  }
  if (/^\d+([.,]\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(",", "."));
    const value = Math.round(n * 100);
    return isPositiveCentavos(value) ? value : null;
  }
  return null;
}

