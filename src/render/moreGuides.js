// moreGuides — 12 roteiros editoriais escritos por agentes de turismo
// (Sonnet), um por regiao. Mesmo shape de GUIDES (aondeContent.js). Cada guia
// carrega tambem `coords` {lat,lng} para o pin no mapa. Conteudo revisado na
// integracao; nomes de pontos/restaurantes conferidos pelos agentes via busca.
export const EXTRA_GUIDES = {
  "maceio": {
    "id": "maceio",
    "breadcrumb": "Maceió",
    "tag": "Praia · Alagoas",
    "titulo": "Maceió e Maragogi em 5 dias",
    "resumo": "Da orla de Pajuçara às piscinas naturais de Galés, passando pelo camarão jangadeiro do Janga e o chiclete de camarão da Barra Grande.",
    "intro": "Maceió tem uma das orlas urbanas mais bonitas do Brasil e ainda fica a menos de duas horas das piscinas naturais mais famosas do Nordeste, em Maragogi. Este roteiro divide os cinco dias entre a cidade, os passeios de jangada em frente à Pajuçara, um bate-volta para o sul até a Praia do Francês e um dia inteiro dedicado à Rota Ecológica rumo a Maragogi, sempre fechando com um bom prato de frutos do mar.",
    "heroFoto": "mar em tons de verde-esmeralda visto de uma jangada em frente à Pajuçara",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Macei%C3%B3%2C%20estado%20Alagoas.jpg",
    "heroCredit": "Maceió — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Maceió",
    "preco": "R$ 780",
    "ctaVoos": "Buscar voos para Maceió",
    "ctaTitulo": "Maceió está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "set a mar (mar calmo, pouca chuva)"
      },
      {
        "k": "Voo de GRU",
        "v": "2h40 direto"
      },
      {
        "k": "Base do roteiro",
        "v": "Ponta Verde ou Jatiúca"
      },
      {
        "k": "Estilo",
        "v": "praia urbana + piscinas naturais"
      }
    ],
    "hospedagem": {
      "texto": "Ponta Verde e Jatiúca são vizinhas e ficam entre as praias mais tranquilas da orla urbana — a de Jatiúca, inclusive, é onde o roteiro termina no dia 5. Para Maragogi e a Praia do Francês, que aparecem nos dias 2 e 3, o roteiro já depende de van ou carro de qualquer forma, então a base na cidade não muda a logística desses dois dias."
    },
    "opt": {
      "destName": "Maceió (MCZ)",
      "months": [
        1180,
        1240,
        980,
        890,
        780,
        870,
        1150,
        940,
        860,
        880,
        1020,
        1380
      ],
      "window": {
        "label": "4 – 11 mai 2026",
        "price": "R$ 780",
        "save": "37%",
        "note": "início da baixa temporada, mar ainda claro e sem chuva forte"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 780",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 840",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 825"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 858"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Pajuçara e Ponta Verde",
        "desc": "Chegada e primeiro contato com a orla mais famosa de Alagoas. À tarde, as jangadas ainda saem para as piscinas naturais em frente à praia, dependendo da maré.",
        "pontos": [
          {
            "nome": "Praia de Pajuçara",
            "nota": "jangadas levam até as piscinas naturais a 2 km da costa; confira a tábua de maré antes"
          },
          {
            "nome": "Praia de Ponta Verde",
            "nota": "orla mais tranquila, ótima para o pôr do sol e uma caminhada pela ciclovia"
          },
          {
            "nome": "Feira de artesanato de Pajuçara",
            "nota": "rendas, cerâmica e as clássicas redes alagoanas"
          }
        ],
        "restaurante": "Janga Praia",
        "restauranteNota": "camarão jangadeiro alagoano é o clássico da casa; fila costuma formar no jantar de sexta e sábado"
      },
      {
        "n": 2,
        "titulo": "Praia do Francês e Barra de São Miguel",
        "desc": "Bate-volta de cerca de 40 minutos para o sul, até a praia mais tradicional do surf alagoano.",
        "pontos": [
          {
            "nome": "Praia do Francês",
            "nota": "point histórico de surf, recife protege a água rasa perto da areia"
          },
          {
            "nome": "Piscinas naturais de Barra de São Miguel",
            "nota": "passeio de barco pela foz do rio até as piscinas de água morna"
          },
          {
            "nome": "Foz do Rio São Miguel",
            "nota": "encontro do rio com o mar, boa luz para foto no fim da tarde"
          }
        ],
        "restaurante": "Barraca de praia na orla do Francês",
        "restauranteNota": "peixe frito e caldinho de sururu servidos com os pés na areia"
      },
      {
        "n": 3,
        "titulo": "Rota Ecológica até Maragogi",
        "desc": "Dia inteiro dedicado ao passeio mais concorrido de Alagoas: saída cedo para pegar a maré baixa nas piscinas de Galés.",
        "pontos": [
          {
            "nome": "Piscinas naturais de Galés",
            "nota": "passeio de catamarã saindo da Barra Grande até os recifes mais afastados da costa"
          },
          {
            "nome": "Praia de Barra Grande",
            "nota": "base dos passeios, com quiosques e beach clubs à beira-mar"
          },
          {
            "nome": "Caminho de Moisés",
            "nota": "faixa de areia que surge na maré baixa entre dois pontos de recife"
          }
        ],
        "restaurante": "Burgalhau",
        "restauranteNota": "beach club conhecido pelo chiclete de camarão; ótimo ponto de apoio antes ou depois do barco"
      },
      {
        "n": 4,
        "titulo": "Lagoa Mundaú e cultura local",
        "desc": "Um dia mais tranquilo na cidade, entre a renda filé de Pontal da Barra e a lagoa que dá nome ao complexo Mundaú-Manguaba.",
        "pontos": [
          {
            "nome": "Pontal da Barra",
            "nota": "vilarejo de rendeiras às margens da Lagoa Mundaú; dá para comprar direto de quem produz"
          },
          {
            "nome": "Passeio de canoa pela Lagoa Mundaú",
            "nota": "água calma, boa opção para quem já cansou do mar aberto"
          },
          {
            "nome": "Theatro Deodoro",
            "nota": "centro histórico de Maceió, para quem quiser fugir da praia por algumas horas"
          }
        ],
        "restaurante": "Tapioca Maria Bonita",
        "restauranteNota": "casa especializada em tapioca em Jatiúca, do doce ao salgado com frutos do mar"
      },
      {
        "n": 5,
        "titulo": "Jatiúca e despedida",
        "desc": "Último dia no ritmo mais lento, aproveitando a orla gastronômica de Jatiúca antes do voo de volta.",
        "pontos": [
          {
            "nome": "Praia da Jatiúca",
            "nota": "calçadão com quiosques e boa estrutura para o último banho de mar"
          },
          {
            "nome": "Orla gastronômica de Jatiúca",
            "nota": "concentração de bons restaurantes a poucos passos da praia"
          }
        ],
        "restaurante": "Wanchako",
        "restauranteNota": "referência em ceviche peruano em Maceió desde 1996; ótimo para fechar a viagem"
      }
    ],
    "coords": {
      "lat": -9.6498,
      "lng": -35.7089
    }
  },
  "lencois": {
    "id": "lencois",
    "breadcrumb": "Lençóis Maranhenses",
    "tag": "Dunas e lagoas · Maranhão",
    "titulo": "Lençóis Maranhenses em 5 dias, de Barreirinhas a Atins",
    "resumo": "Rio Preguiças, Lagoa Azul, a travessia até Atins e as dunas mais altas do parque, sempre voltando para um peixe fresco à beira do rio.",
    "intro": "Não existe paisagem parecida em nenhum outro lugar do Brasil: dunas brancas que se estendem até o horizonte, cortadas por lagoas de água doce que enchem entre junho e setembro. Barreirinhas é a base de operações, mas o roteiro certo passa pelo Rio Preguiças, pela vila de pescadores de Atins e por pelo menos um dia de 4x4 rumo às lagoas mais distantes, onde a maioria dos turistas de bate-volta nunca chega.",
    "heroFoto": "dunas brancas com lagoa de água esverdeada refletindo o céu ao entardecer",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Lencois%20Maranhenses%208.jpg",
    "heroCredit": "Lençóis Maranhenses — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Parque_Nacional_dos_Lençóis_Maranhenses",
    "preco": "R$ 850",
    "ctaVoos": "Buscar voos para São Luís",
    "ctaTitulo": "Os Lençóis estão chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "jun a set (lagoas cheias, pouca chuva)"
      },
      {
        "k": "Acesso",
        "v": "GRU–São Luís + 4h de estrada"
      },
      {
        "k": "Base do roteiro",
        "v": "Barreirinhas, à beira do Rio Preguiças"
      },
      {
        "k": "Estilo",
        "v": "natureza + aventura leve"
      }
    ],
    "hospedagem": {
      "texto": "Barreirinhas, à beira do Rio Preguiças, é praticamente a única base com estrutura de pousada na região, e é de lá que saem os 4x4 do Circuito Grande e o barco do dia 1. Quem quiser dormir mais perto do clima de fim de mundo pode passar uma noite em Atins, como sugere o dia 3, mas sem trocar de base pelo resto da viagem."
    },
    "opt": {
      "destName": "São Luís (SLZ)",
      "months": [
        1050,
        1120,
        990,
        940,
        880,
        850,
        980,
        940,
        860,
        900,
        970,
        1240
      ],
      "window": {
        "label": "6 – 13 jun 2026",
        "price": "R$ 850",
        "save": "31%",
        "note": "início da estação seca, lagoas já cheias do período de chuva"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 850",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 910",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 895"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 930"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Chegada e Rio Preguiças",
        "desc": "Depois da estrada de São Luís, a tarde é para o passeio clássico de barco pelo Rio Preguiças, cartão de visita de Barreirinhas.",
        "pontos": [
          {
            "nome": "Passeio de barco pelo Rio Preguiças",
            "nota": "sobe o rio até o mar, passando por mangue, dunas e vilarejos ribeirinhos"
          },
          {
            "nome": "Vassouras",
            "nota": "pequena vila com dunas que chegam quase até as casas"
          },
          {
            "nome": "Farol do Mandacaru",
            "nota": "subida ao topo para uma vista de 360° do encontro do rio com o Atlântico"
          }
        ],
        "restaurante": "Bambu",
        "restauranteNota": "à beira do Rio Preguiças, considerado por muitos o melhor restaurante de Barreirinhas"
      },
      {
        "n": 2,
        "titulo": "Circuito Grande: Lagoa Azul e Lagoa Bonita",
        "desc": "O passeio mais tradicional dentro do parque, de veículo 4x4 até as duas lagoas mais visitadas.",
        "pontos": [
          {
            "nome": "Lagoa Azul",
            "nota": "água azul-turquesa cercada de dunas altas; melhor luz é no fim da manhã"
          },
          {
            "nome": "Lagoa Bonita",
            "nota": "pôr do sol mais famoso da região, com fila de turistas subindo a duna principal"
          }
        ],
        "restaurante": "A Canoa",
        "restauranteNota": "casa tradicional de Barreirinhas com porções generosas de peixe e camarão regional"
      },
      {
        "n": 3,
        "titulo": "Atins e a travessia até Caburé",
        "desc": "Dia de estrada de areia até a vila de pescadores mais autêntica da região, hoje também point de kitesurf.",
        "pontos": [
          {
            "nome": "Vila de Atins",
            "nota": "ruas de areia, pousadas simples e um clima de fim de mundo a 60 km de Barreirinhas"
          },
          {
            "nome": "Travessia de barco até Caburé",
            "nota": "faixa de terra entre o mar e o Rio Preguiças, com poucas construções"
          },
          {
            "nome": "Lagoa da Esperança",
            "nota": "menos concorrida que as do Circuito Grande, boa opção fora do horário de pico"
          }
        ],
        "restaurante": "Peixaria simples na vila de Atins",
        "restauranteNota": "peixe fresco grelhado do dia, direto dos barcos que chegam à tarde"
      },
      {
        "n": 4,
        "titulo": "Lençóis profundos: Santo Amaro e Lagoa da Cachoeira",
        "desc": "O dia mais longo do roteiro, reservado para quem quer ver as dunas mais altas do parque, bem mais adentro do que os passeios de bate-volta alcançam.",
        "pontos": [
          {
            "nome": "Lagoa da Cachoeira",
            "nota": "uma das lagoas mais bonitas e menos acessíveis dos Lençóis, perto de Santo Amaro"
          },
          {
            "nome": "Trilha entre as dunas ao amanhecer",
            "nota": "sair cedo evita o calor forte do meio-dia sobre a areia branca"
          }
        ],
        "restaurante": "Sertão",
        "restauranteNota": "peixada maranhense é o prato mais pedido; boa parada depois de um dia inteiro de 4x4"
      },
      {
        "n": 5,
        "titulo": "Orla de Barreirinhas e despedida",
        "desc": "Último dia mais leve, para descansar as pernas antes da estrada de volta a São Luís.",
        "pontos": [
          {
            "nome": "Orla do Rio Preguiças ao entardecer",
            "nota": "melhor horário para ver os barcos voltando e o céu colorido sobre o rio"
          },
          {
            "nome": "Mercado de artesanato de Barreirinhas",
            "nota": "redes, cerâmica e lembranças de última hora"
          }
        ],
        "restaurante": "Bambaê",
        "restauranteNota": "de frente para o Rio Preguiças, longe da agitação do centrinho; bom para uma última refeição sem pressa"
      }
    ],
    "coords": {
      "lat": -2.7451,
      "lng": -42.8253
    }
  },
  "trancoso": {
    "id": "trancoso",
    "breadcrumb": "Trancoso",
    "tag": "Vila charmosa · Bahia",
    "titulo": "Trancoso e Arraial d'Ajuda em 5 dias",
    "resumo": "Do Quadrado à Praia do Espelho, com a lagosta ao molho de abacaxi do Capim Santo e a moqueca da Silvinha no meio do gramado.",
    "intro": "Trancoso virou point badalado sem perder o clima de vila de pescadores: casas coloridas em volta de um gramado enorme, o Quadrado, com o mar logo ali embaixo. A vizinha Arraial d'Ajuda, separada pelo Rio Buranhém, tem a mesma praia bonita com preços um pouco mais camaradas. Este roteiro alterna entre as duas, com um dia inteiro reservado para a Praia do Espelho, considerada uma das mais bonitas do Brasil.",
    "heroFoto": "casas coloridas ao redor do gramado do Quadrado em Trancoso ao pôr do sol",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Quadrado%20de%20Trancoso%2C%20Bahia.jpg",
    "heroCredit": "Trancoso — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Trancoso_(Porto_Seguro)",
    "preco": "R$ 830",
    "ctaVoos": "Buscar voos para Porto Seguro",
    "ctaTitulo": "Trancoso está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "mai a jun (baixa temporada, clima ainda quente)"
      },
      {
        "k": "Voo de GRU",
        "v": "1h50 até Porto Seguro + 1h de estrada e balsa"
      },
      {
        "k": "Base do roteiro",
        "v": "Trancoso ou Arraial d'Ajuda"
      },
      {
        "k": "Estilo",
        "v": "praia + gastronomia"
      }
    ],
    "hospedagem": {
      "texto": "Trancoso deixa o Quadrado e a Praia dos Nativos a pé, inclusive para jantar no meio do gramado, como sugerem os dias 1 e 5. Arraial d'Ajuda costuma ter preços um pouco mais camaradas e mais opções de pousada, mas exige a travessia de balsa toda vez que o roteiro volta para o Quadrado."
    },
    "opt": {
      "destName": "Porto Seguro (BPS)",
      "months": [
        1450,
        1380,
        1050,
        950,
        830,
        860,
        1200,
        980,
        870,
        900,
        990,
        1520
      ],
      "window": {
        "label": "4 – 11 mai 2026",
        "price": "R$ 830",
        "save": "45%",
        "note": "baixa temporada, vila mais vazia e praias com mar calmo"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 830",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 890",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 875"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 905"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "O Quadrado de Trancoso",
        "desc": "Chegada e primeira caminhada pelo cartão-postal da vila: o gramado cercado de casas coloridas com o mar ao fundo.",
        "pontos": [
          {
            "nome": "Igreja de São João Batista",
            "nota": "no topo do Quadrado, ponto mais alto e melhor vista do pôr do sol"
          },
          {
            "nome": "Quadrado",
            "nota": "gramado com casas coloridas viradas para o mar; sem carros, só gente andando devagar"
          },
          {
            "nome": "Praia dos Nativos",
            "nota": "acesso direto pela escadaria no fim do Quadrado"
          }
        ],
        "restaurante": "Capim Santo",
        "restauranteNota": "pioneiro da alta gastronomia em Trancoso; a lagosta ao molho de abacaxi é o prato mais pedido do Quadrado"
      },
      {
        "n": 2,
        "titulo": "Praia do Espelho",
        "desc": "Dia inteiro dedicado a uma das praias mais fotografadas do Brasil, cerca de 40 minutos ao sul de Trancoso.",
        "pontos": [
          {
            "nome": "Praia do Espelho",
            "nota": "piscinas naturais entre as pedras na maré baixa; confira o horário antes de ir"
          },
          {
            "nome": "Praia de Rio da Barra",
            "nota": "parada tranquila no caminho, bem menos concorrida"
          },
          {
            "nome": "Coqueiros",
            "nota": "faixa de areia extensa e vazia entre o Espelho e Trancoso"
          }
        ],
        "restaurante": "Barraca de praia no Espelho",
        "restauranteNota": "peixe grelhado e água de coco com vista para as piscinas naturais; leve dinheiro em espécie"
      },
      {
        "n": 3,
        "titulo": "Arraial d'Ajuda",
        "desc": "Balsa pelo Rio Buranhém até a vizinha mais movimentada, com sua rua principal cheia de lojinhas e restaurantes.",
        "pontos": [
          {
            "nome": "Rua Broadway (Rua Mucugê)",
            "nota": "rua principal de Arraial, concentra lojas, bares e a vida noturna da vila"
          },
          {
            "nome": "Praia do Mucugê",
            "nota": "clube de praia clássico de Arraial, boa estrutura de quiosques"
          },
          {
            "nome": "Travessia de balsa pelo Rio Buranhém",
            "nota": "liga Arraial a Porto Seguro; parte a cada poucos minutos"
          }
        ],
        "restaurante": "Bistrô D'Oliveira",
        "restauranteNota": "funciona dentro de uma barraca de praia; considerado por moradores o melhor restaurante da vila"
      },
      {
        "n": 4,
        "titulo": "Trilha da orla até Pitinga",
        "desc": "Caminhada pela costa entre falésias vermelhas, ligando Arraial às praias mais ao norte.",
        "pontos": [
          {
            "nome": "Trilha pela orla (maré baixa)",
            "nota": "liga as praias de Arraial a Pitinga; consulte a tábua de maré antes de sair"
          },
          {
            "nome": "Praia de Pitinga",
            "nota": "falésias vermelhas de argila contrastando com o mar azul"
          },
          {
            "nome": "Praça da Igreja de Arraial",
            "nota": "bom ponto de parada na volta, movimentado ao entardecer"
          }
        ],
        "restaurante": "Café da Santa",
        "restauranteNota": "na Praça da Igreja; doces, salgados e sanduíches para um almoço mais leve entre praias"
      },
      {
        "n": 5,
        "titulo": "Quadrado e despedida",
        "desc": "Último dia de volta a Trancoso, no ritmo mais lento, para aproveitar o Quadrado sem pressa antes do voo.",
        "pontos": [
          {
            "nome": "Quadrado ao amanhecer",
            "nota": "horário mais tranquilo, antes das lojas e restaurantes abrirem"
          },
          {
            "nome": "Passeio de escuna pela costa",
            "nota": "opção de barco até pontos de mergulho livre nas proximidades"
          },
          {
            "nome": "Feira de artesanato do Quadrado",
            "nota": "última chance de compras antes de ir embora"
          }
        ],
        "restaurante": "Silvinha",
        "restauranteNota": "comida caseira servida ao ar livre no meio do Quadrado; a moqueca é o prato mais pedido da casa"
      }
    ],
    "coords": {
      "lat": -16.5883,
      "lng": -39.0999
    }
  },
  "ouropreto": {
    "id": "ouropreto",
    "breadcrumb": "Ouro Preto",
    "tag": "Cidades históricas · Minas Gerais",
    "titulo": "Ouro Preto e Tiradentes em 5 dias, sem pressa",
    "resumo": "Ladeiras de pedra, igrejas cobertas de ouro e o melhor da comida mineira entre Ouro Preto e Tiradentes, do frango com quiabo da Casa do Ouvidor ao tutu da Viradas do Largo.",
    "intro": "Duas das cidades históricas mais bem preservadas do Brasil, a cerca de 100 km uma da outra, ligadas por trechos da Estrada Real. Ouro Preto impressiona pela escala barroca, pelas ladeiras íngremes e pelo peso da história da Inconfidência; Tiradentes encanta pelo tamanho pequeno e pelo ritmo lento. Este roteiro divide os cinco dias entre as duas, com tempo de sobra para comer bem.",
    "heroFoto": "ladeira de pedra e igrejas barrocas de Ouro Preto ao entardecer",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Ouro%20Preto%2C%20Minas%20Gerais.jpg",
    "heroCredit": "Ouro Preto — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Ouro_Preto",
    "preco": "R$ 349",
    "ctaVoos": "Buscar voos para Belo Horizonte",
    "ctaTitulo": "Minas colonial está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "abr a set"
      },
      {
        "k": "Voo de GRU",
        "v": "GRU–CNF 1h + 1h30 de estrada"
      },
      {
        "k": "Base do roteiro",
        "v": "Ouro Preto (2 noites) + Tiradentes (2 noites)"
      },
      {
        "k": "Estilo",
        "v": "barroco mineiro + gastronomia"
      }
    ],
    "hospedagem": {
      "texto": "O próprio roteiro já divide a base em duas etapas, e vale seguir à risca: duas noites em Ouro Preto para as ladeiras e igrejas dos dias 1 e 2, e duas noites em Tiradentes para os dias 4 e 5, evitando percorrer a Estrada Real mais de uma vez com bagagem."
    },
    "opt": {
      "destName": "Belo Horizonte (CNF)",
      "months": [
        690,
        590,
        490,
        420,
        380,
        349,
        560,
        410,
        370,
        400,
        450,
        650
      ],
      "window": {
        "label": "1 – 8 jun 2026",
        "price": "R$ 349",
        "save": "36%",
        "note": "clima seco e ameno da Serra do Espinhaço, ótimo para caminhar pelas ladeiras"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 349",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 379",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 365"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 390"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Centro Histórico de Ouro Preto",
        "desc": "Chegue cedo em Ouro Preto e dedique o dia à Praça Tiradentes e arredores, subindo e descendo as ladeiras de pedra no seu próprio ritmo.",
        "pontos": [
          {
            "nome": "Praça Tiradentes e Museu da Inconfidência",
            "nota": "antiga Casa de Câmara e Cadeia, hoje museu sobre o movimento de 1789"
          },
          {
            "nome": "Igreja São Francisco de Assis",
            "nota": "obra-prima do Aleijadinho, fachada em pedra-sabão e talha dourada"
          },
          {
            "nome": "Casa dos Contos",
            "nota": "casarão do século 18 que guarda a história do ciclo do ouro"
          }
        ],
        "restaurante": "Casa do Ouvidor",
        "restauranteNota": "casarão histórico desde 1972, famoso pelo frango com quiabo e tutu à mineira"
      },
      {
        "n": 2,
        "titulo": "Igrejas de ouro e mina visitável",
        "desc": "Segundo dia em Ouro Preto, com foco nas igrejas mais ricas em ouro da cidade e numa descida literal às minas que deram origem a tudo.",
        "pontos": [
          {
            "nome": "Igreja Nossa Senhora do Pilar",
            "nota": "considerada a mais rica em ouro do Brasil depois de São Francisco (Salvador)"
          },
          {
            "nome": "Igreja Nossa Senhora do Carmo",
            "nota": "outra obra do Aleijadinho, com museu de arte sacra anexo"
          },
          {
            "nome": "Mina da Passagem",
            "nota": "desça de vagonete a 120 m de profundidade numa mina de ouro do século 18 ainda visitável"
          }
        ],
        "restaurante": "Café Geraes",
        "restauranteNota": "comida mineira refinada num sobrado histórico, com piano bar nos fins de semana"
      },
      {
        "n": 3,
        "titulo": "Estrada Real até Tiradentes",
        "desc": "Deixe Ouro Preto pela manhã e siga por trechos da Estrada Real até Tiradentes, com parada em São João del-Rei no caminho.",
        "pontos": [
          {
            "nome": "São João del-Rei",
            "nota": "pare no Mercado Municipal e na Igreja Nossa Senhora do Pilar antes de seguir viagem"
          },
          {
            "nome": "Largo das Forras",
            "nota": "chegada em Tiradentes pela praça central, ponto de encontro da cidade"
          }
        ],
        "restaurante": "Viradas do Largo",
        "restauranteNota": "referência em comida mineira de fazenda, com linguiça feita na casa e verduras da horta própria"
      },
      {
        "n": 4,
        "titulo": "Tiradentes a pé",
        "desc": "Tiradentes se percorre inteira a pé num dia só: igrejas, museus e a Rua Direita cheia de galerias e ateliês.",
        "pontos": [
          {
            "nome": "Igreja Matriz de Santo Antônio",
            "nota": "talha dourada e um dos órgãos mais antigos do país, ainda em funcionamento"
          },
          {
            "nome": "Chafariz de São José",
            "nota": "fonte de pedra-sabão do século 18, ainda usada por moradores"
          },
          {
            "nome": "Museu Padre Toledo",
            "nota": "casarão que reconstitui a vida colonial e o episódio da Inconfidência Mineira"
          }
        ],
        "restaurante": "Estalagem do Sabor",
        "restauranteNota": "mais de trinta anos de casa, famosa pelo mané-sem-jaleco, um refogado de arroz, feijão e couve"
      },
      {
        "n": 5,
        "titulo": "Maria Fumaça e despedida",
        "desc": "Último dia com passeio de trem histórico (se cair em fim de semana) e uma última volta pelo casario antes de seguir para o aeroporto.",
        "pontos": [
          {
            "nome": "Maria Fumaça Tiradentes–São João del-Rei",
            "nota": "trem a vapor de 1881, roda aos sábados, domingos e feriados"
          },
          {
            "nome": "Complexo Cultural e Cênico Yves Alves",
            "nota": "galpão de arte contemporânea numa antiga garagem de trem"
          }
        ],
        "restaurante": "Theatro da Villa",
        "restauranteNota": "ex-teatro transformado em restaurante romântico, cozinha autoral para fechar a viagem"
      }
    ],
    "coords": {
      "lat": -20.3855,
      "lng": -43.5035
    }
  },
  "florianopolis": {
    "id": "florianopolis",
    "breadcrumb": "Florianópolis",
    "tag": "Praias e lagoa · Santa Catarina",
    "titulo": "Florianópolis em 5 dias, sem pressa",
    "resumo": "Do centro histórico à Lagoa da Conceição, do norte badalado ao sul selvagem, com as ostras de Ribeirão da Ilha e o camarão empanado do Box 32.",
    "intro": "A Ilha de Santa Catarina tem mais de 40 praias e paisagens que mudam completamente a cada 20 minutos de carro: mangue e duna, vila açoriana e beach club, trilha de mata fechada e lagoa de água doce. Este roteiro percorre a ilha em círculo, do centro ao sul selvagem, no ritmo de quem não quer voltar cansado.",
    "heroFoto": "Lagoa da Conceição vista de cima ao entardecer, com dunas ao fundo",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Barra%20da%20Lagoa%2C%20Florian%C3%B3polis%20-%20SC%20(2).JPG",
    "heroCredit": "Florianópolis — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Lagoa_da_Conceição",
    "preco": "R$ 399",
    "ctaVoos": "Buscar voos para Florianópolis",
    "ctaTitulo": "A Ilha da Magia está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "dez a mar"
      },
      {
        "k": "Voo de GRU",
        "v": "1h50 direto"
      },
      {
        "k": "Base do roteiro",
        "v": "Lagoa da Conceição ou Centro"
      },
      {
        "k": "Estilo",
        "v": "praias + gastronomia açoriana"
      }
    ],
    "hospedagem": {
      "texto": "A Lagoa da Conceição fica perto da Barra da Lagoa e das dunas da Joaquina do dia 2, num clima mais de vila; o Centro é mais prático para sair cedo rumo ao norte badalado ou à Costa Oeste açoriana, que ficam a uns 30-40 minutos dos dois lados. Nenhuma das duas bases resolve o sul selvagem do dia 5 — para lá é estrada de qualquer forma."
    },
    "opt": {
      "destName": "Florianópolis (FLN)",
      "months": [
        950,
        780,
        620,
        480,
        420,
        399,
        550,
        430,
        410,
        440,
        520,
        1050
      ],
      "window": {
        "label": "1 – 8 jun 2026",
        "price": "R$ 399",
        "save": "38%",
        "note": "outono maduro na ilha, lagoa mais vazia e praias ainda quentes"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 399",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 429",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 415"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 438"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Centro Histórico e Mercado Público",
        "desc": "Comece pelo centro, do outro lado da ponte, antes de se render de vez ao ritmo de praia dos próximos dias.",
        "pontos": [
          {
            "nome": "Mercado Público de Florianópolis",
            "nota": "de 1898, cheio de boxes de peixe fresco, artesanato e bares"
          },
          {
            "nome": "Praça XV de Novembro e Catedral Metropolitana",
            "nota": "coração histórico da cidade, sombreado por uma figueira centenária"
          },
          {
            "nome": "Ponte Hercílio Luz",
            "nota": "cartão-postal da cidade, iluminada à noite"
          }
        ],
        "restaurante": "Box 32 (Mercado Público)",
        "restauranteNota": "casa aberta desde 1984, famosa pelo pastel de camarão e pelas ostras no balcão"
      },
      {
        "n": 2,
        "titulo": "Lagoa da Conceição e Barra da Lagoa",
        "desc": "Dia para alternar entre a lagoa de água doce e o mar aberto, a poucos minutos de distância um do outro.",
        "pontos": [
          {
            "nome": "Lagoa da Conceição",
            "nota": "stand-up paddle ou caiaque nas águas calmas, com as dunas ao fundo"
          },
          {
            "nome": "Barra da Lagoa",
            "nota": "canal de pescadores e ponto de partida da trilha para a Praia Mole"
          },
          {
            "nome": "Dunas da Joaquina",
            "nota": "sandboard nas dunas que também são pico clássico de surf"
          }
        ],
        "restaurante": "Restaurante Oliveira",
        "restauranteNota": "tradição de gerações à beira da lagoa, especializado em frutos do mar"
      },
      {
        "n": 3,
        "titulo": "Norte da Ilha",
        "desc": "O lado mais badalado da ilha, entre praias de água mais quente e uma fortaleza colonial no meio do mar.",
        "pontos": [
          {
            "nome": "Jurerê Internacional",
            "nota": "orla plana e organizada, cheia de beach clubs"
          },
          {
            "nome": "Fortaleza São José da Ponta Grossa",
            "nota": "fortificação do século 18 com vista para a Baía Norte"
          },
          {
            "nome": "Praia dos Ingleses ou Canasvieiras",
            "nota": "praias mais amplas e cheias de infraestrutura de bar"
          }
        ],
        "restaurante": "Ammo Beach",
        "restauranteNota": "cozinha greco-mediterrânea de frente para o mar em Jurerê Internacional"
      },
      {
        "n": 4,
        "titulo": "Costa Oeste: Santo Antônio de Lisboa e Ribeirão da Ilha",
        "desc": "O lado mais tranquilo e histórico da ilha, com herança açoriana visível nas casas, nas rendas e nos frutos do mar.",
        "pontos": [
          {
            "nome": "Santo Antônio de Lisboa",
            "nota": "vila açoriana com casario do século 18 de frente para a Baía Norte"
          },
          {
            "nome": "Ribeirão da Ilha",
            "nota": "fazendas de ostras a céu aberto e a igreja Nossa Senhora da Lapa"
          }
        ],
        "restaurante": "Ostradamus",
        "restauranteNota": "referência em ostras cultivadas na própria fazenda, em Ribeirão da Ilha"
      },
      {
        "n": 5,
        "titulo": "Sul selvagem e despedida",
        "desc": "Último dia no trecho mais preservado da ilha, com trilhas de mata atlântica e praias sem infraestrutura.",
        "pontos": [
          {
            "nome": "Pântano do Sul",
            "nota": "vila de pescadores com mar mais calmo, boa para o fim de tarde"
          },
          {
            "nome": "Mirante da trilha da Lagoinha do Leste",
            "nota": "trilha de cerca de 1h30 até um mirante sobre uma das praias mais bonitas da ilha"
          }
        ],
        "restaurante": "Bar do Arante",
        "restauranteNota": "desde 1958, paredes cobertas de bilhetes escritos à mão e peixe fresco do dia"
      }
    ],
    "coords": {
      "lat": -27.5954,
      "lng": -48.548
    }
  },
  "paraty": {
    "id": "paraty",
    "breadcrumb": "Paraty",
    "tag": "Litoral colonial · Rio de Janeiro",
    "titulo": "Paraty e Ilha Grande em 5 dias, sem pressa",
    "resumo": "Centro colonial, escuna pelas ilhas da baía e travessia para Ilha Grande, dos camarões flambados da Banana da Terra às praias desertas de Lopes Mendes.",
    "intro": "Paraty guarda um dos centros históricos mais completos do litoral brasileiro, com ruas de pedra que ainda alagam na maré cheia. A poucas horas de barco, Ilha Grande soma trilha de mata atlântica a praias que aparecem em toda lista de melhores do Brasil. Este roteiro junta as duas pontas numa semana só, sem precisar escolher.",
    "heroFoto": "ruas de pedra e casario colonial de Paraty ao entardecer",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Cidade%20de%20Paraty.jpg",
    "heroCredit": "Paraty — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Paraty",
    "preco": "R$ 400",
    "ctaVoos": "Buscar voos para o Rio de Janeiro",
    "ctaTitulo": "O litoral colonial está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "abr a jun e set a out"
      },
      {
        "k": "Voo de GRU",
        "v": "GRU–GIG 1h + 4h de estrada"
      },
      {
        "k": "Base do roteiro",
        "v": "Paraty (3 noites) + Vila do Abraão (1 noite)"
      },
      {
        "k": "Estilo",
        "v": "colonial + trilhas e ilhas"
      }
    ],
    "hospedagem": {
      "texto": "O roteiro já resolve a base sozinho: três noites no centro histórico de Paraty, a pé das igrejas e restaurantes dos dias 1 e 2, e uma noite na Vila do Abraão, em Ilha Grande, para não gastar metade do dia 4 indo e voltando de barco no mesmo dia."
    },
    "opt": {
      "destName": "Rio de Janeiro (GIG)",
      "months": [
        780,
        650,
        540,
        460,
        420,
        410,
        580,
        440,
        400,
        430,
        480,
        820
      ],
      "window": {
        "label": "7 – 14 set 2026",
        "price": "R$ 400",
        "save": "35%",
        "note": "fim do inverno, mar mais calmo em Ilha Grande e trilhas sem lama"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 400",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 432",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 419"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 445"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Centro Histórico de Paraty",
        "desc": "Chegada e primeiro contato com as ruas de pedra irregular do centro histórico, fechado para carros.",
        "pontos": [
          {
            "nome": "Igreja de Santa Rita",
            "nota": "a mais fotografada da cidade, construída por escravizados alforriados"
          },
          {
            "nome": "Igreja Nossa Senhora do Rosário",
            "nota": "a mais antiga de Paraty, ligada à comunidade negra da cidade colonial"
          },
          {
            "nome": "Rua do Comércio",
            "nota": "ruela de pedra que alaga na maré cheia, hoje cheia de galerias e cachaçarias"
          }
        ],
        "restaurante": "Margarida Café",
        "restauranteNota": "casarão colonial na Praça do Chafariz, mais de 20 anos de casa, com música ao vivo"
      },
      {
        "n": 2,
        "titulo": "Escuna e praias ao redor de Paraty",
        "desc": "Dia de barco pela Baía de Paraty, entre ilhas e piscinas naturais, com opção de trilha ou estrada até praias mais afastadas.",
        "pontos": [
          {
            "nome": "Passeio de escuna pela Baía de Paraty",
            "nota": "parada para banho em ilhas e piscinas naturais de água verde"
          },
          {
            "nome": "Praia do Sono ou Trindade",
            "nota": "praias de trilha ou estrada de terra, entre as mais bonitas do litoral fluminense"
          },
          {
            "nome": "Cachoeira do Tobogã",
            "nota": "escorregador natural de pedra, clássico com crianças e sem pressa"
          }
        ],
        "restaurante": "Banana da Terra",
        "restauranteNota": "cozinha autoral desde 1992, camarões flambados na cachaça paratiana com arroz negro"
      },
      {
        "n": 3,
        "titulo": "Travessia para Ilha Grande",
        "desc": "Manhã de barco até Vila do Abraão, a vila principal de Ilha Grande, sem carros e cercada por mata atlântica preservada.",
        "pontos": [
          {
            "nome": "Vila do Abraão",
            "nota": "vila-base da ilha, com orla de areia e restaurantes de frente para o mar"
          },
          {
            "nome": "Ruínas do Presídio Cândido Mendes",
            "nota": "antigo presídio de segurança máxima, hoje ruína tomada pela mata"
          }
        ],
        "restaurante": "Lua e Mar",
        "restauranteNota": "um dos mais tradicionais da vila, de frente para a praia, especializado em moqueca e frutos do mar"
      },
      {
        "n": 4,
        "titulo": "Trilhas e praias de Ilha Grande",
        "desc": "Dia inteiro na ilha, entre trilha de mata fechada e uma das praias mais premiadas do país.",
        "pontos": [
          {
            "nome": "Trilha do Pico do Papagaio",
            "nota": "subida de 3 a 4h até o mirante mais alto da ilha, vista de 360 graus"
          },
          {
            "nome": "Praia de Lopes Mendes",
            "nota": "areia branca e fininha, considerada uma das mais bonitas do Brasil"
          },
          {
            "nome": "Lagoa Azul",
            "nota": "parada de barco para mergulho com snorkel em água cristalina"
          }
        ],
        "restaurante": "Pé na Areia",
        "restauranteNota": "o mais charmoso da orla do Abraão depois que escurece, mesas quase na areia"
      },
      {
        "n": 5,
        "titulo": "Volta a Paraty e despedida",
        "desc": "Retorno de barco a Paraty pela manhã, com tempo para um último passeio antes de seguir para o Rio.",
        "pontos": [
          {
            "nome": "Saco do Mamanguá",
            "nota": "fiorde tropical navegável de caiaque, cercado de mata atlântica intocada"
          },
          {
            "nome": "Praça da Matriz e Chafariz",
            "nota": "última volta pelo centro histórico e pelas lojas de artesanato"
          }
        ],
        "restaurante": "Quintal das Letras",
        "restauranteNota": "no jardim da Pousada Literária, cozinha contemporânea com ostras do Saco do Mamanguá"
      }
    ],
    "coords": {
      "lat": -23.2178,
      "lng": -44.7131
    }
  },
  "bonito": {
    "id": "bonito",
    "breadcrumb": "Bonito",
    "tag": "Natureza · Mato Grosso do Sul",
    "titulo": "Bonito em 5 dias, rio por rio",
    "resumo": "Flutuação, grutas e balneários com agendamento certo, sem correria.",
    "intro": "Bonito não é destino para improviso: quase todos os passeios têm vaga limitada e precisam de agendamento e voucher com antecedência, muitas vezes semanas antes na alta temporada. A recompensa é a água mais transparente que existe no Brasil e uma cidade pequena e tranquila para voltar todo fim de tarde. Este roteiro organiza os principais rios, grutas e balneários em cinco dias, sem repetir atração e sem deixar buraco na agenda.",
    "heroFoto": "flutuação em rio de água cristalina cercado de vegetação",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Gruta%20do%20Lago%20Azul%20-%20Bonito%2C%20MS.JPG",
    "heroCredit": "Bonito — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Monumento_Natural_da_Gruta_do_Lago_Azul",
    "preco": "R$ 480",
    "ctaVoos": "Buscar voos para Campo Grande (rota para Bonito)",
    "ctaTitulo": "Bonito está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "abr a out, águas mais claras"
      },
      {
        "k": "Acesso",
        "v": "voo a Campo Grande + 4h de estrada"
      },
      {
        "k": "Base do roteiro",
        "v": "Centro de Bonito"
      },
      {
        "k": "Estilo",
        "v": "ecoturismo + flutuação"
      }
    ],
    "hospedagem": {
      "texto": "O centro de Bonito é pequeno e concentra as agências que organizam os passeios, mas ficar ali não elimina a estrada: cada atração do roteiro, do Rio da Prata ao Rio Sucuri, fica de 20 a 40 minutos fora da cidade, e o transporte quase sempre já vem combinado junto com o voucher do passeio."
    },
    "opt": {
      "destName": "Bonito (via Campo Grande, CGR)",
      "months": [
        780,
        520,
        480,
        540,
        560,
        610,
        890,
        650,
        590,
        570,
        600,
        820
      ],
      "window": {
        "label": "2 – 9 mar 2026",
        "price": "R$ 480",
        "save": "31%",
        "note": "baixa temporada, rios mais cheios e cidade tranquila"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 480",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 530",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 515"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 545"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Chegada e primeiro contato com a água",
        "desc": "Aterrissar, se instalar e já entrar no clima do Formoso.",
        "pontos": [
          {
            "nome": "Gruta do Lago Azul",
            "nota": "lago subterrâneo azul-turquesa, agendamento obrigatório e horário marcado"
          },
          {
            "nome": "Balneário Municipal do Rio Formoso",
            "nota": "flutuação livre e barata, ótima estreia antes dos passeios pagos"
          }
        ],
        "restaurante": "Taboa Bar",
        "restauranteNota": "petiscos, cachaças artesanais e música ao vivo num ambiente descontraído"
      },
      {
        "n": 2,
        "titulo": "Rio da Prata",
        "desc": "A flutuação mais famosa da região, com visibilidade de tirar o fôlego.",
        "pontos": [
          {
            "nome": "Recanto Ecológico Rio da Prata",
            "nota": "cerca de 2h de flutuação guiada entre cardumes de dourados e piraputangas"
          },
          {
            "nome": "Nascente Azul",
            "nota": "trilha até a nascente de água cristalina, opcional no mesmo pacote"
          }
        ],
        "restaurante": "Casa do João",
        "restauranteNota": "pratos vegetarianos e comida caseira regional, ambiente simples e acolhedor"
      },
      {
        "n": 3,
        "titulo": "Dolinas e cavernas",
        "desc": "Um dia de contrastes geológicos, do buraco na terra ao aquário natural.",
        "pontos": [
          {
            "nome": "Buraco das Araras",
            "nota": "dolina de 100m de profundidade com casais de araras-vermelhas em voo"
          },
          {
            "nome": "Aquário Natural",
            "nota": "flutuação curta e rasa, indicada para quem viaja com crianças"
          }
        ],
        "restaurante": "Quintal Pantaneiro",
        "restauranteNota": "referência em culinária do Centro-Oeste, peça o pintado ao molho de pequi"
      },
      {
        "n": 4,
        "titulo": "Rio Sucuri e balneário em família",
        "desc": "Outra flutuação clássica e uma tarde mais leve.",
        "pontos": [
          {
            "nome": "Rio Sucuri",
            "nota": "1.800m de flutuação da nascente até a foz, uma das águas mais transparentes do país"
          },
          {
            "nome": "Balneário Ilha do Padre",
            "nota": "poços, corredeiras e tirolesa num só lugar, bom para descontrair"
          }
        ],
        "restaurante": "La Bonita Gastrobar",
        "restauranteNota": "pratos autorais à base de mandioca e música ao vivo, ótimo para o happy hour"
      },
      {
        "n": 5,
        "titulo": "Adrenalina leve e despedida",
        "desc": "Um passeio mais curto pela manhã e tempo livre para o centrinho antes do voo.",
        "pontos": [
          {
            "nome": "Boia-Cross no Rio Formoso",
            "nota": "descida em bote inflável com pequenas corredeiras, dura cerca de 1h"
          },
          {
            "nome": "Praça da Liberdade",
            "nota": "artesanato local e lembranças de última hora antes de seguir para o aeroporto"
          }
        ],
        "restaurante": "Juanita Battilani",
        "restauranteNota": "um dos favoritos da cidade, prato feito caseiro servido com carinho"
      }
    ],
    "coords": {
      "lat": -21.1261,
      "lng": -56.4836
    }
  },
  "veadeiros": {
    "id": "veadeiros",
    "breadcrumb": "Chapada dos Veadeiros",
    "tag": "Natureza · Goiás",
    "titulo": "Chapada dos Veadeiros em 5 dias, cachoeira por cachoeira",
    "resumo": "Alto Paraíso, São Jorge e as trilhas do Parque Nacional na ordem certa.",
    "intro": "A Chapada dos Veadeiros mistura chapadas de quartzito, cerrado preservado e um punhado de cidadezinhas que vivem de cristal e turismo consciente. Boa parte das trilhas dentro do Parque Nacional só pode ser feita com condutor credenciado e agendamento prévio pelo ICMBio, então vale reservar com antecedência. Este roteiro divide os cinco dias entre a base em Alto Paraíso e a vila de São Jorge, porta de entrada do parque.",
    "heroFoto": "cachoeira caindo entre paredões de quartzito no cerrado",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Vale%20da%20Lua%2C%20Chapada%20dos%20Veadeiros%2C%20Goi%C3%A1s%2C%20Brasil.JPG",
    "heroCredit": "Chapada dos Veadeiros — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Vale_da_Lua",
    "preco": "R$ 400",
    "ctaVoos": "Buscar voos para Brasília (rota para a Chapada)",
    "ctaTitulo": "A Chapada dos Veadeiros está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "mai a set, seca com trilhas abertas"
      },
      {
        "k": "Acesso",
        "v": "voo a Brasília + 2h30 de estrada"
      },
      {
        "k": "Base do roteiro",
        "v": "Alto Paraíso e São Jorge"
      },
      {
        "k": "Estilo",
        "v": "trilhas + cachoeiras"
      }
    ],
    "hospedagem": {
      "texto": "Alto Paraíso serve bem os dois primeiros dias, com a Trilha dos Saltos por perto; a partir do dia 3 o roteiro muda para São Jorge, porta oficial do Parque Nacional, o que deixa o Vale da Lua e as trilhas guiadas dos últimos dias bem mais próximas. Trocar de base no meio da semana, como o roteiro propõe, evita quase uma hora de estrada todo dia."
    },
    "opt": {
      "destName": "Chapada dos Veadeiros (via Brasília, BSB)",
      "months": [
        650,
        420,
        400,
        450,
        480,
        560,
        780,
        620,
        490,
        460,
        480,
        700
      ],
      "window": {
        "label": "9 – 16 mar 2026",
        "price": "R$ 400",
        "save": "36%",
        "note": "fim das chuvas, cachoeiras cheias e cerrado bem verde"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 400",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 450",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 435"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 460"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Alto Paraíso, chegada e ambientação",
        "desc": "Conhecer a cidade e pegar o clima antes das trilhas.",
        "pontos": [
          {
            "nome": "Centro de Alto Paraíso",
            "nota": "lojas de cristais e artesanato local, bom para caminhar ao chegar"
          },
          {
            "nome": "Mirante da Torre de TV",
            "nota": "pôr do sol sobre o cerrado com vista de 360 graus"
          }
        ],
        "restaurante": "Vinil Bistrô",
        "restauranteNota": "panelinhas goianas bem quentes num ambiente retrô com boa música"
      },
      {
        "n": 2,
        "titulo": "Trilha dos Saltos, dentro do parque",
        "desc": "A trilha mais completa do Parque Nacional, com condutor credenciado obrigatório.",
        "pontos": [
          {
            "nome": "Salto Corumbá I",
            "nota": "poço amplo e profundo, ótimo para nadar após a caminhada"
          },
          {
            "nome": "Salto Corumbá II",
            "nota": "mirante e queda com vista aberta para o vale"
          }
        ],
        "restaurante": "Poeira",
        "restauranteNota": "menu do chef Marcos Nery com sabores do Cerrado e drinks autorais"
      },
      {
        "n": 3,
        "titulo": "Vale da Lua e Vila de São Jorge",
        "desc": "Mudar de base e conhecer o portal do Parque Nacional.",
        "pontos": [
          {
            "nome": "Vale da Lua",
            "nota": "piscinas naturais esculpidas pelo Rio Preto em formas que lembram crateras"
          },
          {
            "nome": "Vila de São Jorge",
            "nota": "pousadas simples e o acesso oficial ao Parque Nacional"
          }
        ],
        "restaurante": "Na Mata",
        "restauranteNota": "cozinha contemporânea da chef Mara Alcamim, em Vila de São Jorge"
      },
      {
        "n": 4,
        "titulo": "Cachoeiras de reservas privadas",
        "desc": "Trilhas mais curtas, fora do parque federal, sem burocracia extra.",
        "pontos": [
          {
            "nome": "Cachoeira Almécegas I",
            "nota": "trilha curta até um poço amplo, boa opção para o meio do dia"
          },
          {
            "nome": "Cânions I e II",
            "nota": "trilhas guiadas com entrada matinal controlada e vista sobre a serra"
          }
        ],
        "restaurante": "Restaurante da Cachoeira São Bento",
        "restauranteNota": "funciona junto com a cervejaria artesanal da propriedade"
      },
      {
        "n": 5,
        "titulo": "Loquinhas e despedida",
        "desc": "Uma trilha leve pela manhã antes de seguir para Brasília.",
        "pontos": [
          {
            "nome": "Cachoeira das Loquinhas",
            "nota": "trilha fácil com direito a garimpo de cristais no caminho"
          },
          {
            "nome": "Jardim de Maytrea",
            "nota": "mirante de nascer do sol, para quem sai bem cedo do hotel"
          }
        ],
        "restaurante": "Vila Toá",
        "restauranteNota": "cozinha autoral com pôr do sol sobre o vale, ótimo fechamento de viagem"
      }
    ],
    "coords": {
      "lat": -14.1325,
      "lng": -47.5136
    }
  },
  "manaus": {
    "id": "manaus",
    "breadcrumb": "Manaus",
    "tag": "Natureza · Amazonas",
    "titulo": "Manaus e a Amazônia em 5 dias, do encontro das águas à selva",
    "resumo": "Teatro Amazonas, o Rio Negro e duas noites em lodge de selva.",
    "intro": "Manaus é o ponto de partida, mas o roteiro que compensa a viagem mistura cidade e floresta: dois dias na capital, entre teatro, mercado e o Encontro das Águas, e dois dias hospedado num lodge de selva, acessível só de barco. Reserve o lodge com antecedência, porque as vagas incluem transporte fluvial e pacote fechado de refeições e passeios. Vá de roupa leve, repelente e câmera à prova de umidade.",
    "heroFoto": "encontro das águas do Rio Negro e do Solimões visto de barco",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Amazon%20Theatre%20(Manaus%2C%20Brazil)%20(edited).jpg",
    "heroCredit": "Teatro Amazonas, Manaus — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Teatro_Amazonas",
    "preco": "R$ 680",
    "ctaVoos": "Buscar voos para Manaus",
    "ctaTitulo": "A Amazônia está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "jul a nov, seca e praias fluviais"
      },
      {
        "k": "Voo de GRU",
        "v": "4h direto"
      },
      {
        "k": "Base do roteiro",
        "v": "Centro + lodge de selva"
      },
      {
        "k": "Estilo",
        "v": "cultura + floresta"
      }
    ],
    "hospedagem": {
      "texto": "Os dois primeiros dias pedem hospedagem no centro de Manaus, perto do Teatro Amazonas e do Mercado Municipal do dia 1; a partir do Encontro das Águas, no dia 2, o roteiro passa a noite num lodge de selva, acessível só de barco, onde ficam as duas noites de imersão antes de voltar à cidade no último dia."
    },
    "opt": {
      "destName": "Manaus (MAO)",
      "months": [
        980,
        720,
        680,
        700,
        750,
        820,
        1150,
        950,
        820,
        790,
        830,
        1080
      ],
      "window": {
        "label": "9 – 16 mar 2026",
        "price": "R$ 680",
        "save": "32%",
        "note": "cheia do rio, floresta alagada e passeios de canoa entre as árvores"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 680",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 740",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 715"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 755"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Manaus histórica",
        "desc": "Teatro, mercado e o Centro Histórico antes de seguir para a floresta.",
        "pontos": [
          {
            "nome": "Teatro Amazonas",
            "nota": "visita guiada ao interior belle époque erguido no auge da borracha"
          },
          {
            "nome": "Mercado Municipal Adolpho Lisboa",
            "nota": "estrutura de ferro art nouveau, peixes e ervas amazônicas"
          }
        ],
        "restaurante": "Recanto do Quixito",
        "restauranteNota": "peixaria histórica dentro do próprio mercado, com vista para o Rio Negro"
      },
      {
        "n": 2,
        "titulo": "Encontro das Águas e embarque para o lodge",
        "desc": "Sair de barco rumo à floresta, com parada no fenômeno mais famoso da região.",
        "pontos": [
          {
            "nome": "Encontro das Águas",
            "nota": "o Rio Negro escuro e o Solimões barrento correm lado a lado sem se misturar por km"
          },
          {
            "nome": "Lago Janauari",
            "nota": "vitórias-régias gigantes, conforme o nível do rio na estação"
          }
        ],
        "restaurante": "Caxiri",
        "restauranteNota": "casarão histórico de frente para o Teatro Amazonas, cardápio com pirarucu e tambaqui"
      },
      {
        "n": 3,
        "titulo": "Imersão na selva",
        "desc": "Primeiro dia inteiro no lodge, no ritmo da floresta.",
        "pontos": [
          {
            "nome": "Passeio de canoa pelo igapó",
            "nota": "floresta alagada, boa observação de aves ao amanhecer"
          },
          {
            "nome": "Pesca de piranhas",
            "nota": "passeio clássico do fim de tarde, incluso no pacote do lodge"
          }
        ],
        "restaurante": "Restaurante do lodge",
        "restauranteNota": "menu fixo regional, tambaqui assado na brasa e frutas nativas"
      },
      {
        "n": 4,
        "titulo": "Noite e comunidade ribeirinha",
        "desc": "A floresta muda de cara depois que o sol se põe.",
        "pontos": [
          {
            "nome": "Trilha noturna na selva",
            "nota": "observação guiada de sapos, aranhas e sons noturnos com lanterna"
          },
          {
            "nome": "Visita a comunidade ribeirinha",
            "nota": "troca com moradores locais e artesanato em fibra natural"
          }
        ],
        "restaurante": "Restaurante do lodge",
        "restauranteNota": "tambaqui de banda com farofa d'água, receita típica ribeirinha"
      },
      {
        "n": 5,
        "titulo": "Volta a Manaus e despedida",
        "desc": "Retorno de barco pela manhã e últimas horas na cidade antes do voo.",
        "pontos": [
          {
            "nome": "Praia da Ponta Negra",
            "nota": "orla urbana às margens do Rio Negro, boa para esticar as pernas"
          },
          {
            "nome": "Museu da Amazônia (MUSA)",
            "nota": "trilha elevada sobre o dossel da floresta, se sobrar tempo antes do voo"
          }
        ],
        "restaurante": "Amazônico Peixaria Regional",
        "restauranteNota": "cardápio da chef Nega Lima, com matrinxã recheada e pirarucu com queijo de coalho"
      }
    ],
    "coords": {
      "lat": -3.119,
      "lng": -60.0217
    }
  },
  "cusco": {
    "id": "cusco",
    "breadcrumb": "Cusco",
    "tag": "Montanha · Peru",
    "titulo": "Cusco e Machu Picchu em 5 dias, no ritmo da altitude",
    "resumo": "Cidade inca, Valle Sagrado e a citadela ao amanhecer, com tempo para aclimatar.",
    "intro": "Cusco fica a 3.400 metros e cobra paciência antes de recompensar: os primeiros dias servem para o corpo se acostumar à altura, o meio do roteiro passa pelo Valle Sagrado e Machu Picchu fecha a viagem, quando a aclimatação já foi feita. Ingresso da citadela e trem devem ser comprados com antecedência — nas datas de alta temporada esgotam semanas antes.",
    "heroFoto": "Machu Picchu envolta em névoa ao nascer do sol",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Machu%20Picchu%2C%20Peru.jpg",
    "heroCredit": "Machu Picchu — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Machu_Picchu",
    "preco": "R$ 1.980",
    "ctaVoos": "Buscar voos para Cusco",
    "ctaTitulo": "Cusco e Machu Picchu estão chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "abr a out (seca)"
      },
      {
        "k": "Voo de GRU",
        "v": "1 escala em Lima, ~7h"
      },
      {
        "k": "Base do roteiro",
        "v": "San Blas, Cusco"
      },
      {
        "k": "Atenção",
        "v": "aclimatação à altitude e ingresso + trem com antecedência"
      }
    ],
    "hospedagem": {
      "texto": "San Blas, o bairro de ladeiras estreitas do dia 1, funciona como base fixa para os quatro primeiros dias: fica perto da Plaza de Armas e é de onde saem os passeios até as ruínas ao redor e o trem para o Valle Sagrado. Vale escolher hospedagem sem muitas escadas para os primeiros dias — a 3.400 m, a altitude pesa mais do que qualquer distância a pé."
    },
    "opt": {
      "destName": "Cusco (CUZ)",
      "months": [
        2450,
        1980,
        2150,
        2380,
        2620,
        2890,
        3450,
        3200,
        2750,
        2500,
        2300,
        2680
      ],
      "window": {
        "label": "9 – 16 fev 2026",
        "price": "R$ 1.980",
        "save": "32%",
        "note": "época de chuvas, poucos turistas nas ruínas"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 1.980",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 2.180",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 2.150"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 2.240"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Chegada e aclimatação no centro histórico",
        "desc": "Dia curto e caminhadas leves para o corpo se acostumar à altitude antes de qualquer esforço maior.",
        "pontos": [
          {
            "nome": "Plaza de Armas",
            "nota": "ponto de partida, arcadas coloniais sobre base inca"
          },
          {
            "nome": "Catedral del Cusco",
            "nota": "talha em prata e obras da escola cusquenha"
          },
          {
            "nome": "Bairro de San Blas",
            "nota": "ladeiras estreitas, ateliês de artesãos"
          }
        ],
        "restaurante": "MAP Café",
        "restauranteNota": "dentro do Museu de Arte Precolombino, cozinha peruana contemporânea em pátio colonial"
      },
      {
        "n": 2,
        "titulo": "Ruínas incas ao redor da cidade",
        "desc": "Circuito curto de sítios arqueológicos a poucos minutos do centro, bom para caminhar devagar enquanto o corpo aclimata.",
        "pontos": [
          {
            "nome": "Sacsayhuamán",
            "nota": "muralhas ciclópicas com blocos de até 100 toneladas"
          },
          {
            "nome": "Q'enqo",
            "nota": "santuário esculpido na rocha"
          },
          {
            "nome": "Tambomachay",
            "nota": "fontes de água cerimoniais incas"
          }
        ],
        "restaurante": "Cicciolina",
        "restauranteNota": "clássico cusquenho, tapas andinas e alpaca bem preparada"
      },
      {
        "n": 3,
        "titulo": "Valle Sagrado",
        "desc": "Dia inteiro pelo vale, entre feiras, terraços agrícolas e um vilarejo inca ainda habitado.",
        "pontos": [
          {
            "nome": "Feira e ruínas de Pisac",
            "nota": "artesanato têxtil e andenes na encosta"
          },
          {
            "nome": "Salineras de Maras",
            "nota": "milhares de poças de sal em terraços"
          },
          {
            "nome": "Ollantaytambo",
            "nota": "fortaleza inca e traçado urbano original habitado"
          }
        ],
        "restaurante": "El Albergue Restaurante",
        "restauranteNota": "ao lado da estação de trem de Ollantaytambo, produtos da própria horta"
      },
      {
        "n": 4,
        "titulo": "Machu Picchu",
        "desc": "Trem cedo para Aguas Calientes e subida à citadela pela manhã, quando a neblina começa a abrir.",
        "pontos": [
          {
            "nome": "Machu Picchu",
            "nota": "citadela inca a 2.430 m, reserve o ingresso com meses de antecedência"
          },
          {
            "nome": "Intipunku (Portão do Sol)",
            "nota": "mirante ao fim da trilha curta, vista clássica do sítio"
          }
        ],
        "restaurante": "Indio Feliz",
        "restauranteNota": "em Aguas Calientes, cozinha franco-peruana num casarão cheio de bugigangas"
      },
      {
        "n": 5,
        "titulo": "Volta a Cusco e despedida",
        "desc": "Trem de manhã de volta a Cusco e uma última caminhada pelo centro antes do voo.",
        "pontos": [
          {
            "nome": "Mercado San Pedro",
            "nota": "frutas andinas, sucos e barracas de comida local"
          },
          {
            "nome": "Qorikancha",
            "nota": "antigo templo do sol, base de pedra inca sob a igreja de Santo Domingo"
          }
        ],
        "restaurante": "Chicha",
        "restauranteNota": "restaurante de Gastón Acurio dedicado à cozinha regional cusquenha"
      }
    ],
    "coords": {
      "lat": -13.5319,
      "lng": -71.9675
    }
  },
  "atacama": {
    "id": "atacama",
    "breadcrumb": "San Pedro de Atacama",
    "tag": "Deserto · Chile",
    "titulo": "San Pedro de Atacama em 5 dias, entre vulcões e sal",
    "resumo": "Valle de la Luna, gêiseres do Tatio e as lagunas do Salar, sem pressa.",
    "intro": "O deserto mais árido do mundo concentra paisagens que parecem de outro planeta: dunas de sal, gêiseres fumegantes ao amanhecer e lagunas onde o céu se repete na água. Este roteiro intercala passeios de manhã cedo com tardes mais leves, porque os tours de altitude — como o Tatio, a quase 4.300 metros — cansam mais do que parecem.",
    "heroFoto": "dunas e formações rochosas do Valle de la Luna ao pôr do sol",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Duna%20Mayor%2C%20Valle%20de%20la%20Luna%2C%20San%20Pedro%20de%20Atacama%2C%20Chile%2C%202016-02-01%2C%20DD%20163.JPG",
    "heroCredit": "Valle de la Luna, Atacama — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Valle_de_la_Luna_(Chile)",
    "preco": "R$ 1.850",
    "ctaVoos": "Buscar voos para San Pedro de Atacama",
    "ctaTitulo": "O deserto do Atacama está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "abr, mai, set e out"
      },
      {
        "k": "Voo de GRU",
        "v": "escala em Santiago até Calama, ~6h"
      },
      {
        "k": "Base do roteiro",
        "v": "San Pedro de Atacama"
      },
      {
        "k": "Atenção",
        "v": "passeios de altitude saem de madrugada; leve agasalho para o frio noturno"
      }
    ],
    "hospedagem": {
      "texto": "San Pedro de Atacama é um vilarejo pequeno e a única base possível: todos os passeios do roteiro, do Valle de la Luna ao Salar, saem de lá de van, geralmente de madrugada no caso do Tatio, no dia 3. Vale escolher hospedagem perto do centro para não depender de transporte extra nos horários de saída, que costumam ser antes do amanhecer."
    },
    "opt": {
      "destName": "San Pedro de Atacama (via CJC)",
      "months": [
        2600,
        2450,
        2100,
        1890,
        1850,
        2050,
        2700,
        2350,
        1980,
        2050,
        2200,
        2550
      ],
      "window": {
        "label": "11 – 18 mai 2026",
        "price": "R$ 1.850",
        "save": "31%",
        "note": "outono no deserto, noites frias e céu limpo para observar estrelas"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 1.850",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 2.020",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 1.990"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 2.080"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "San Pedro e arredores",
        "desc": "Dia de chegada, ambientação no vilarejo de adobe e uma ruína inca a poucos minutos a pé.",
        "pontos": [
          {
            "nome": "Iglesia San Pedro de Atacama",
            "nota": "construção de adobe e madeira de cardón do século XVII"
          },
          {
            "nome": "Pukará de Quitor",
            "nota": "fortaleza pré-inca sobre o vale, pôr do sol de cima"
          }
        ],
        "restaurante": "Adobe Restaurant",
        "restauranteNota": "salão a céu aberto com fogueira central, grelhados e pratos andinos"
      },
      {
        "n": 2,
        "titulo": "Valle de la Luna e Valle de Marte",
        "desc": "Tarde e entardecer nas formações rochosas mais conhecidas do deserto, com a luz baixa realçando o relevo.",
        "pontos": [
          {
            "nome": "Valle de la Luna",
            "nota": "dunas, Duna Mayor e as Três Marias"
          },
          {
            "nome": "Valle de Marte",
            "nota": "cânions avermelhados, menos concorrido que a Lua"
          }
        ],
        "restaurante": "Ckunna",
        "restauranteNota": "alta gastronomia andina com ingredientes do altiplano"
      },
      {
        "n": 3,
        "titulo": "Geysers del Tatio e Termas de Puritama",
        "desc": "Saída de madrugada para ver o campo geotérmico fumegando ao nascer do sol, seguida de banho termal na volta.",
        "pontos": [
          {
            "nome": "Geysers del Tatio",
            "nota": "campo geotérmico a 4.300 m, melhor visto ao amanhecer"
          },
          {
            "nome": "Termas de Puritama",
            "nota": "piscinas termais naturais em meio a um cânion"
          }
        ],
        "restaurante": "La Franchuteria",
        "restauranteNota": "padaria francesa no centro, boa opção para um brunch tardio pós-tour"
      },
      {
        "n": 4,
        "titulo": "Salar de Atacama e lagunas altiplânicas",
        "desc": "Dia dedicado ao salar, entre flamingos, lagunas para boiar e um pôr do sol sobre montanhas de mais de 5 mil metros.",
        "pontos": [
          {
            "nome": "Laguna Chaxa",
            "nota": "Reserva Nacional Los Flamencos, flamingos-andinos e flamingos-chilenos"
          },
          {
            "nome": "Laguna Cejar",
            "nota": "alta concentração de sal, flutua-se sem esforço"
          },
          {
            "nome": "Piedras Rojas ou Lagunas Miscanti e Miñiques",
            "nota": "mirantes a mais de 4.000 m, roteiro alterna conforme o dia"
          }
        ],
        "restaurante": "Baltinache",
        "restauranteNota": "cozinha de raiz atacamenha, quinoa, lhama e ervas do deserto"
      },
      {
        "n": 5,
        "titulo": "Manhã livre e despedida",
        "desc": "Última manhã em ritmo leve antes do traslado ao aeroporto de Calama.",
        "pontos": [
          {
            "nome": "Centro de San Pedro",
            "nota": "lojas de artesanato têxtil e pedras locais"
          },
          {
            "nome": "Passeio de bicicleta pelos arredores",
            "nota": "trilha plana até o Pukará ou a beira do rio San Pedro"
          }
        ],
        "restaurante": "Café Export",
        "restauranteNota": "sanduíches e café de especialidade, bom para o último almoço antes do voo"
      }
    ],
    "coords": {
      "lat": -22.9098,
      "lng": -68.1997
    }
  },
  "montevideu": {
    "id": "montevideu",
    "breadcrumb": "Montevidéu",
    "tag": "Cidade histórica · Uruguai",
    "titulo": "Montevidéu e Colonia del Sacramento em 5 dias",
    "resumo": "Mercado del Puerto, Rambla, Ciudad Vieja e um dia inteiro em Colonia.",
    "intro": "Montevidéu é uma capital que não corre: parrillas demoradas, uma orla de 22 quilômetros para caminhar e prédios art déco na Ciudad Vieja. Este roteiro reserva um dia inteiro para atravessar o Rio da Prata até Colonia del Sacramento, cidade colonial de calçamento de pedra e pôr do sol sobre o rio.",
    "heroFoto": "calçamento de pedra e prédios coloniais de Colonia del Sacramento ao entardecer",
    "heroSrc": "https://commons.wikimedia.org/wiki/Special:FilePath/Colonia%20de%20Sacramento.jpg",
    "heroCredit": "Colonia del Sacramento — Wikimedia Commons",
    "heroCreditHref": "https://commons.wikimedia.org/wiki/Category:Colonia_del_Sacramento",
    "preco": "R$ 1.290",
    "ctaVoos": "Buscar voos para Montevidéu",
    "ctaTitulo": "Montevidéu está chamando.",
    "meta": [
      {
        "k": "Duração",
        "v": "5 dias / 4 noites"
      },
      {
        "k": "Melhor época",
        "v": "set a nov e mar a mai"
      },
      {
        "k": "Voo de GRU",
        "v": "direto, 3h10"
      },
      {
        "k": "Base do roteiro",
        "v": "Ciudad Vieja / Pocitos"
      },
      {
        "k": "Atenção",
        "v": "pesos uruguaios no bolso pequeno; cartão internacional funciona bem"
      }
    ],
    "hospedagem": {
      "texto": "Ciudad Vieja põe a Plaza Independencia e o Mercado del Puerto do dia 1 a pé, num bairro histórico e movimentado de dia; Pocitos é mais residencial e fica na Rambla, perto da praia urbana do dia 2. A travessia para Colonia del Sacramento, no dia 4, sai de balsa do porto e funciona a partir de qualquer uma das duas."
    },
    "opt": {
      "destName": "Montevidéu (MVD)",
      "months": [
        2050,
        1980,
        1650,
        1420,
        1380,
        1290,
        1450,
        1320,
        1390,
        1580,
        1780,
        2200
      ],
      "window": {
        "label": "8 – 15 jun 2026",
        "price": "R$ 1.290",
        "save": "38%",
        "note": "inverno uruguaio, cidade tranquila e vinhos"
      },
      "sources": [
        {
          "name": "Aonde",
          "price": "R$ 1.290",
          "note": "12x sem juros · 5% no Pix",
          "best": true
        },
        {
          "name": "Google Flights",
          "price": "R$ 1.410",
          "note": "melhor tarifa encontrada"
        },
        {
          "name": "Kayak",
          "price": "R$ 1.380"
        },
        {
          "name": "Skyscanner",
          "price": "R$ 1.450"
        }
      ]
    },
    "dias": [
      {
        "n": 1,
        "titulo": "Ciudad Vieja",
        "desc": "O casco histórico a pé, entre praças, prédios centenários e o mercado mais famoso da cidade.",
        "pontos": [
          {
            "nome": "Plaza Independencia",
            "nota": "estátua equestre de Artigas e o Palacio Salvo ao fundo"
          },
          {
            "nome": "Palacio Salvo",
            "nota": "marco art déco de 1928, mirante no alto"
          },
          {
            "nome": "Mercado del Puerto",
            "nota": "galpão de ferro do século XIX cheio de parrillas"
          }
        ],
        "restaurante": "El Palenque",
        "restauranteNota": "parrilla tradicional dentro do Mercado del Puerto, carnes na brasa e frutos do mar"
      },
      {
        "n": 2,
        "titulo": "Rambla e bairros à beira-mar",
        "desc": "Caminhada pela orla até os bairros residenciais, no ritmo de quem mora ali.",
        "pontos": [
          {
            "nome": "Rambla de Montevideo",
            "nota": "22 km de orla contínua, cheia de gente correndo e tomando mate"
          },
          {
            "nome": "Pocitos",
            "nota": "praia urbana e prédios dos anos 1950"
          },
          {
            "nome": "Punta Carretas",
            "nota": "antigo presídio hoje é shopping, farol na ponta"
          }
        ],
        "restaurante": "Jacinto",
        "restauranteNota": "cozinha de mercado contemporânea, cardápio muda conforme a estação"
      },
      {
        "n": 3,
        "titulo": "Cultura e candombe",
        "desc": "Teatros, museus e o bairro que é berço do candombe uruguaio.",
        "pontos": [
          {
            "nome": "Teatro Solís",
            "nota": "teatro de 1856, o mais tradicional do país"
          },
          {
            "nome": "Museo Torres García",
            "nota": "obra do pintor construtivista uruguaio"
          },
          {
            "nome": "Barrio Sur e Palermo",
            "nota": "casas baixas onde nasceu o candombe, tambores nas ruas aos domingos"
          }
        ],
        "restaurante": "La Pulpería",
        "restauranteNota": "ambiente de boliche antigo, cozinha uruguaia sem pressa"
      },
      {
        "n": 4,
        "titulo": "Dia inteiro em Colonia del Sacramento",
        "desc": "Travessia de barco pelo Rio da Prata até a cidade colonial fundada pelos portugueses no século XVII.",
        "pontos": [
          {
            "nome": "Barrio Histórico",
            "nota": "Patrimônio da Humanidade, ruas de pedra irregular"
          },
          {
            "nome": "Calle de los Suspiros",
            "nota": "a rua mais fotografada da cidade"
          },
          {
            "nome": "Faro de Colonia",
            "nota": "vista da foz do rio e do casario ao pôr do sol"
          }
        ],
        "restaurante": "Charco Bistró",
        "restauranteNota": "terraço de frente para o rio, cozinha uruguaia contemporânea"
      },
      {
        "n": 5,
        "titulo": "Manhã livre e despedida",
        "desc": "Último passeio em ritmo de parque antes do voo de volta.",
        "pontos": [
          {
            "nome": "Parque Rodó",
            "nota": "lago, roda-gigante antiga e feira de fim de semana"
          },
          {
            "nome": "Feria de Tristán Narvaja",
            "nota": "feira de rua tradicional aos domingos, de livros a antiguidades"
          }
        ],
        "restaurante": "Francis",
        "restauranteNota": "parrilla e massas num salão clássico, bom para o almoço de despedida"
      }
    ],
    "coords": {
      "lat": -34.9011,
      "lng": -56.1645
    }
  }
};
