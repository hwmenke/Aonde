// Filtros da página de resultados saem dos voos que a página realmente mostra.
// Uma lista fixa (Azul/GOL/LATAM, noite desmarcada) escondia companhia ou
// horário que a busca tinha acabado de devolver.

const FAIXAS = [
  { id: "0-6", label: "Madrugada (0h – 6h)" },
  { id: "6-12", label: "Manhã (6h – 12h)" },
  { id: "12-18", label: "Tarde (12h – 18h)" },
  { id: "18-24", label: "Noite (18h – 24h)" },
];

function horaDe(saida) {
  const m = /^(\d{1,2})/.exec(String(saida || ""));
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

function paradasDe(voo) {
  if (voo && voo.direto) return 0;
  const m = /(\d+)/.exec(String((voo && voo.paradas) || ""));
  if (!m) return 0;
  return Number(m[1]);
}

function faixaDe(hora) {
  if (hora < 6) return "0-6";
  if (hora < 12) return "6-12";
  if (hora < 18) return "12-18";
  return "18-24";
}

/**
 * Grupos de filtro para os voos renderizados. Nenhuma opção começa marcada:
 * o script da página trata grupo sem marca como "não restringe", então todo
 * voo devolvido aparece. As quatro faixas cobrem o dia inteiro (0h–24h).
 * @param {Array} voos
 */
export function filtrosDosVoos(voos) {
  const lista = Array.isArray(voos) ? voos.filter(Boolean) : [];
  if (!lista.length) return [];

  const paradas = new Map();
  const cias = new Map();
  const faixas = new Map(FAIXAS.map((f) => [f.id, 0]));

  for (const voo of lista) {
    const p = paradasDe(voo);
    const chave = p >= 2 ? "2+" : String(p);
    paradas.set(chave, (paradas.get(chave) || 0) + 1);
    const cia = String(voo.cia || "").trim();
    if (cia) cias.set(cia, (cias.get(cia) || 0) + 1);
    const hora = horaDe(voo.saida);
    if (hora !== null) faixas.set(faixaDe(hora), faixas.get(faixaDe(hora)) + 1);
  }

  const opcoesParadas = [];
  if (paradas.has("0")) opcoesParadas.push({ label: "Voo direto", valor: "0", n: paradas.get("0") });
  if (paradas.has("1")) opcoesParadas.push({ label: "1 parada", valor: "1", n: paradas.get("1") });
  if (paradas.has("2+")) opcoesParadas.push({ label: "2+ paradas", valor: "2+", n: paradas.get("2+") });

  const opcoesCia = [...cias.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt"))
    .map(([label, n]) => ({ label, valor: label, n }));

  const opcoesHora = FAIXAS.map((f) => ({ label: f.label, valor: f.id, n: faixas.get(f.id) }));

  return [
    { titulo: "Paradas", tipo: "paradas", opcoes: opcoesParadas },
    { titulo: "Companhias", tipo: "cia", opcoes: opcoesCia },
    { titulo: "Horário de partida", tipo: "horario", opcoes: opcoesHora },
  ].filter((g) => g.opcoes.length);
}
