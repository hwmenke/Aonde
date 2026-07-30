// ---------------------------------------------------------------------------
// UTILITARIOS DE TEXTO — escape de HTML e formatacao de moeda.
//
// Vivem AQUI, e nao no htmlRenderer.js, para quebrar um ciclo de importacao:
// sparkline.js precisa dos dois, e o htmlRenderer.js precisa do sparkline.js
// para desenhar o grafico na pagina de oferta. Enquanto os dois estavam no
// htmlRenderer.js, o ciclo funcionava por sorte — as duas eram declaracoes de
// funcao (hoisted). Bastava alguem trocar uma por `const x = () => {}` para o
// site quebrar no carregamento do modulo, com um erro difícil de ligar a causa.
//
// O htmlRenderer.js reexporta as duas, entao quem ja importava de la continua
// funcionando.
// ---------------------------------------------------------------------------

/** Escapa os cinco caracteres perigosos em HTML. Nao-string => "". */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formata centavos como Real (pt-BR), sem centavos quando redondo
 * (184700 => "R$ 1.847"), com duas casas quando ha (184750 => "R$ 1.847,50").
 * Entrada invalida => "".
 */
export function formatBRL(centavos) {
  if (typeof centavos !== "number" || Number.isNaN(centavos)) return "";
  const reais = centavos / 100;
  const isRedondo = centavos % 100 === 0;
  const casas = isRedondo ? 0 : 2;
  try {
    const nf = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
    return nf.format(reais).replace(/\u00a0/g, " ");
  } catch {
    const inteiro = Math.trunc(Math.abs(reais));
    const milhar = String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const sinal = reais < 0 ? "-" : "";
    if (isRedondo) return `${sinal}R$ ${milhar}`;
    const cent = String(Math.round(Math.abs(centavos) % 100)).padStart(2, "0");
    return `${sinal}R$ ${milhar},${cent}`;
  }
}

/**
 * Texto sem acento e sem caixa, para comparar/buscar: quem digita
 * "florianopolis" precisa achar "Florianópolis".
 */
export function semAcento(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
