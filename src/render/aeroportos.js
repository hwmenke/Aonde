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

// Nome curto do aeroporto só onde a cidade sozinha não distingue um código
// de outro (GRU/CGH, GIG/SDU, EZE/AEP). Não é avaliação nem nome comercial.
export const AEROPORTO_LOCAL = {
  GRU: "Guarulhos",
  CGH: "Congonhas",
  VCP: "Viracopos",
  GIG: "Galeão",
  SDU: "Santos Dumont",
  EZE: "Ezeiza",
  AEP: "Aeroparque",
};

function semAc(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "São Paulo · Guarulhos (GRU)" — cidade, aeroporto quando há ambiguidade, e IATA. */
export function rotuloCompletoAeroporto(iata) {
  const code = String(iata || "").trim().toUpperCase();
  const cidade = AEROPORTOS[code];
  if (!cidade) return code;
  const local = AEROPORTO_LOCAL[code];
  return local ? `${cidade} · ${local} (${code})` : `${cidade} (${code})`;
}

// BUE é código de cidade no registro, não um aeroporto. A busca não oferece
// "qualquer aeroporto de Buenos Aires": quem escolhe a cidade cai em EZE
// (primeiro declarado) e o seletor lista Ezeiza e Aeroparque à parte.
const FORA_DO_SELETOR = new Set(["BUE"]);

export function opcoesAeroporto() {
  return Object.keys(AEROPORTOS).filter((iata) => !FORA_DO_SELETOR.has(iata)).map((iata) => ({
    iata,
    cidade: AEROPORTOS[iata],
    local: AEROPORTO_LOCAL[iata] || "",
    rotulo: rotuloCompletoAeroporto(iata),
  }));
}

/** Sugestões do registro, sem acento. Consulta vazia devolve a lista inteira. */
export function sugerirAeroportos(consulta) {
  const q = semAc(consulta);
  const todas = opcoesAeroporto();
  if (!q) return todas;
  return todas.filter((o) => {
    const alvo = semAc(`${o.cidade} ${o.local} ${o.iata}`);
    return alvo.includes(q);
  });
}

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

/**
 * Resolve o que a pessoa digitou num codigo IATA conhecido.
 *
 * Aceita o codigo ("GRU", "gru"), o nome da cidade ("Porto Alegre",
 * "sao paulo", "Florianopolis" sem acento) ou o nome dentro de uma frase
 * ("Voos para Recife").
 *
 * Devolve null quando NAO reconhece. Isso e de proposito: antes, o servidor
 * varria a string atras de qualquer palavra de 3 letras e caia no padrao GRU
 * quando nao achava. Resultado medido: quem digitava "Porto Alegre -> Sao
 * Paulo" recebia voos GRU->SAO (origem trocada em silencio), e "xyz" era
 * aceito como aeroporto. Devolver null deixa quem chama AVISAR em vez de
 * adivinhar.
 */
export function resolveAeroporto(entrada) {
  const bruto = String(entrada || "").trim();
  if (!bruto) return null;

  // 1) IATA entre parênteses, como nas sugestões ("Congonhas (CGH)").
  //    Tem de vir antes do nome da cidade: "São Paulo · Congonhas (CGH)"
  //    contém "São Paulo", que sozinho cairia em GRU.
  const entreParenteses = /\(([A-Za-z]{3})\)/.exec(bruto);
  if (entreParenteses && AEROPORTOS[entreParenteses[1].toUpperCase()]) {
    return entreParenteses[1].toUpperCase();
  }

  // 2) codigo IATA exato e conhecido
  const talvezCodigo = bruto.toUpperCase().replace(/[^A-Z]/g, "");
  if (talvezCodigo.length === 3 && AEROPORTOS[talvezCodigo]) return talvezCodigo;

  const alvo = semAc(bruto);

  // 3) nome curto do aeroporto ("Congonhas", "Galeão"), antes da cidade.
  for (const [iata, local] of Object.entries(AEROPORTO_LOCAL)) {
    if (semAc(local) === alvo) return iata;
  }

  // 4) nome de cidade exato (sem acento, sem caixa). Uma cidade pode ter mais
  //    de um aeroporto (GRU/CGH, GIG/SDU): fica o primeiro declarado, que e o
  //    de maior movimento internacional. A lista de sugestões mostra os dois.
  for (const [iata, cidade] of Object.entries(AEROPORTOS)) {
    if (semAc(cidade) === alvo) return iata;
  }

  // Nome curto dentro do texto ("São Paulo · Congonhas") escolhe esse aeroporto
  // quando só um local aparece. Não junta a cidade inteira num código só.
  const locais = Object.entries(AEROPORTO_LOCAL).filter(([, local]) => {
    const nome = semAc(local);
    return nome.length >= 4 && alvo.includes(nome);
  });
  if (locais.length === 1) return locais[0][0];

  // 5) nome de cidade dentro de uma frase ("passagem para Belo Horizonte").
  //    Vai do nome mais longo para o mais curto, senao "Rio de Janeiro" seria
  //    capturado por um "Rio" de outra cidade.
  const porTamanho = Object.entries(AEROPORTOS).sort(
    (a, b) => semAc(b[1]).length - semAc(a[1]).length
  );
  for (const [iata, cidade] of porTamanho) {
    const nome = semAc(cidade);
    if (nome.length >= 4 && alvo.includes(nome)) return iata;
  }

  return null;
}
