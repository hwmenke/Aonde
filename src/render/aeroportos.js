// Nome de cidade para codigo IATA.
//
// Existe porque a auditoria de usuarios pegou uma barreira obvia: um senhor de
// 68 anos leu "SAINDO DE GRU" e nao entendeu — "eu nao sei de cor essas siglas".
// Quem viaja a trabalho decora; a maior parte das pessoas nao. Em toda tela onde
// aparece um codigo sozinho, mostramos o nome da cidade junto.
//
// Cobre os aeroportos que o site realmente usa (origens das ofertas editoriais e
// destinos dos roteiros/ofertas). `cidadeDoIata` devolve string vazia para
// codigo desconhecido, e quem chama degrada para o codigo puro — nunca inventa
// nome de cidade.

export const AEROPORTOS = {
  // Brasil — origens
  GRU: "São Paulo",
  CGH: "São Paulo",
  VCP: "Campinas",
  GIG: "Rio de Janeiro",
  SDU: "Rio de Janeiro",
  CNF: "Belo Horizonte",
  BSB: "Brasília",
  POA: "Porto Alegre",
  CWB: "Curitiba",
  // Brasil — destinos
  SSA: "Salvador",
  REC: "Recife",
  FOR: "Fortaleza",
  MCZ: "Maceió",
  NAT: "Natal",
  FEN: "Fernando de Noronha",
  FLN: "Florianópolis",
  IGU: "Foz do Iguaçu",
  MAO: "Manaus",
  SLZ: "São Luís",
  BPS: "Porto Seguro",
  IOS: "Ilhéus",
  JJD: "Jericoacoara",
  CGR: "Campo Grande",
  BYO: "Bonito",
  // America do Sul
  EZE: "Buenos Aires",
  AEP: "Buenos Aires",
  BUE: "Buenos Aires",
  SCL: "Santiago",
  MVD: "Montevidéu",
  CUZ: "Cusco",
  LIM: "Lima",
  CJC: "Calama",
  BRC: "Bariloche",
  // Fora da America do Sul
  LIS: "Lisboa",
  OPO: "Porto",
  MAD: "Madri",
  MIA: "Miami",
  MCO: "Orlando",
  JFK: "Nova York",
  CDG: "Paris",
};

/** Nome da cidade do codigo IATA, ou "" quando nao conhecemos o codigo. */
export function cidadeDoIata(iata) {
  if (!iata) return "";
  return AEROPORTOS[String(iata).trim().toUpperCase()] || "";
}

/**
 * Rotulo "CODIGO · Cidade" para exibir um aeroporto sem exigir que a pessoa
 * decore siglas. Sem cidade conhecida, devolve so o codigo.
 */
export function rotuloAeroporto(iata) {
  const code = String(iata || "").trim().toUpperCase();
  if (!code) return "";
  const cidade = cidadeDoIata(code);
  return cidade ? `${code} · ${cidade}` : code;
}
