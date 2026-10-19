// Filtros e hubs de destino a partir das tags editoriais dos roteiros.
// País, estado ou estilo só entram se a tag do guia já diz isso. Nada de
// faixa de preço, adequação ou categoria inferida.

import { GUIDE_LIST } from "./aondeContent.js";
import { semAcento } from "./texto.js";
import { partesDaTag } from "./guideLinks.js";

export function slugDe(texto) {
  return semAcento(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function grupo(mapa, nome, guia) {
  const slug = slugDe(nome);
  if (!slug) return;
  const item = mapa.get(slug) || { slug, nome, guias: [] };
  item.guias.push(guia);
  mapa.set(slug, item);
}

/**
 * @param {Array} [lista]
 * @returns {{ guias: Array, regioes: Array, estilos: Array, hubs: Array }}
 * hubs só existem com pelo menos 3 roteiros — página com um ou dois cards
 * não acrescenta o que o índice já mostra.
 */
export function catalogoDescoberta(lista = GUIDE_LIST) {
  const guias = (Array.isArray(lista) ? lista : []).filter((g) => g && g.id);
  const regioes = new Map();
  const estilos = new Map();
  for (const g of guias) {
    const { categoria, regiao } = partesDaTag(g.tag);
    if (regiao) grupo(regioes, regiao, g);
    if (categoria) grupo(estilos, categoria, g);
  }
  const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt");
  const regs = [...regioes.values()].sort(porNome);
  return {
    guias,
    regioes: regs,
    estilos: [...estilos.values()].sort(porNome),
    hubs: regs.filter((r) => r.guias.length >= 3),
  };
}

export function filtrarGuias(lista, { regiao = "", estilo = "" } = {}) {
  const catalogo = catalogoDescoberta(lista);
  const regiaoSlug = slugDe(regiao);
  const estiloSlug = slugDe(estilo);
  const regiaoConhecida = !regiaoSlug || catalogo.regioes.some((r) => r.slug === regiaoSlug);
  const estiloConhecido = !estiloSlug || catalogo.estilos.some((e) => e.slug === estiloSlug);
  const regiaoAtiva = regiaoConhecida ? regiaoSlug : "";
  const estiloAtivo = estiloConhecido ? estiloSlug : "";
  const guias = catalogo.guias.filter((g) => {
    const partes = partesDaTag(g.tag);
    if (regiaoAtiva && slugDe(partes.regiao) !== regiaoAtiva) return false;
    if (estiloAtivo && slugDe(partes.categoria) !== estiloAtivo) return false;
    return true;
  });
  return {
    ...catalogo,
    guias,
    regiaoSlug: regiaoAtiva,
    estiloSlug: estiloAtivo,
    regiaoConhecida,
    estiloConhecido,
    regiaoPedida: regiaoSlug,
    estiloPedido: estiloSlug,
  };
}

export function hubPorSlug(slug, lista = GUIDE_LIST) {
  const alvo = slugDe(slug);
  if (!alvo) return null;
  return catalogoDescoberta(lista).hubs.find((h) => h.slug === alvo) || null;
}
