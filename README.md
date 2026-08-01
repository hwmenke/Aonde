# Aonde

Site de viagens brasileiro — passagens, roteiros e alertas de preço pelo
Brasil e América do Sul. Servido por um módulo Node.js autocontido: sem
framework, sem dependências de runtime, `node:http` puro no servidor e
`node:test` nos testes.

Este repositório é o produto inteiro: o front-end (páginas, roteiros,
mapa), o robô que escolhe a oferta do dia, e o módulo original de busca e
geração de links de afiliado (Travelpayouts, Awin, Hurb, Passagens Promo).

## Por que existe

Um agregador de passagens comum some no primeiro clique de "buscar" e
empurra o resto por conta própria. O Aonde tenta ser diferente em dois
pontos, os dois inegociáveis:

- **Nunca promete o que não entrega.** Preço de exemplo é rotulado como
  exemplo; desconto anunciado bate com a conta; nenhum carimbo de tempo
  fixo fingindo ser "agora"; nenhuma urgência fabricada.
- **Roteiro é conteúdo, não enfeite.** Cada guia tem dia a dia, restaurante
  do dia e conselho de hospedagem escrito para aquele destino específico —
  não uma frase-molde repetida.

## Requisitos

- Node.js **>= 18** (usa `fetch`, `AbortController`, `node:test` nativos)
- Nenhuma dependência de runtime a instalar

## Início rápido

```bash
git clone https://github.com/hwmenke/aonde.git
cd aonde
cp .env.example .env   # opcional — o site funciona sem nenhuma credencial
node --test             # 547 testes, sem rede real
node scripts/serve.js   # sobe o servidor (padrão: http://localhost:3333)
```

Sem nenhuma variável de ambiente configurada, o site inteiro funciona: as
ofertas e roteiros vêm do conteúdo editorial, o mapa cai para links de busca
do Google Maps, e o atendimento mostra só o telefone (sem WhatsApp). Cada
integração real (Travelpayouts, Google Maps, WhatsApp) liga sozinha assim
que a credencial correspondente aparece no `.env` — nunca trava a home por
falta de chave.

## Páginas

| Rota | O quê |
|---|---|
| `/` | Home — busca, achados do dia, estilos de viagem |
| `/hoje` | **A escolha do dia** — 1-2 ofertas com roteiro em tópicos, trocam por data |
| `/ofertas`, `/ofertas/:id` | Feed dos 18 achados de passagem e o detalhe de cada um, com histórico de preço |
| `/guias`, `/guias/:id` | Índice (com filtro por destino) e os 22 roteiros (dia a dia, onde comer, hospedagem) |
| `/resultados` | Busca de voos — ao vivo pela Amadeus quando há credencial, senão exemplos claramente rotulados |
| `/mapa` | Mapa de destinos (Google Maps, com fallback sem chave) |
| `/saida/:id`, `/saida/voo` | Interstitial "você está indo para o parceiro" antes de qualquer link de afiliado |
| `/ajuda`, `/cancelamentos`, `/alertas` | Central de ajuda, política de troca/cancelamento, alertas de preço (LGPD) |

## O robô da escolha do dia

`src/daily/dailyPick.js` decide 1-2 ofertas por dia entre as que **têm**
roteiro editorial correspondente, com rotação determinística: a mesma data
sempre dá a mesma escolha (cacheável, testável), e dois dias seguidos nunca
repetem o par. Roda pela página `/hoje` ou pela linha de comando:

```bash
node scripts/daily-pick.js                        # texto no terminal
node scripts/daily-pick.js --json                 # para e-mail/bot
node scripts/daily-pick.js --html saida.html       # arquivo HTML
node scripts/daily-pick.js --pesquisar "Ilhabela"  # pesquisa ao vivo (Google Places)
```

Para um destino sem roteiro editorial, `--pesquisar` busca no Google Places
(precisa de `GOOGLE_MAPS_API_KEY`); sem a chave, ele diz que não conseguiu
em vez de inventar conteúdo.

## Segurança, acessibilidade e SEO

- Rate limiting por IP nas rotas de escrita; validação de esquema
  (`http`/`https`) em todo redirecionamento de afiliado; headers de
  segurança (CSP, `X-Frame-Options`, `X-Content-Type-Options`) em toda
  resposta.
- `prefers-reduced-motion` desliga todo o movimento decorativo (fundo das
  estações, avião da marca, globo 3D); skip link; hierarquia de títulos
  correta; contraste AA verificado, não estimado.
- Tema claro e escuro: segue o sistema por `prefers-color-scheme` e aceita a
  escolha manual no botão do cabeçalho (guardada em `localStorage`, aplicada
  antes da primeira pintura para não piscar). Os dois temas foram medidos
  pixel a pixel — nenhum texto abaixo de AA em nenhum dos dois.
- Histórico de preço por rota como gráfico SVG com `role="img"` e
  `aria-label` contendo os números. Abaixo de 5 observações em 90 dias ele
  **não desenha curva**: diz que ainda está juntando dados, em vez de sugerir
  uma tendência que a amostra não sustenta.
- `canonical`, `og:image`/`og:url` por página, `sitemap.xml`, JSON-LD
  (Organization/WebSite/FAQPage/TouristTrip/Product) para busca e
  compartilhamento.
- CSS servido como asset com `Cache-Control: immutable` (hash no nome, não
  inline em cada página).

## Módulo de afiliados

A busca de ofertas e a geração de link para os quatro parceiros
pesquisados (Travelpayouts, Awin, Hurb/Clube Hurb, Parceiros
Promo/Passagens Promo) — incluindo o que cada um exige de cadastro,
aprovação e autenticação — está documentada em
[`docs/MODULO-AFILIADOS.md`](./docs/MODULO-AFILIADOS.md).

## Estrutura

```
src/
  render/      páginas HTML (htmlRenderer.js), conteúdo editorial, fotos
  daily/       robô da escolha do dia
  guides/      geração de roteiro ao vivo via Google Places
  newsletter/  double opt-in e alertas de preço (LGPD)
  partners/    integração com cada parceiro de afiliados
  store/       persistência local (histórico de preço, ofertas, cliques)
  server.js    servidor HTTP (node:http, zero framework)
scripts/       CLIs: render-samples, daily-pick, roteiro, serve
test/          node:test — 547 casos
samples/       páginas de amostra pré-renderizadas (abra direto no navegador)
docs/          pesquisa de parceiros, Google Places, handoff do protótipo
```

## Testes

```bash
node --test
```

547 testes, sem chamada de rede real (tudo mockado via `setFetchImpl` em
`src/http.js` ou servidor local em porta efêmera).

## Configuração

Veja [`.env.example`](./.env.example) — todo campo é comentado com onde
obter a credencial, o que ela habilita, e o que acontece sem ela.
