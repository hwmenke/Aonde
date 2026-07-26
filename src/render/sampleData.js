// sampleData — FIXTURES realistas (dados fixos, sem rede) usadas por
// scripts/render-samples.js para gerar as paginas de amostra em samples/.
//
// Os shapes reproduzem exatamente a saida de producao:
//   - `sampleItinerary`  no formato de buildItinerary (ja enriquecido com
//     hero + foto por ponto, como o pipeline de imagens produz).
//   - `sampleOffers`     no formato de toOffer + enrichOfferWithImage.
//
// URLS DE IMAGEM: usamos o form canonico e ESTAVEL do Wikimedia Commons
//   https://commons.wikimedia.org/wiki/Special:FilePath/<Arquivo>
// que redireciona para o arquivo original de qualquer imagem existente (nao
// depende do hash interno de armazenamento). Se por acaso alguma falhar
// (offline/arquivo movido), o `onerror` do htmlRenderer troca por um
// placeholder SVG embutido — a pagina renderiza sempre. Uma oferta e deixada
// DE PROPOSITO sem `thumb_url` para exercitar o placeholder.

const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const img = (file) => COMMONS + encodeURIComponent(file);

// ---------------------------------------------------------------------------
// Roteiro de Recife (3 dias) — shape de buildItinerary + imagens
// ---------------------------------------------------------------------------

export const sampleItinerary = {
  ok: true,
  destination: "Recife",
  hero: {
    url: img("Recife (Pernambuco).jpg"),
    attribution: { text: "Recife — Wikimedia Commons", uri: "https://commons.wikimedia.org/wiki/Category:Recife" },
  },
  days: [
    {
      n: 1,
      titulo: "Dia 1 — Recife Antigo e arredores",
      pontos: [
        {
          nome: "Marco Zero",
          nota: 4.7,
          endereco: "Praça Rio Branco, Recife Antigo, Recife - PE",
          rating: 4.7,
          ratingCount: 41230,
          resumo:
            "Praça histórica no coração do Recife Antigo, ponto de partida das ruas antigas e vista para as esculturas de Brennand no Parque das Esculturas.",
          mapsUri: "https://www.google.com/maps/search/?api=1&query=Marco+Zero+Recife",
          foto: {
            url: img("Marco Zero - Recife.jpg"),
            attribution: { text: "Marco Zero, Recife — Commons", uri: "https://commons.wikimedia.org/wiki/Category:Marco_Zero_(Recife)" },
            width: 1600,
            height: 1000,
          },
        },
        {
          nome: "Rua do Bom Jesus",
          nota: 4.6,
          endereco: "Rua do Bom Jesus, Recife Antigo, Recife - PE",
          rating: 4.6,
          ratingCount: 18740,
          resumo:
            "Uma das ruas mais bonitas do país, com casarões coloridos, a primeira sinagoga das Américas e bares que enchem à noite.",
          mapsUri: "https://www.google.com/maps/search/?api=1&query=Rua+do+Bom+Jesus+Recife",
          foto: {
            url: img("Rua do Bom Jesus, Recife.jpg"),
            attribution: { text: "Rua do Bom Jesus — Commons", uri: "https://commons.wikimedia.org/wiki/Category:Rua_do_Bom_Jesus" },
            width: 1500,
            height: 1000,
          },
        },
      ],
      restaurante: {
        nome: "Bar Central",
        rating: 4.5,
        endereco: "R. Mamede Simões, 144 - São José, Recife - PE",
      },
    },
    {
      n: 2,
      titulo: "Dia 2 — Boa Viagem e a orla",
      pontos: [
        {
          nome: "Praia de Boa Viagem",
          nota: 4.5,
          endereco: "Av. Boa Viagem, Recife - PE",
          rating: 4.5,
          ratingCount: 52310,
          resumo:
            "Cartão-postal urbano do Recife: quiosques, calçadão e piscinas naturais na maré baixa protegidas pelos arrecifes.",
          mapsUri: "https://www.google.com/maps/search/?api=1&query=Praia+de+Boa+Viagem+Recife",
          foto: {
            url: img("Praia de Boa Viagem, Recife.jpg"),
            attribution: { text: "Praia de Boa Viagem — Commons", uri: "https://commons.wikimedia.org/wiki/Category:Boa_Viagem_Beach" },
            width: 1600,
            height: 1000,
          },
        },
        {
          nome: "Instituto Ricardo Brennand",
          nota: 4.8,
          endereco: "Alameda Antônio Brennand, s/n - Várzea, Recife - PE",
          rating: 4.8,
          ratingCount: 33980,
          resumo:
            "Castelo e museu com um acervo impressionante de armas brancas, armaduras e pinturas, cercado por jardins e lago.",
          mapsUri: "https://www.google.com/maps/search/?api=1&query=Instituto+Ricardo+Brennand",
          foto: {
            url: img("Instituto Ricardo Brennand 01.jpg"),
            attribution: { text: "Instituto Ricardo Brennand — Commons", uri: "https://commons.wikimedia.org/wiki/Category:Instituto_Ricardo_Brennand" },
            width: 1600,
            height: 1067,
          },
        },
      ],
      restaurante: {
        nome: "Camarada Camarão",
        rating: 4.4,
        endereco: "Av. Boa Viagem, 21 - Pina, Recife - PE",
      },
    },
    {
      n: 3,
      titulo: "Dia 3 — Olinda e o pôr do sol",
      pontos: [
        {
          nome: "Alto da Sé (Olinda)",
          nota: 4.7,
          endereco: "Alto da Sé, Olinda - PE",
          rating: 4.7,
          ratingCount: 28650,
          resumo:
            "Ponto mais alto da Olinda histórica, com vista panorâmica do casario colonial e do skyline do Recife ao fundo.",
          mapsUri: "https://www.google.com/maps/search/?api=1&query=Alto+da+Sé+Olinda",
          foto: {
            url: img("Olinda, Pernambuco, Brazil.jpg"),
            attribution: { text: "Olinda — Commons", uri: "https://commons.wikimedia.org/wiki/Category:Olinda" },
            width: 1600,
            height: 1000,
          },
        },
        {
          // Ponto sem `foto` de proposito: exercita o placeholder SVG inline.
          nome: "Mercado Eufrásio Barbosa",
          nota: 4.3,
          endereco: "Av. Sigismundo Gonçalves - Varadouro, Olinda - PE",
          rating: 4.3,
          ratingCount: 6120,
          resumo:
            "Antigo mercado restaurado com artesanato pernambucano, bom para comprar lembranças antes de voltar.",
          mapsUri: "https://www.google.com/maps/search/?api=1&query=Mercado+Eufrásio+Barbosa+Olinda",
          foto: null,
        },
      ],
      restaurante: {
        nome: "Oficina do Sabor",
        rating: 4.6,
        endereco: "R. do Amparo, 335 - Amparo, Olinda - PE",
      },
    },
  ],
  attribution: "Dados de lugares: Google",
  error: null,
};

// ---------------------------------------------------------------------------
// Feed de ofertas — shape de toOffer + enrichOfferWithImage
// ---------------------------------------------------------------------------

export const sampleOffers = [
  {
    id: "gru-rec",
    origem: "GRU",
    destino: "REC",
    cidade: "Recife",
    tipo: "Nacional",
    cia: "GOL",
    preco_centavos: 47900,
    media_centavos: 92000,
    desconto_pct: 48,
    economia_centavos: 44100,
    is_erro_tarifa: false,
    datas_sugeridas: "12–24 out",
    affiliate_url: "https://tp.media/r?marker=demo&p=gru-rec",
    thumb_url: img("Praia de Boa Viagem, Recife.jpg"),
    thumb_attribution: {
      author: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/Category:Boa_Viagem_Beach",
    },
    status: "publicada",
  },
  {
    id: "gru-mcz",
    origem: "GRU",
    destino: "MCZ",
    cidade: "Maceió",
    tipo: "Nacional",
    cia: "Azul",
    preco_centavos: 39900,
    media_centavos: 78000,
    desconto_pct: 49,
    economia_centavos: 38100,
    is_erro_tarifa: false,
    datas_sugeridas: "05–13 nov",
    affiliate_url: "https://tp.media/r?marker=demo&p=gru-mcz",
    thumb_url: img("Praia de Pajuçara, Maceió.jpg"),
    thumb_attribution: {
      author: "Wikimedia Commons",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/Category:Macei%C3%B3",
    },
    status: "publicada",
  },
  {
    // ERRO DE TARIFA — badge de alerta.
    id: "gru-lis",
    origem: "GRU",
    destino: "LIS",
    cidade: "Lisboa",
    tipo: "Internacional",
    cia: "TAP",
    preco_centavos: 119900,
    media_centavos: 384000,
    desconto_pct: 69,
    economia_centavos: 264100,
    is_erro_tarifa: true,
    datas_sugeridas: "28 set–10 out",
    affiliate_url: "https://tp.media/r?marker=demo&p=gru-lis",
    thumb_url: img("Lisbon (Portugal), Tram 28.jpg"),
    thumb_attribution: {
      author: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/Category:Lisbon",
    },
    status: "publicada",
  },
  {
    id: "rec-fen",
    origem: "REC",
    destino: "FEN",
    cidade: "Fernando de Noronha",
    tipo: "Nacional",
    cia: "Azul",
    preco_centavos: 89000,
    media_centavos: 148000,
    desconto_pct: 40,
    economia_centavos: 59000,
    is_erro_tarifa: false,
    datas_sugeridas: "03–08 dez",
    affiliate_url: "https://tp.media/r?marker=demo&p=rec-fen",
    thumb_url: img("Baía do Sancho, Fernando de Noronha.jpg"),
    thumb_attribution: {
      author: "Wikimedia Commons",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/Category:Fernando_de_Noronha",
    },
    status: "publicada",
  },
  {
    // SEM thumb_url — exercita o placeholder SVG elegante no card.
    id: "cgh-ssa",
    origem: "CGH",
    destino: "SSA",
    cidade: "Salvador",
    tipo: "Nacional",
    cia: "LATAM",
    preco_centavos: 51900,
    media_centavos: 84000,
    desconto_pct: 38,
    economia_centavos: 32100,
    is_erro_tarifa: false,
    datas_sugeridas: "18–25 jan",
    affiliate_url: "https://tp.media/r?marker=demo&p=cgh-ssa",
    thumb_url: null,
    thumb_attribution: null,
    status: "publicada",
  },
  {
    id: "gru-scl",
    origem: "GRU",
    destino: "SCL",
    cidade: "Santiago",
    tipo: "Internacional",
    cia: "LATAM",
    preco_centavos: 138000,
    media_centavos: 205000,
    desconto_pct: 33,
    economia_centavos: 67000,
    is_erro_tarifa: false,
    datas_sugeridas: "14–22 ago",
    affiliate_url: "https://tp.media/r?marker=demo&p=gru-scl",
    thumb_url: img("Santiago de Chile - Skyline.jpg"),
    thumb_attribution: {
      author: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/Category:Santiago_de_Chile",
    },
    status: "publicada",
  },
];
