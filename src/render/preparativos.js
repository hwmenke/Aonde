// ---------------------------------------------------------------------------
// PREPARATIVOS DE VIAGEM — documento, moeda, tomada, saude e seguro.
//
// Por que existe: duas rodadas de avaliacao com pessoas simuladas apontaram a
// MESMA lacuna, de forma independente. Quem viaja para fora pela primeira vez
// nao acha no site o que precisa levar. Um dos casos era um rapaz de 24 anos
// indo a Buenos Aires sem saber se o RG servia.
//
// REGRA DE HONESTIDADE, mais rigorosa aqui do que no resto do site:
// errar nesta pagina faz alguem ser barrado no embarque. Entao:
//   1) cada bloco carrega `conferidoEm` — a data em que a informacao foi
//      escrita — e o site MOSTRA essa data. Regra de fronteira muda;
//   2) todo bloco aponta a FONTE OFICIAL, que e quem manda de verdade;
//   3) onde ha duvida razoavel, o texto diz que ha duvida em vez de arredondar
//      para o lado conveniente;
//   4) nada aqui e "garantia": o texto usa "costuma", "em geral", "confirme".
//
// O que NAO entra: exigencia de visto para destino que o site nao cobre,
// regra de bagagem de companhia (muda por tarifa) e valor de cambio.
// ---------------------------------------------------------------------------

/** Data em que este conteudo foi escrito/conferido. Aparece na pagina. */
export const CONFERIDO_EM = "2026-08-01";

export const FONTES = {
  documento: {
    nome: "Polícia Federal — documentos de viagem",
    url: "https://www.gov.br/pf/pt-br/assuntos/passaporte",
  },
  saude: {
    nome: "Anvisa — Certificado Internacional de Vacinação",
    url: "https://www.gov.br/anvisa/pt-br/assuntos/viajante",
  },
  consular: {
    nome: "Portal Consular — Itamaraty",
    url: "https://www.gov.br/mre/pt-br/assuntos/portal-consular",
  },
};

/**
 * Informacao por PAIS. Chave = pais como aparece na tag do roteiro.
 *
 * `documento` fala do que um cidadao BRASILEIRO precisa. Nao serve para
 * estrangeiro residente no Brasil — e o texto diz isso.
 */
export const PAISES = {
  Argentina: {
    pais: "Argentina",
    documento:
      "Brasileiro entra com RG (carteira de identidade) em bom estado e emitido há menos de 10 anos — é acordo do Mercosul. Passaporte também vale. CNH não serve.",
    documentoAtencao:
      "RG rasgado, plastificado por conta própria ou com foto antiga costuma ser recusado no embarque. Na dúvida, leve o passaporte.",
    moeda: "Peso argentino (ARS)",
    moedaNota:
      "O câmbio na Argentina tem histórico de variar muito e de ter mais de uma cotação em circulação. Pesquise como está no mês da sua viagem — é o destino desta lista onde isso mais muda.",
    tomada: "Tipo I (dois pinos chatos em V) e tipo C. O plugue brasileiro (tipo N) não encaixa: leve adaptador.",
    voltagem: "220V",
    vacina: "Nenhuma exigida para entrar.",
    seguro:
      "Não é obrigatório, mas atendimento médico particular sai caro para estrangeiro. Vale contratar.",
  },
  Uruguai: {
    pais: "Uruguai",
    documento:
      "Brasileiro entra com RG em bom estado e emitido há menos de 10 anos (Mercosul). Passaporte também vale. CNH não serve.",
    moeda: "Peso uruguaio (UYU)",
    moedaNota:
      "Muitos lugares em Montevidéu e em Colonia aceitam dólar e cartão. Devolução de IVA para turista existe em hotel e em compras — pergunte no caixa.",
    tomada: "Tipos C, F, I e L, dependendo do prédio. Adaptador universal resolve.",
    voltagem: "220V",
    vacina: "Nenhuma exigida para entrar.",
    seguro: "Não é obrigatório. Recomendado pelo custo de atendimento particular.",
  },
  Chile: {
    pais: "Chile",
    documento:
      "Brasileiro entra com RG em bom estado e emitido há menos de 10 anos (acordo com o Mercosul). Passaporte também vale.",
    documentoAtencao:
      "O Chile é rigoroso com a entrada de alimentos: frutas, carnes, laticínios e sementes precisam ser declarados, e o não-declarado dá multa. Isso vale até para a fruta que sobrou do lanche do avião.",
    moeda: "Peso chileno (CLP)",
    moedaNota: "Os valores têm muitos zeros — confira a vírgula antes de pagar.",
    tomada: "Tipos C e L. O plugue brasileiro tipo N não encaixa em todas: leve adaptador.",
    voltagem: "220V",
    vacina: "Nenhuma exigida para entrar.",
    seguro: "Não é obrigatório. No Atacama, confira se a apólice cobre altitude e passeio em deserto.",
  },
  Peru: {
    pais: "Peru",
    documento:
      "Brasileiro entra com RG em bom estado e emitido há menos de 10 anos (Mercosul, país associado). Passaporte também vale.",
    moeda: "Sol peruano (PEN)",
    moedaNota: "Fora de Cusco e Lima, dinheiro em espécie resolve mais que cartão.",
    tomada: "Tipos A e C. Voltagem 220V, mas com tomadas que aceitam plugue americano — leve adaptador.",
    voltagem: "220V",
    vacina:
      "Não é exigida para entrar. A vacina de febre amarela é recomendada para quem vai à Amazônia peruana — não é o caso de quem fica em Cusco e Machu Picchu.",
    saudeAtencao:
      "Cusco fica a cerca de 3.400 m de altitude, mais alto que Machu Picchu. Mal de altitude é comum e não depende de preparo físico: reserve o primeiro dia para descansar, beba água e evite álcool na chegada. Quem tem problema cardíaco ou respiratório deve falar com o médico antes.",
    seguro: "Não é obrigatório. Vale conferir se cobre altitude — várias apólices excluem acima de 3.000 m.",
  },
};

/**
 * Informacao por DESTINO, quando o destino tem alguma coisa que o pais inteiro
 * nao tem. Chave = id do roteiro.
 */
export const DESTINOS = {
  manaus: {
    vacina:
      "A vacina de febre amarela é recomendada para quem viaja à Amazônia, e o ideal é tomar pelo menos 10 dias antes de viajar. Alguns países pedem o Certificado Internacional de Vacinação de quem esteve na região — se a sua próxima viagem for para fora, isso importa.",
    saudeAtencao: "Repelente é item de mala, não de farmácia de última hora.",
  },
  cusco: {
    saudeAtencao:
      "Cusco fica a cerca de 3.400 m. O mal de altitude atinge gente de qualquer idade e preparo — o roteiro já reserva o primeiro dia para aclimatação.",
  },
  atacama: {
    saudeAtencao:
      "San Pedro de Atacama fica a 2.400 m e vários passeios passam de 4.000 m (Geiseres del Tatio). Suba devagar, e trate a altitude como parte do planejamento, não como imprevisto.",
  },
  noronha: {
    taxa:
      "Fernando de Noronha cobra duas coisas à parte da passagem: a Taxa de Preservação Ambiental (por dia de permanência) e o ingresso do Parque Nacional Marinho. Nenhuma das duas está no preço do voo.",
  },
};

/**
 * Junta pais + destino num bloco unico, ou devolve null quando nao ha nada a
 * dizer (destino nacional sem particularidade). Devolver null e de proposito:
 * bloco vazio de "preparativos" e ruido, e ensina a pessoa a ignorar a secao
 * justamente onde ela as vezes importa.
 */
export function preparativosDoGuia(guia) {
  if (!guia) return null;
  const tag = String(guia.tag || "");
  const nomePais = Object.keys(PAISES).find((p) => tag.includes(p)) || null;
  const doPais = nomePais ? PAISES[nomePais] : null;
  const doDestino = DESTINOS[guia.id] || null;
  if (!doPais && !doDestino) return null;
  return {
    internacional: !!doPais,
    pais: doPais ? doPais.pais : "Brasil",
    ...(doPais || {}),
    ...(doDestino || {}),
    conferidoEm: CONFERIDO_EM,
  };
}
