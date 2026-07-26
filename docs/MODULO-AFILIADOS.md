# Módulo de afiliados — detalhes técnicos

Módulo Node.js autocontido para geração de **links de afiliado de viagem** e
busca de **ofertas de passagens** para o Aonde.com.br. Cobre os quatro
parceiros pesquisados: **Travelpayouts**, **Awin**, **Hurb / Clube Hurb** e
**Parceiros Promo / Passagens Promo**.

Zero dependências de runtime: usa `fetch` nativo do Node.js e um loader de
`.env` implementado à mão (sem a dependência `dotenv`). Testes com o test
runner nativo `node:test` — nenhum teste bate na rede real.

## Visão geral dos parceiros

| Parceiro | Tem API pública? | Geração de link | Busca de ofertas | Autenticação | Aprovação prévia |
|---|---|---|---|---|---|
| **Travelpayouts** | Sim | Template `tp.media` (local) **ou** API `/links/v1/create` | Sim — Data API (`prices_for_dates`) | Header `X-Access-Token` + `marker` | Cadastro + adesão por marca (brand) |
| **Awin** | Sim | API Link Builder (`/linkbuilder/generate`) | Não (fora de escopo — só feeds/relatórios) | OAuth2 Bearer (token pessoal) | Aprovação na rede **e** por anunciante (ex.: Decolar) |
| **Hurb / Clube Hurb** | **Não** | Só painel manual ("Traquear URL") | Não | n/a (link já traqueado) | Cadastro + aprovação por e-mail |
| **Parceiros Promo / Passagens Promo** | **Não** | Só Portal do Afiliado + plugin WordPress | Não | n/a (código FRANQ embutido no link do portal) | Cadastro com aprovação **não garantida** |

Fonte completa da pesquisa, com links oficiais e ressalvas: veja
[`docs/PESQUISA-PARCEIROS.md`](./PESQUISA-PARCEIROS.md).

> **Sem scraping.** Este módulo só usa APIs oficiais documentadas
> (Travelpayouts, Awin) e links pré-gerados manualmente nos painéis dos
> parceiros que não expõem API pública (Hurb, Parceiros Promo). Nenhum
> formato de URL foi inventado para esses dois últimos.

## Requisitos

- Node.js **>= 18** (usa `fetch`, `AbortController`, `node:test` nativos)
- Nenhuma dependência de runtime a instalar

## Setup

```bash
cd aonde-affiliates
cp .env.example .env
# edite .env e preencha as credenciais que você já tiver
```

Variáveis de ambiente (todas opcionais individualmente — cada parceiro só
funciona se as suas estiverem presentes; ver comentários em `.env.example`
para onde obter cada uma):

- `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`
- `AWIN_API_TOKEN`, `AWIN_PUBLISHER_ID`, `AWIN_ADVERTISER_ID_DECOLAR`
- `HURB_TRACKED_LINK` (fallback global) e `HURB_TRACKED_LINKS_JSON` (registro
  opcional por rota/oferta — ver [Hurb / Clube Hurb](#hurb--clube-hurb))
- `PASSAGENS_PROMO_TRACKED_LINK` (fallback global) e
  `PASSAGENS_PROMO_TRACKED_LINKS_JSON` (registro opcional por rota/oferta —
  ver [Parceiros Promo / Passagens Promo](#parceiros-promo--passagens-promo-grupo-amo-promo))

## Rodando os testes

```bash
npm test
# equivalente a: node --test
```

Todos os testes usam mocks de `fetch` (via `setFetchImpl`/`resetFetchImpl`
em `src/http.js`) — nenhuma chamada de rede real é feita.

Não há workflow de CI configurado neste repositório ainda — rode
`node --test` localmente (ou `npm test`) antes de cada push.

## Verificando sua configuração

`validateConfig()` inspeciona **apenas** o ambiente (via `getConfig()`) e diz
quais parceiros já estão utilizáveis — **sem nenhuma chamada de rede**. Útil
para um endpoint de health, um script de diagnóstico ou só para conferir o
`.env` antes de subir.

```js
import { validateConfig } from "aonde-affiliates";

const health = validateConfig();

console.log(health.ready);         // ex.: ["travelpayouts", "awin"]
console.log(health.partial);       // utilizáveis com limitação
console.log(health.notConfigured); // sem credenciais

// Detalhe por parceiro, com o que falta e uma nota explicativa em pt-BR:
console.log(health.partners.travelpayouts);
// {
//   ready: false,
//   missing: ["TRAVELPAYOUTS_TOKEN"],
//   notes: "Geracao de links (template tp.media) funciona. Falta ..."
// }
```

Regras de classificação:

- **Travelpayouts** — `marker` habilita a geração de links (template
  `tp.media`); `token` habilita a busca de ofertas (Data API). Só um dos dois
  → `partial`; ambos → `ready`; nenhum → `notConfigured`.
- **Awin** — `AWIN_API_TOKEN` + `AWIN_PUBLISHER_ID` → `ready`. Sem
  `AWIN_ADVERTISER_ID_DECOLAR` continua `ready`, mas com nota (é preciso passar
  `options.advertiserId` em cada chamada).
- **Hurb** e **Parceiros Promo** — `ready` com um link global **ou** ao menos
  uma entrada no registro por rota/oferta. A geração do link continua manual no
  painel de cada parceiro.

## Uso

### `getDealLink(partner, options)`

Gera (Travelpayouts, Awin) ou recupera (Hurb, Passagens Promo) o link de
afiliado de um parceiro específico.

```js
import { getDealLink } from "./src/index.js";

// Travelpayouts — modo template (local, sem chamar API)
const tp = await getDealLink("travelpayouts", {
  destinationUrl: "https://www.aviasales.com/search/GRULIS0109",
  programId: 4114,       // ID do programa/marca (ex.: Aviasales)
  subId: "home-banner",  // opcional — tracking adicional
});
// tp => { ok: true, url: "https://tp.media/r?marker=...&p=4114&u=...", partner: "travelpayouts", method: "template" }

// Travelpayouts — modo API (requer TRAVELPAYOUTS_TOKEN)
const tpApi = await getDealLink("travelpayouts", {
  destinationUrl: "https://www.aviasales.com/search/GRULIS0109",
  useApi: true,
});

// Awin (Decolar via Link Builder)
const awin = await getDealLink("awin", {
  destinationUrl: "https://www.decolar.com/pacotes/promo-nordeste",
  campaign: "aonde-passagens",
  subId: "home-banner",
});

// Hurb — sem API; repassa o link já traqueado no painel (HURB_TRACKED_LINK)
const hurb = await getDealLink("hurb", {});
// hurb => { ok: true, url: "<link do .env>", partner: "hurb", method: "manual", source: "fallback-global" }
// ou, se não configurado: { ok: false, error: "HURB_TRACKED_LINK não configurado...", ... }

// Hurb — resolvendo por rota/oferta a partir do registro (HURB_TRACKED_LINKS_JSON)
const hurbRota = await getDealLink("hurb", { origin: "GRU", destination: "LIS" });
// hurbRota => { ok: true, url: "<link cadastrado para GRU-LIS>", ..., source: "registry:route" }

const hurbOferta = await getDealLink("hurb", { offerId: "oferta-123" });
// hurbOferta => { ok: true, url: "<link cadastrado para oferta-123>", ..., source: "registry:offerId" }

// Passagens Promo — idem, via PASSAGENS_PROMO_TRACKED_LINK /
// PASSAGENS_PROMO_TRACKED_LINKS_JSON (mesma ordem de prioridade)
const passagensPromo = await getDealLink("passagens-promo", {});
```

#### Geração em lote (Awin)

Para gerar vários links Awin de uma vez, use `getDealLinksAwinBatch(items,
options)`, que usa o endpoint de lote da Awin
(`POST /publishers/{publisherId}/linkbuilder/generate-batch`, até 100 links por
chamada). Acima de 100 itens, a lista é dividida automaticamente em chunks de
100 enviados em chamadas sequenciais — **cada** chamada consome uma ficha do
rate limit de 20/min (aplicado pela camada HTTP). O resultado é item a item, na
mesma ordem de entrada; a falha de um item não invalida os demais.

```js
import { getDealLinksAwinBatch } from "./src/index.js";

const result = await getDealLinksAwinBatch([
  { destinationUrl: "https://www.decolar.com/pacotes/nordeste", clickref: "banner-1" },
  { destinationUrl: "https://www.decolar.com/hoteis/rio", advertiserId: "789", campaign: "promo-rio" },
]);
// result => {
//   ok: true, partner: "awin", method: "api-batch",
//   succeeded: 2, failed: 0,
//   results: [
//     { ok: true, url: "https://www.awin1.com/...", index: 0, destinationUrl: "https://www.decolar.com/pacotes/nordeste" },
//     { ok: true, url: "https://www.awin1.com/...", index: 1, destinationUrl: "https://www.decolar.com/hoteis/rio" },
//   ],
// }
```

`advertiserId` é opcional por item (default: `AWIN_ADVERTISER_ID_DECOLAR`).
Credencial ausente, `items` vazio ou resposta em formato inesperado retornam
`{ ok: false, partner: "awin", method: "api-batch", error }`. `ok` geral é
`true` desde que a(s) chamada(s) HTTP tenham funcionado, mesmo com itens
individuais falhos.

### `searchDeals(options)` / `searchDealsSafe(options)`

Busca ofertas de passagens em cache via **Travelpayouts Data API**
(`GET /aviasales/v3/prices_for_dates`). É o único parceiro com API pública
de busca de ofertas — por isso `searchDeals` usa exclusivamente o
Travelpayouts. `searchDealsSafe` é um alias explícito: `searchDeals` já
nunca lança exceção (toda falha vira `{ ok: false, error }`).

```js
import { searchDeals } from "./src/index.js";

const result = await searchDeals({
  origin: "GRU",
  destination: "LIS",
  dateFrom: "2026-09-01", // YYYY-MM-DD ou YYYY-MM
  dateTo: "2026-09-10",
  currency: "BRL",
  limit: 20,
});

// result => {
//   ok: true,
//   partner: "travelpayouts",
//   deals: [
//     {
//       origin: "GRU", destination: "LIS",
//       departDate: "2026-09-01T10:00:00", returnDate: "2026-09-10T10:00:00",
//       price: 3200, currency: "BRL", airline: "TP", flightNumber: "77",
//       transfers: 0,
//       foundAt: "2026-07-20T00:00:00", expiresAt: "2026-07-27T00:00:00",
//       link: "https://tp.media/r?marker=...&p=4114&u=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2F...",
//     },
//   ],
//   error: null,
// }
```

Cada `deal.link` já sai com o `marker` de afiliado aplicado (via
`tp.media`), pronto para publicação no site.

### `searchDealsByPriceRange(options)`

Busca **achados abaixo de um teto de preço** — o caso de uso central de um
site de curadoria de ofertas ("tudo saindo de GRU por menos de R$ 2.000").
Usa `GET /aviasales/v3/search_by_price_range` da Data API do Travelpayouts,
com a mesma autenticação (`X-Access-Token`) e o **mesmo shape de `deal`** de
`searchDeals`.

```js
import { searchDealsByPriceRange } from "./src/index.js";

const result = await searchDealsByPriceRange({
  origin: "GRU",
  priceMax: 2000,       // OBRIGATÓRIO — o teto de preço (razão de ser do endpoint)
  destination: "LIS",   // opcional — omita para busca aberta por origem
  priceMin: 500,        // opcional — piso de preço
  currency: "BRL",
  oneWay: false,        // opcional
  direct: false,        // opcional
  limit: 30,
  page: 1,
});

// result => { ok: true, partner: "travelpayouts", deals: [ /* mesmo shape de searchDeals */ ], error: null }
```

- `priceMax` é obrigatório; sem ele o retorno é `{ ok: false, error: "priceMax é obrigatório…" }`.
- `destination` é opcional (a ausência é tratada de forma tolerante — o
  parâmetro simplesmente não é enviado).
- Mesmas garantias de resiliência de `searchDeals`: credencial ausente, erro
  de rede, HTTP não-2xx ou `success:false` retornam `{ ok: false, deals: [],
  error }` sem lançar exceção.

### `searchDealsAllPages(options)`

Agrega **várias páginas** da Data API (`prices_for_dates`) numa única lista
de `deals`. A Data API pagina via o parâmetro `page`; este helper varre
página a página a partir da 1.

```js
import { searchDealsAllPages } from "./src/index.js";

const result = await searchDealsAllPages({
  origin: "GRU",
  destination: "LIS",
  limit: 30,
  maxPages: 5,   // teto de segurança (default 5)
});

// result => { ok: true, partner: "travelpayouts", deals: [ /* de todas as páginas */ ], error: null }
// Se a paginação for interrompida no meio por uma falha:
// result => { ok: true, deals: [ /* páginas já coletadas */ ], warning: "Paginação interrompida na página 3: …" }
```

- Aceita os mesmos `options` de `searchDeals` mais `maxPages` (default **5**).
  O `page` informado é ignorado (o helper controla a paginação).
- **Para de varrer** quando uma página vem vazia ou com menos itens que
  `limit` (heurística de última página), ou ao atingir `maxPages`.
- **Tolerância a falha intermediária:** se uma página *após a 1ª* falhar, o
  retorno é `{ ok: true, deals: <já coletados>, warning: "…" }` — o que já
  veio **não** é descartado. Se a **primeira** página falhar, propaga o erro
  (`{ ok: false, deals: [], error }`).
- **Rate limit:** cada página é uma requisição e consome a cota da Data API
  (**~200 requisições/hora por IP**). Ajuste `maxPages` e a frequência das
  chamadas de acordo — o módulo não faz throttling automático.

### `toOffer(deal, options)` / `toOffers(deals, options)`

Adapter que traduz um `deal` (item do array `deals` de `searchDeals()`) para
um objeto `Offer` **parcial**, no formato de domínio usado pelo backend de
curadoria do Aonde (feed de ofertas). `toOffers` é a versão em lote,
aplicando as mesmas `options` a todos os itens de `deals`.

```js
import { searchDeals, toOffers } from "./src/index.js";

const result = await searchDeals({ origin: "GRU", destination: "LIS" });

// mediaCentavos e opcional — normalmente viria de um job separado de
// monitoramento de tarifas (ver ressalva abaixo)
const offers = toOffers(result.deals, { mediaCentavos: 400000 });

// offers => [
//   {
//     id: "gru-lis",
//     origem: "GRU", destino: "LIS",
//     tipo: "Internacional",
//     cia: "TAP",
//     preco_centavos: 320000,
//     media_centavos: 400000,
//     desconto_pct: 20,
//     economia_centavos: 80000,
//     is_erro_tarifa: false,
//     datas_sugeridas: "01–10 set",
//     affiliate_url: "https://tp.media/r?marker=...",
//     thumb_url: null,
//     status: "rascunho",
//   },
// ]
```

O campo `thumb_url` sai como `null` por padrão (`toOffer` é **puro/síncrono** e
nunca faz rede). Você pode passar uma imagem já conhecida via
`options.thumbUrl`, ou preencher a imagem real de destino a partir do Wikimedia
Commons com `enrichOfferWithImage` (ver seção
[Imagens de destino (Wikimedia Commons)](#imagens-de-destino-wikimedia-commons)).

**Campos do `Offer` completo que este adapter NÃO preenche** — exigem
curadoria editorial humana ou dados que este módulo não tem (lookup
geográfico, textos, histórico de preços):

- `cidade`, `local` — dependem de um lookup geográfico por código IATA
- `texto`, `dicas` — redação editorial
- `prova_url` — upload/curadoria de imagem de comprovação (print do preço)
- `datas_flex` — datas alternativas com preço, fora do escopo de uma única busca
- `published_at`, `expires_at` — controlados pelo fluxo de publicação/curadoria
- `created_by` — usuário responsável pela curadoria

Ficam de fora da responsabilidade deste módulo — cabe ao chamador
completá-los antes de persistir/publicar a oferta.

`desconto_pct` e `economia_centavos` só são calculados quando `options.
mediaCentavos` é informado explicitamente: este módulo não tem banco de
dados histórico de preços — quem calcula a média histórica de uma rota é um
job separado ("monitor de tarifas"), fora de escopo aqui. Sem
`mediaCentavos`, ambos os campos saem como `null`.

### `getAllDealLinks(options)`

Roda `getDealLink` para os 4 parceiros em paralelo com `Promise.allSettled`,
isolando falhas: um parceiro sem credencial ou com erro de rede **nunca**
impede os demais de retornar seu resultado.

```js
import { getAllDealLinks } from "./src/index.js";

const links = await getAllDealLinks({
  destinationUrl: "https://www.decolar.com/pacotes/promo-nordeste",
  programId: 4114,
});
// links => {
//   travelpayouts: { ok: true|false, ... },
//   awin:          { ok: true|false, ... },
//   hurb:          { ok: true|false, ... },
//   "passagens-promo": { ok: true|false, ... },
// }
```

## Imagens de destino (Wikimedia Commons)

Preenche as ofertas e destinos com **imagens reais** usando a
[MediaWiki Action API](https://www.mediawiki.org/wiki/API:Main_page) oficial —
**gratuita, sem chave de API** — buscando primeiro na Wikipedia em português
(`pt.wikipedia.org`) e caindo no [Wikimedia Commons](https://commons.wikimedia.org)
como fallback. Sem scraping: usa apenas a API pública.

As funções vivem em `src/images/wikimediaProvider.js` e são reexportadas por
`src/index.js`. Todas são **resilientes** (nunca lançam exceção).

### `getDestinationImage({ query, lang, width })`

Busca uma imagem representativa de um destino e seus metadados de atribuição.

```js
import { getDestinationImage } from "./src/index.js";

const img = await getDestinationImage({ query: "Lisboa", width: 1200 });
// img => {
//   ok: true,
//   imageUrl: "https://upload.wikimedia.org/.../Lisboa.jpg",
//   thumbUrl: "https://upload.wikimedia.org/.../1200px-Lisboa.jpg",
//   width: 1200, height: 800,
//   attribution: {
//     author: "Maria Silva",           // limpo de HTML
//     license: "CC BY-SA 4.0",
//     licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
//     credit: "Wikimedia Commons",
//     sourceUrl: "https://commons.wikimedia.org/wiki/File:Lisboa.jpg",
//   },
//   error: null,
// }
```

Sem resultado → `{ ok: false, error: "Nenhuma imagem encontrada no Wikimedia para '...'" }`.

Internamente faz **1–2 chamadas** por destino: (1) `generator=search` +
`prop=pageimages` para achar a página mais relevante e sua imagem principal;
(2) `prop=imageinfo&iiprop=extmetadata` sobre o arquivo, para extrair
`LicenseShortName`, `LicenseUrl`, `Artist` (que pode vir com HTML — as tags são
removidas) e `Credit`.

### Integração no pipeline de ofertas

```js
import { searchDeals, toOffers, enrichOffersWithImages } from "./src/index.js";

const { deals } = await searchDeals({ origin: "GRU", destination: "LIS" });
const offers = toOffers(deals);                       // thumb_url: null
const withImages = await enrichOffersWithImages(offers); // preenche thumb_url + thumb_attribution
```

- `enrichOfferWithImage(offer, { query, lang, width })` — devolve uma **cópia**
  do offer com `thumb_url` e `thumb_attribution` preenchidos. `query` default =
  `offer.cidade || offer.destino`. Em falha (rede ou sem imagem), devolve o
  offer **inalterado**.
- `enrichOffersWithImages(offers, opts)` — mapeia com `Promise.allSettled`,
  **isolando falhas** por oferta (uma que falha não derruba as demais).

Estas funções fazem **rede** (1–2 chamadas por oferta) e por isso são `async` e
ficam **separadas** de `toOffer` (que continua puro/síncrono). Use-as no
**pipeline de curadoria/build**, nunca no hot path de request.

### Atribuição e licença (OBRIGATÓRIO)

As imagens do Commons são livres, mas o uso **exige atribuir autor + licença**.
Ao exibir uma imagem, mostre o `attribution.author`, o `attribution.license`
(com link para `licenseUrl`) e um link para `sourceUrl` (a página do arquivo no
Commons). Exemplo de legenda: *"Foto: Maria Silva / CC BY-SA 4.0 (via Wikimedia
Commons)"*.

### Etiqueta da Wikimedia

- **User-Agent obrigatório**: toda chamada envia o header
  `User-Agent: Aonde-Affiliates/1.0 (...)`. A
  [política da Wikimedia](https://meta.wikimedia.org/wiki/User-Agent_policy)
  exige um User-Agent descritivo — requisições sem ele podem receber HTTP 403.
- **Não martelar**: ~1 destino por vez no build; o provider já se limita a 1–2
  chamadas por destino.

### Cache

As URLs de imagem do Wikimedia (`upload.wikimedia.org`) são **estáveis e livres**
(com atribuição) — logo, **cacheáveis com segurança**. Diferente do cliente da
Places API do Google (que força `cacheTtlMs: 0` por política), este provider
**não** desliga o cache do `http.js`. Observação: a heurística atual do `http.js`
só cacheia por padrão a Data API do Travelpayouts, então na prática as respostas
do Wikimedia não ficam em cache hoje — mas seriam seguras de cachear.

## Curadoria: histórico, monitoramento e API

Esta camada **fecha o ciclo da curadoria**: constrói um histórico de preços por
rota, roda um job de monitoramento que gera rascunhos de ofertas, sinaliza
suspeitas de erro de tarifa para triagem humana e expõe tudo por uma API REST
zero-dependência.

> **Fonte dos dados.** O histórico é construído **com dados do Travelpayouts**
> (Data API — preços em cache). Não há API oficial do Google Flights, e
> **scraping está fora de escopo**. A média histórica de uma rota é, portanto,
> tão boa quanto a frequência com que o monitor roda e a cobertura do
> Travelpayouts para aquela rota.

Todos os dados são persistidos em arquivos JSON no diretório configurável por
`AONDE_DATA_DIR` (default `aonde-affiliates/data/`, já no `.gitignore` da raiz —
**nunca faça commit desses dados**). Zero dependências: nada de banco externo
nem `node:sqlite` (indisponível no Node 20 do CI).

### Histórico de preços — `recordPrices` / `getRouteStats` / `listRoutes`

```js
import { recordPrices, getRouteStats, listRoutes, searchDeals } from "aonde-affiliates";

const { deals } = await searchDeals({ origin: "GRU", destination: "LIS" });
recordPrices(deals); // grava 1 observação por deal em data/history/GRU-LIS.json

// Estatística da rota sobre uma janela de tempo (default 90 dias, mín. 5 amostras):
const stats = getRouteStats("GRU", "LIS", { windowDays: 90 });
// stats => { ok: true, route: "GRU-LIS", mediaCentavos, minCentavos, maxCentavos, sampleCount, windowDays }
// (ok:false com erro claro quando não há amostras suficientes)

listRoutes(); // => ["GIG-EZE", "GRU-LIS", ...] rotas com histórico
```

Preços são convertidos para centavos com o **mesmo critério do `offerAdapter`**
(`Math.round(price * 100)`). A escrita é **atômica** (arquivo temporário +
rename) e **tolerante a corrupção**: um arquivo de histórico inválido gera um
aviso no stderr e recomeça vazio, sem derrubar o processo.

### Detecção de erro de tarifa — `detectFareError`

`detectFareError` é uma **heurística de triagem**, não uma verdade — serve para
_sinalizar_ candidatos à curadoria humana. **O módulo nunca publica nada
sozinho**; a curadoria decide.

```js
import { detectFareError } from "aonde-affiliates";

detectFareError(
  { precoCentavos: 30000, mediaCentavos: 100000, sampleCount: 12 },
  { minDiscountPct: 60, minSamples: 10 } // defaults
);
// => { isFareError: true, discountPct: 70, reason: "Suspeita de erro de tarifa: ..." }
```

Regra: só sinaliza (`isFareError: true`) quando há **amostra suficiente**
(`sampleCount >= minSamples`) **E** o desconto sobre a média histórica atinge o
limiar (`discountPct >= minDiscountPct`). Quando **não** sinaliza, o `reason`
explica o porquê (ex.: `"amostra insuficiente"`, `"desconto abaixo do limiar"`,
`"sem media historica valida"`) — evitando falso positivo em cima de pouca
informação.

### Job de monitoramento — `runMonitor` + `scripts/monitor.js`

`runMonitor` percorre as rotas **sequencialmente** (respeitando o rate limiter
da camada HTTP): busca deals, grava no histórico, calcula a estatística e gera
um **rascunho de `Offer`** para o melhor (menor) preço de cada rota, aplicando
`is_erro_tarifa`. É **resiliente por rota** — uma rota que falha não interrompe
as demais — e persiste os rascunhos no `offersStore` com **upsert por id** (não
duplica a cada rodada; atualiza preço/timestamp se a oferta já existe).

```js
import { runMonitor } from "aonde-affiliates";

const result = await runMonitor({
  routes: [
    { origin: "GRU", destination: "LIS" },
    { origin: "GRU", destination: "MIA" },
  ],
  currency: "BRL",
  windowDays: 90,          // opcional
  draftStatus: "rascunho",
  mediaFallback: "amadeus", // opcional; default "none" (ver "Amadeus" abaixo)
});
// result => { ok, offers: [...], perRoute: { "GRU-LIS": { ok, dealsFound, statsUsed, statsSource, mediaCentavos, isFareError }, ... }, startedAt, finishedAt }
```

`statsSource` indica de onde veio a média usada na oferta: `"own-history"`
(histórico próprio confiável), `"amadeus-median"` (fallback da Amadeus) ou
`null` (nenhuma média disponível). Ver a seção **Amadeus** abaixo.

Pela linha de comando:

```bash
node scripts/monitor.js --routes GRU-LIS,GRU-MIA,GIG-EZE --currency BRL
# imprime resumo em pt-BR: rotas ok/falhas, ofertas geradas e suspeitas de erro de tarifa

# com fallback de média típica de rota pela Amadeus (exige credenciais Amadeus):
node scripts/monitor.js --routes GRU-LIS,GRU-MIA --media-fallback amadeus
```

Os rascunhos gerados ficam em `data/offers.json` — **revise na curadoria antes
de publicar**.

#### Agendando o monitor (cron / GitHub Actions)

O monitor não tem loop próprio — cada execução é um processo isolado (sem cache
compartilhado entre rodadas, o que é o comportamento correto). Agende como
preferir. **Respeite o rate limit da Data API (~200 req/hora por IP)** ao
escolher a frequência e o número de rotas.

Via **cron** (a cada 6 horas, por exemplo):

```cron
0 */6 * * * cd /caminho/para/aonde-affiliates && /usr/bin/node scripts/monitor.js --routes GRU-LIS,GRU-MIA,GIG-EZE >> monitor.log 2>&1
```

Via **GitHub Actions**: o workflow **`.github/workflows/monitor.yml`** já vem
pronto no repositório. Ele roda a cada 6 horas (`cron: "0 */6 * * *"`) e também
pode ser disparado manualmente.

**Secrets a configurar** (Settings → Secrets and variables → Actions):

| Secret | Obrigatório | Uso |
|---|---|---|
| `TRAVELPAYOUTS_TOKEN` | sim | token da Data API do Travelpayouts |
| `TRAVELPAYOUTS_MARKER` | sim | marker de afiliado |
| `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` | opcional | parceiro Amadeus (se habilitado) |

Sem os secrets do Travelpayouts o workflow **não falha**: um step de _guard_
avisa em pt-BR que os secrets precisam ser configurados e o job encerra com
sucesso, sem tentar rodar o monitor (não polui o histórico do Actions com
falhas vermelhas em quem só clonou o repo).

**Disparo manual com rotas customizadas** (aba Actions → _Monitor de tarifas_ →
_Run workflow_): preencha o input `routes` com uma lista como
`GRU-LIS,GRU-CDG,GIG-LIS`. Vazio = lista padrão
(`GRU-LIS,GRU-MIA,GRU-SCL,GIG-EZE,GRU-MCO`). No agendamento (schedule) sempre
usa a lista padrão.

**Baixar o relatório de ofertas:** cada rodada publica `data/offers.json` como
_artifact_ chamado **`offers`** (retenção de 30 dias). Abra a execução na aba
Actions e baixe o artifact para revisar os rascunhos na curadoria.

**Persistência do histórico entre execuções (cache).** Como `data/` está no
`.gitignore` e o runner é efêmero, o workflow usa `actions/cache` para carregar
o histórico de uma rodada para a próxima. A mecânica evita a armadilha clássica
do **cache com chave fixa** (que nunca é atualizado após o primeiro save): a
chave é única por execução (`monitor-data-${{ github.run_id }}`) com
`restore-keys: monitor-data-` — cada rodada **restaura** o cache mais recente
por prefixo e **salva** um cache novo ao final, de modo que o histórico sempre
acumula.

> **Limitação do cache.** Caches do Actions expiram após ~**7 dias** sem uso e
> o repositório tem cota total de **10 GB** (com _eviction_ LRU). Para
> **produção séria**, não dependa do cache: aponte `AONDE_DATA_DIR` para um
> **storage real** (bucket S3, volume persistente ou banco) para acumular o
> histórico de forma confiável ao longo do tempo.

### Amadeus — preço típico de rota

O histórico próprio (Travelpayouts + `recordPrices`) leva **semanas** para juntar
as 5 observações mínimas que `getRouteStats` exige. A **Amadeus Flight Price
Analysis API** dá a referência estatística de preço (distribuição em quartis)
**imediatamente**, com um único GET — é a fonte oficial de "preço típico de rota"
do módulo. (Não existe API oficial do Google Flights; ver `docs/PESQUISA-GOOGLE.md`.)

Configure as credenciais no `.env` (tier gratuito em
[developers.amadeus.com](https://developers.amadeus.com/), Self-Service):

```bash
AMADEUS_CLIENT_ID=...
AMADEUS_CLIENT_SECRET=...
# AMADEUS_ENV=test        # "test" (sandbox, default) ou "production"
```

Consulta direta (valores dos quartis em **centavos**):

```js
import { getTypicalPrices } from "aonde-affiliates";

const r = await getTypicalPrices({
  origin: "GRU",
  destination: "LIS",
  departureDate: "2026-09-01", // obrigatória, YYYY-MM-DD
  currency: "BRL",             // opcional (default BRL)
  oneWay: false,               // opcional
});
// r => { ok, partner: "amadeus", route: "GRU-LIS",
//        quartiles: { min, first, median, third, max }, // centavos
//        currency, oneWay, error }
```

Sem credenciais, `getTypicalPrices` retorna `ok:false` com instrução em pt-BR (não
lança exceção). O token OAuth2 é obtido e **cacheado internamente** (renovado só
quando expira).

**Papel de fallback no monitor:** passe `mediaFallback: "amadeus"` a `runMonitor`
(ou `--media-fallback amadeus` no CLI). Quando o histórico próprio de uma rota
ainda não é confiável **e** há credenciais Amadeus, o monitor usa a **mediana** dos
quartis como média da rota (para calcular `desconto_pct`/`economia_centavos` do
rascunho), marcando `statsSource: "amadeus-median"`. Uma falha da Amadeus **não
derruba a rota** — ela apenas segue sem média. A detecção de erro de tarifa
(`is_erro_tarifa`) continua exigindo histórico próprio com contagem de amostra: a
mediana da Amadeus, por não trazer `sampleCount`, nunca sinaliza erro de tarifa
sozinha (decisão conservadora).

> **Status a-validar:** o *shape* exato da resposta da Amadeus não pôde ser
> confirmado neste ambiente (docs oficiais retornaram 403). O parsing é
> **tolerante** e, em formato inesperado, devolve `ok:false` com o corpo resumido.
> Ver `docs/PESQUISA-PARCEIROS.md` (seção Amadeus).

### API REST — `createServer` + `scripts/serve.js`

Servidor **zero-dependência** (`node:http`, sem framework). `createServer()`
retorna o `http.Server` **sem** dar `listen` (facilita testes com porta 0).
Todo request é tratado com `try/catch` — nunca derruba o processo. JSON sempre;
erros com `{ error }` e status apropriado.

```bash
node scripts/serve.js            # sobe na porta AONDE_PORT (default 3333)
AONDE_PORT=8080 node scripts/serve.js
```

Endpoints:

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/` | **página inicial** (HTML) — hero, ofertas da semana, roteiros |
| `GET` | `/ofertas` (`?origem=GRU`) | **feed de ofertas** (HTML) + filtro de origem |
| `GET` | `/ofertas/:id` | **detalhe da oferta** (HTML) |
| `GET` | `/resultados` | **resultados de voo** (HTML) — dados de amostra (sem busca ao vivo ainda) |
| `GET` | `/mapa` | **mapa-múndi** (HTML) — Google Maps com um pin clicável por roteiro |
| `GET` | `/guias` | **índice de roteiros** (HTML) — os 22 destinos |
| `GET` | `/guias/:id` | **guia/roteiro editorial** (HTML) — ex.: `/guias/salvador` |
| `GET` | `/saida/:id` | **interstitial de saída** (HTML) — registra o clique e redireciona ao parceiro |
| `GET` | `/ajuda` | **central de ajuda / FAQ** (HTML) |
| `GET` | `/cancelamentos` | **trocas e cancelamentos** (HTML) |
| `GET` | `/alertas` | **gerenciar inscrição** (HTML) — descadastro self-service |
| `GET` | `/api/health` | `validateConfig()` + contagem de rotas/ofertas armazenadas |
| `GET` | `/api/offers?status=rascunho` | lista do offersStore (sem `status` = todas) |
| `GET` | `/api/offers/:id` | oferta ou `404` JSON |
| `POST` | `/api/offers/:id/click` | registra o clique e responde `{ redirect: affiliate_url }` |

```bash
# health
curl http://localhost:3333/api/health

# lista de rascunhos
curl "http://localhost:3333/api/offers?status=rascunho"

# uma oferta (404 JSON se não existir)
curl http://localhost:3333/api/offers/gru-lis

# registra o clique -> { "redirect": "https://tp.media/r?..." }
curl -X POST http://localhost:3333/api/offers/gru-lis/click
```

`POST /click` registra o clique em `data/clicks.jsonl` (append: `id`,
`timestamp`, `user-agent`) e responde `200` com `{ redirect: affiliate_url }`
— **o front decide redirecionar** (contrato do handoff do produto). Responde
`404` se a oferta não existe e `409` se a oferta não tem `affiliate_url`.

**CORS:** habilitável via `AONDE_CORS_ORIGIN` (ex.: `https://aonde.com.br`).
Ausente/em branco = **nenhum** header CORS.

### Front-end — páginas portadas do protótipo

As rotas HTML (`/`, `/ofertas`, `/ofertas/:id`, `/guias/:id`) são a **porta
fiel do protótipo de design** entregue em `docs/handoff/design/Aonde.dc.html`.
O protótipo era um *design canvas* (runtime React proprietário, com
`{{ mustache }}`, `<image-slot>`, `<sc-for>`/`<sc-if>` e um seletor de telas
`<x-dc>`) — aqui o **mesmo markup, seções, copy e design tokens** viram HTML de
produção (`src/render/htmlRenderer.js`), com `{{ }}` → dados escapados,
`<image-slot>` → `<img>` resiliente (fallback SVG via `onerror`) e a navegação
por estado → **URLs reais**.

- **Dados ao vivo × curadoria editorial:** o feed e o detalhe usam as ofertas
  publicadas do `offersStore`; quando o store está vazio, caem para a curadoria
  editorial em `src/render/aondeContent.js` (as páginas **sempre** renderizam,
  mesmo offline ou sem credenciais de imagem). Os guias/roteiros e as seções da
  home vêm dessa curadoria; a página de roteiro também aceita a saída ao vivo de
  `buildItinerary` (Google Places) via `renderItineraryPage`.
- **Roteiros editoriais (22 destinos):** 10 guias-base + 12 escritos por agentes
  de turismo, um por região (Nordeste, Sudeste/Sul, Centro-Oeste/Norte, América
  do Sul), consolidados em `src/render/moreGuides.js` e mesclados em `GUIDES` /
  `GUIDE_LIST` / `GUIDE_COORDS`. Cada roteiro tem 5 dias (dia a dia, com onde
  comer), coordenadas para o pin no mapa e mais três recursos na página:
    - **Círculo das estações:** uma roda SVG de 12 meses colorida por preço
      (barato→caro), com as 4 estações do Hemisfério Sul e a melhor época no
      centro. É SVG inline — renderiza offline e no preview, sem rede.
    - **Datas para viajar:** algumas janelas de data (a melhor + os meses mais
      baratos) que o cliente clica para reservar (CTA leva ao fluxo de voos).
    - **Mini-mapa do destino:** Google Maps centrado no destino (mesma
      `GOOGLE_MAPS_API_KEY`); sem chave, cai para um placeholder com link para
      o mapa-múndi.
- **Progressive enhancement:** um JS leve embutido melhora o carrossel do hero,
  as abas e a inscrição da newsletter (POST para `/api/newsletter/subscribe`),
  mas as páginas funcionam sem ele (links e forms reais).
- **Mapa-múndi (`/mapa`):** mapa interativo do **Google Maps JavaScript API**
  com um pin clicável por roteiro (o balão abre o guia em `/guias/:id`). Usa a
  **mesma** `GOOGLE_MAPS_API_KEY` do gerador de roteiros — basta ativar a *Maps
  JavaScript API* no mesmo projeto do Google Cloud e restringir a chave por
  referrer no console. **Sem** a chave, `/mapa` cai para uma lista de destinos
  clicável (ainda navegável) com um aviso de configuração — por isso as amostras
  e os testes não fazem rede. As coordenadas dos destinos estão em
  `GUIDE_COORDS` (`src/render/aondeContent.js`).
- **Venda e pós-venda (auditoria por 4 agentes → correções):**
    - *Clique de compra:* o CTA da oferta ao vivo passa por `/saida/:id`, que
      **registra o clique** (`recordClick`) e resolve o link do parceiro numa
      página de transição ("Você está indo para…"). Antes, o CTA pulava o
      tracking ou caía numa rota POST-only (erro 405). Ofertas editoriais (sem
      `affiliate_url`) levam à busca de voos da rota — não fingem ir a um
      parceiro inexistente.
    - *Integridade:* a etiqueta "captura de tela" só aparece com um print real
      (`prova_url`); a comparação com concorrentes ganhou disclaimer de coleta
      manual; o WhatsApp só é oferecido com um número real (`AONDE_WHATSAPP`) —
      senão o site usa o telefone por voz, sem prometer um canal que não
      responde. Todo badge "erro de tarifa" traz o aviso de risco.
    - *Captação:* faixa de alerta de preço na home, nos roteiros, no detalhe da
      oferta e em `/resultados`; `subscribe` aceita rota/preço-alvo opcionais e
      o **alerta real** (`AlertRule`) nasce automaticamente após o double
      opt-in (`pending_alert` → `addAlertRule`).
    - *Suporte/pós-venda:* páginas reais `/ajuda`, `/cancelamentos` e `/alertas`
      (descadastro self-service); o link de confirmação de opt-in devolve HTML
      no navegador quando aberto pelo browser (antes, JSON cru).
    - **Não implementado de propósito** (sem base técnica honesta hoje):
      garantia de queda de preço pós-compra, e-mail/WhatsApp automático pós-viagem
      e avaliações de clientes — todos dependem de postback de conversão e/ou
      provedor de envio que o módulo ainda não tem. Ver os relatórios da auditoria.

```bash
node scripts/render-samples.js   # gera samples/ (index, ofertas, oferta, guia, roteiro)
```

As amostras em `samples/` são **autocontidas** (CSS inline, fallback de imagem
embutido) — abrem no navegador mesmo offline.

## Newsletter e alertas de preço (LGPD)

Captação de assinantes para **alertas de preço** com **double opt-in** e
registro de consentimento — a base técnica para operar em conformidade com a
**LGPD**. Zero-dependência, mesmos stores JSON atômicos do restante do módulo.
Código em `src/newsletter/`.

### Fluxo de double opt-in

1. **Inscrição** (`POST /api/newsletter/subscribe`): cria o assinante como
   **pendente** (`double_optin_confirmed: false`, `consent_lgpd_at: null`) e gera
   um `optin_token` aleatório (32 bytes) com validade de **48h**. O token
   **nunca** aparece na resposta HTTP — em produção iria no corpo do e-mail de
   confirmação.
2. **Confirmação** (`GET /api/newsletter/confirm?token=…`): o assinante clica no
   link do e-mail; o token válido marca `double_optin_confirmed: true` e
   **registra o consentimento** (`consent_lgpd_at` = agora). O token é de uso
   único (apagado na confirmação).
3. **Alertas**: só a partir daí o assinante pode criar regras de alerta e casar
   ofertas.

### Contratos REST

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/newsletter/subscribe` | dispara double opt-in → `{ status: "pending_optin" }` (ou `"already_confirmed"`) |
| `GET` | `/api/newsletter/confirm?token=…` | confirma o opt-in → `200 { ok, message }` ou `400` |
| `POST` | `/api/newsletter/unsubscribe` | descadastro idempotente → `200` (não revela se o e-mail existia) |
| `POST` | `/api/alerts` | cria regra de alerta para assinante confirmado → `201` (ou `404`/`409`) |

```bash
# 1. Inscrição (token NÃO volta na resposta — vai por e-mail)
curl -X POST http://localhost:3333/api/newsletter/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"pessoa@example.com","origem":"GRU","whatsapp":"+5511999999999"}'
# -> { "status": "pending_optin" }

# 2. Confirmação (o token chega por e-mail; em DEV use AONDE_DEV_LOG_OPTIN=1
#    para logar a URL de confirmação no console do servidor)
curl "http://localhost:3333/api/newsletter/confirm?token=<TOKEN_DO_EMAIL>"
# -> { "ok": true, "message": "Inscrição confirmada! ..." }

# 3. Cria um alerta de preço (rota GRU→LIS abaixo de R$ 3.000,00)
curl -X POST http://localhost:3333/api/alerts \
  -H 'Content-Type: application/json' \
  -d '{"email":"pessoa@example.com","origem":"GRU","destino":"LIS","precoAlvoCentavos":300000}'
# -> 201 { "ok": true, "rule": { ... } }

# Descadastro (idempotente; sempre 200, sem revelar se o e-mail existia)
curl -X POST http://localhost:3333/api/newsletter/unsubscribe \
  -H 'Content-Type: application/json' -d '{"email":"pessoa@example.com"}'
```

Uma regra de alerta casa uma oferta quando: `origem` igual, `destino` ausente
**ou** igual, e `precoAlvoCentavos` ausente **ou** `preco_centavos <= alvo` — e
o assinante está confirmado e não descadastrado. Use `matchAlerts(offer, { rules, subscribers })`
(função **pura**, testável) ou `dispatchAlerts(offers)` (carrega os stores, casa
tudo e enfileira as notificações).

### Regras de LGPD implementadas

- **Consentimento registrado com timestamp:** `consent_lgpd_at` só é preenchido
  na confirmação do double opt-in — prova de opt-in explícito.
- **Descadastro idempotente que preserva auditoria:** `unsubscribe` marca
  `unsubscribed_at` mas **nunca** apaga o registro; o assinante deixa de casar
  alertas imediatamente. A resposta é sempre a mesma, não revelando se o e-mail
  existia (privacidade).
- **Minimização na fila:** a fila de notificações (`data/alert_queue.jsonl`)
  grava o **hash SHA-256** do e-mail, nunca o e-mail em claro. Um worker de envio
  resolveria o hash contra o store no momento do disparo.
- **Token expirável de uso único:** o `optin_token` expira em 48h e é apagado ao
  confirmar.

### O que NÃO está incluído

- **Envio real de e-mail/WhatsApp:** o módulo é zero-dependência e **não** embarca
  provedor. `dispatchAlerts` apenas **enfileira** em JSONL. A integração futura
  (SendGrid/SES/WhatsApp BSP) se faz via **`setSenderImpl(fn)`** — mesmo padrão do
  `setFetchImpl` da camada HTTP; o worker real substitui o sender default,
  resolve o hash do e-mail e efetua o envio.
- **Conformidade LGPD completa:** o módulo entrega a **base técnica**
  (consentimento, minimização, descadastro auditável). Conformidade plena exige
  política de privacidade, base legal documentada e processos do **controlador**
  (atendimento a titulares, retenção, encarregado/DPO) — fora do escopo de código.

**DEV — `AONDE_DEV_LOG_OPTIN=1`:** loga no console do servidor a URL de
confirmação a cada inscrição, para testar o fluxo sem provedor de e-mail.
**Nunca** habilite em produção (o token no log dá acesso à confirmação).

## Roteiros (Google Places)

Além de ofertas de passagens, o módulo gera a **espinha dorsal de um roteiro
de destino** (modelo `Guide`: N dias, cada dia com título, pontos turísticos e
um restaurante sugerido) usando **pontos turísticos reais** da **Google Places
API (New)** — Text Search. Ver a pesquisa completa em
[`docs/PESQUISA-GOOGLE.md`](./PESQUISA-GOOGLE.md).

> **O gerador entrega dados, não redação.** Ele monta a estrutura com nomes,
> notas, endereços e o `editorialSummary` do próprio Google (quando existe) —
> **nunca inventa descrições**. O texto editorial rico no estilo do site
> continua sendo trabalho da **curadoria**, que enriquece essa base.

### Configuração

Defina `GOOGLE_MAPS_API_KEY` (`.env` ou ambiente). A chave é criada em
<https://console.cloud.google.com/> (ative a **Places API (New)**). Criar a
chave é grátis, mas **fazer chamadas exige uma conta de billing ativa** no
projeto.

**Custos / SKU:** desde março/2025 a cobrança é por **cota gratuita por SKU**
(o antigo crédito único de US$200/mês acabou). O Text Search é cobrado por
_tier_ conforme os campos pedidos no `FieldMask`:

| Campos no FieldMask | SKU (tier) |
|---|---|
| só `places.id`, ... | Text Search **Essentials** (ID Only) |
| `displayName`, `formattedAddress`, `location`, `types`, `googleMapsUri` | Text Search **Pro** |
| `rating`, `userRatingCount`, `editorialSummary` (atmosfera) | Text Search **Enterprise + Atmosphere** (mais caro) |

Como o caso de uso pede `rating`/`editorialSummary`, a chamada default cai no
tier **mais caro**. Para economizar, passe um `FieldMask` enxuto via a option
`fields` de `searchPlaces`.

O default também pede `places.photos` (referências de fotos, ver
[Fotos reais dos lugares](#fotos-reais-dos-lugares-google-place-photos)). Isso
**não** muda o tier além do que `rating`/`editorialSummary` já causam — mas a
**busca da imagem** (endpoint `/media`) é cobrada **à parte**, no SKU
**Place Photo**.

**Política de não-cache:** os Termos do Google Maps Platform **proíbem
cachear/armazenar** o conteúdo retornado além da sessão — **exceto o
`place id`**, que pode ser guardado indefinidamente. Por isso o cliente
**desliga o cache** em memória do `http.js` para essas chamadas
(`cacheTtlMs: 0`). Não persista rating/summary/endereço em disco; re-consulte.

**Atribuição obrigatória:** ao exibir dados da Places API fora de um Google
Map é preciso atribuir. Todo roteiro inclui **"Dados de lugares: Google"** (no
objeto e no rodapé do markdown).

### `searchPlaces(params)`

```js
import { searchPlaces } from "./src/index.js";

const res = await searchPlaces({
  query: "pontos turísticos em Recife",
  includedType: "tourist_attraction", // tipo único (a-validar com chamada real)
  maxResults: 20,
  regionCode: "BR",
  // fields: "places.displayName,places.formattedAddress", // FieldMask enxuto (mais barato)
});
// res => { ok: true, places: [{ id, name, address, lat, lng, rating,
//          ratingCount, summary, types, mapsUri, photos }], error: null }
// `photos` é o array cru de referências do Google (name/widthPx/heightPx/
// authorAttributions) — a imagem em si vem via Place Photos (ver abaixo).
```

Sem `GOOGLE_MAPS_API_KEY` → `{ ok: false, error: "GOOGLE_MAPS_API_KEY não
configurada. Crie uma chave em console.cloud.google.com..." }`. Erro
HTTP/rede/formato → `{ ok: false, places: [], error }`. Nunca lança exceção.

### `buildItinerary(params)` / `renderItineraryMarkdown(itinerary)`

```js
import { buildItinerary, renderItineraryMarkdown } from "./src/index.js";

const roteiro = await buildItinerary({
  destination: "Recife",
  days: 5,
  regionCode: "BR",
});
// roteiro => {
//   ok: true, destination: "Recife",
//   days: [{ n: 1, titulo: "Dia 1 — ... e arredores",
//            pontos: [{ nome, nota, endereco, rating, ratingCount, mapsUri,
//                       resumo?, foto: { url, attribution: {text, uri}, width, height } | null }],
//            restaurante?: { nome, rating, endereco } }, ...],
//   hero: { url, attribution: {text, uri} } | null, // foto de capa do guia
//   attribution: "Dados de lugares: Google", error: null
// }

const markdown = renderItineraryMarkdown(roteiro); // string, toda em bullets
```

- Ordena os pontos por **nota ponderada** `rating × log10(ratingCount + 1)` —
  volume de avaliações desempata sem dominar a nota.
- Distribui os melhores pontos em `days` dias (**round-robin**, ~2-4/dia) e
  ordena cada dia por **proximidade geográfica** (heurística simples por
  ângulo em torno do centroide — **não** é otimização de rota real).
- `titulo` do dia é neutro e derivado dos dados; `resumo` só aparece quando há
  `editorialSummary` (campos ausentes são omitidos, sem `undefined`).
- Cada ponto ganha `foto` (imagem real via **Google Place Photos**) quando há
  foto disponível, e o roteiro ganha uma foto de capa `hero` (do ponto de maior
  nota ponderada que tenha foto). O markdown embute a imagem por ponto e um
  bullet de capa no topo, **cada uma com o crédito obrigatório do autor**. Sem
  foto, tudo é omitido com elegância. Ver a próxima seção.

### Fotos reais dos lugares (Google Place Photos)

O roteiro traz **imagens reais** dos pontos turísticos via **Google Place
Photos (New)** — API oficial, **sem scraping**. Ver
[`docs/PESQUISA-GOOGLE.md`](./PESQUISA-GOOGLE.md) (seção "Place Photos").

```js
import { buildPhotoMediaUrl, resolvePhotoUri } from "./src/index.js";

// (1) URL direta (função PURA, sem rede) — pode ir direto em <img src>:
//     o Google faz um redirect (302) para a imagem.
const url = buildPhotoMediaUrl("places/PLACE_ID/photos/RESOURCE", { maxWidthPx: 800 });

// (2) OU resolver a URL curta via /media com skipHttpRedirect (faz rede):
const r = await resolvePhotoUri("places/PLACE_ID/photos/RESOURCE", { maxWidthPx: 800 });
// r => { ok: true, photoUri: "https://lh3.googleusercontent.com/..." }
```

- **Atribuição obrigatória:** ao exibir uma foto, o crédito do autor
  (`authorAttributions[0]`) **deve acompanhar a imagem** (política do Google). O
  markdown do roteiro já inclui esse crédito por foto (`— Foto: {autor}`), além
  da atribuição geral "Dados de lugares: Google".
- **Não cachear a imagem:** é vedado armazenar a mídia em disco; apenas
  **referências** (o `place id` e o `photo name`) podem ser guardadas — a imagem
  é sempre re-obtida via `/media`. `resolvePhotoUri` respeita a política de
  não-cache (`cacheTtlMs: 0`).
- **Custo:** cada busca de mídia (`/media`) é cobrada no SKU **Place Photo**
  (à parte do Text Search). `buildPhotoMediaUrl` não gasta chamada de rede no seu
  processo, mas o navegador do usuário dispara o `/media` ao carregar a imagem.
- Sem `GOOGLE_MAPS_API_KEY`: `buildPhotoMediaUrl` lança (é função pura de
  montagem); `resolvePhotoUri` retorna `{ ok: false, error }`; e no roteiro a
  `foto`/`hero` degrada para `null` (nunca lança).

### CLI: `scripts/roteiro.js`

```bash
node scripts/roteiro.js "Recife" --dias 5 --regiao BR --out roteiro-recife.md
```

Imprime o roteiro em markdown no stdout e, com `--out`, grava no arquivo.
Mensagens de uso/erro em pt-BR.

## Renderização e páginas de amostra

O módulo também monta **páginas HTML** do conteúdo já produzido: um **feed de
ofertas** (cards) e um **roteiro** dia a dia — ambos com imagens. As funções de
renderização (`src/render/htmlRenderer.js`) são **puras** (sem rede, sem
dependências) e seguem os Design Tokens do produto:

- `formatBRL(centavos)` — preço em Real pt-BR, sem centavos quando redondo
  (`formatBRL(184700)` → `"R$ 1.847"`).
- `renderOfferCard(offer)` — card de uma oferta (imagem/placeholder, badge de
  desconto, badge de "Erro de tarifa", preço dominante com _de/por_, datas,
  CTA "Ver oferta" e crédito da imagem). Consome a saída de
  `toOffer` + `enrichOfferWithImage`.
- `renderOffersPage(offers, { title })` — página completa e autocontida com o
  grid responsivo dos cards.
- `renderItineraryPage(itinerary)` — página completa do roteiro (hero, dias,
  cards de ponto com foto/nota/mapa, restaurante do dia, atribuição
  obrigatória "Dados de lugares: Google"). Consome a saída de `buildItinerary`.

Em produção, essas funções recebem o objeto já enriquecido pelo pipeline
(`buildItinerary` para o roteiro; `toOffer` + `enrichOfferWithImage` para as
ofertas). As páginas são **autocontidas** — CSS inline no `<head>` e fontes com
fallback garantido (`Georgia, serif` / `system-ui`) — e **resilientes**: toda
`<img>` de URL externa tem um `onerror` que troca a imagem por um placeholder
SVG embutido (data-URI), então a página **renderiza sempre**, inclusive offline
ou sem credenciais.

### Gerando as amostras

```bash
node scripts/render-samples.js            # escreve em samples/
node scripts/render-samples.js --out /tmp # ou em outro diretório
```

O CLI usa **fixtures commitadas** (`src/render/sampleData.js`) — nunca faz rede
— e grava dois arquivos em [`samples/`](../samples/):

- `samples/roteiro-recife.html` — roteiro de Recife (3 dias).
- `samples/ofertas.html` — feed com 6 ofertas variadas (incluindo uma com
  "Erro de tarifa" e uma sem imagem, para exercitar o placeholder).

Abra os arquivos direto no navegador. As URLs de imagem das fixtures apontam
para o Wikimedia Commons (form estável `Special:FilePath/`); se alguma não
carregar, o fallback de placeholder assume.

## Limitações e processos manuais

### Hurb / Clube Hurb

Não há API pública documentada. O fluxo é:

1. Cadastro gratuito em <https://www.clubehu.com.br/> (Clube Hurb).
2. Avaliação do cadastro, com confirmação por e-mail.
3. No painel do afiliado, escolher a oferta e usar a opção **"Traquear
   URL"**, que gera o link rastreável final.
4. Colar esse link em `HURB_TRACKED_LINK` (`.env`) — o módulo apenas
   repassa esse valor via `getDealLink("hurb", ...)`, sem inventar nenhum
   parâmetro de tracking.

Comissão citada publicamente: até 6,5% sobre o valor pago em pedidos
aprovados, com dashboard atualizado diariamente.

#### Múltiplos links (por rota ou por oferta)

Como cada link é gerado manualmente por rota/oferta no painel, um único
`HURB_TRACKED_LINK` não é suficiente quando o site de curadoria precisa de um
`affiliate_url` diferente por oferta (ex.: `Offer.affiliate_url`). Para isso,
`getDealLink("hurb", options)` também aceita um pequeno **registro** de links
pré-gerados, configurado em `HURB_TRACKED_LINKS_JSON` (`.env`) — um JSON de
uma linha mapeando `offerId` ou rota `"ORIGEM-DESTINO"` (maiúsculas) para o
link já traqueado:

```bash
# .env
HURB_TRACKED_LINKS_JSON={"GRU-LIS":"https://www.clubehu.com.br/go/rota1","oferta-123":"https://www.clubehu.com.br/go/oferta123"}
```

```js
// match por offerId
await getDealLink("hurb", { offerId: "oferta-123" });

// match por rota (origin + destination) — vira a chave "GRU-LIS"
await getDealLink("hurb", { origin: "GRU", destination: "LIS" });
```

Ordem de prioridade na resolução do link: `options.trackedLink` (override
explícito) → `registry[offerId]` → `registry["ORIGEM-DESTINO"]` →
`HURB_TRACKED_LINK` (fallback global) → nenhum link encontrado (`ok: false`).
O campo `source` no retorno indica qual caminho foi usado
(`"override"`, `"registry:offerId"`, `"registry:route"` ou
`"fallback-global"`). Um `HURB_TRACKED_LINKS_JSON` ausente ou malformado
nunca derruba o módulo: ele apenas cai para o fallback global (ou para o erro
"não configurado", se nada estiver disponível).

### Parceiros Promo / Passagens Promo (grupo Amo Promo)

Não há API pública documentada. O fluxo é:

1. Cadastro em <https://www.parceirospromo.com.br/> (login em `/signin/`).
2. Aprovação **não garantida** — segundo o Termo de Adesão, a participação
   só é considerada após aprovação explícita, que a empresa pode recusar.
3. Uma vez aprovado, o afiliado recebe por e-mail um **código de afiliado
   (FRANQ)** e acesso ao **Portal do Afiliado**.
4. O link exclusivo de divulgação é gerado manualmente no portal (há também
   um plugin WordPress que se atualiza automaticamente para sites em WP).
5. Colar o link gerado em `PASSAGENS_PROMO_TRACKED_LINK` (`.env`) — o módulo
   apenas repassa esse valor via `getDealLink("passagens-promo", ...)`.

#### Múltiplos links (por rota ou por oferta)

Mesma limitação e mesma solução do Hurb (ver acima): use
`PASSAGENS_PROMO_TRACKED_LINKS_JSON` (`.env`) para cadastrar vários links
pré-gerados no Portal do Afiliado, indexados por `offerId` ou por rota
`"ORIGEM-DESTINO"`:

```bash
# .env
PASSAGENS_PROMO_TRACKED_LINKS_JSON={"GRU-LIS":"https://www.parceirospromo.com.br/go/rota1","offerId-custom":"https://www.parceirospromo.com.br/go/link2"}
```

```js
await getDealLink("passagens-promo", { origin: "GRU", destination: "LIS" });
// => { ok: true, url: "https://www.parceirospromo.com.br/go/rota1", source: "registry:route", ... }
```

`PASSAGENS_PROMO_TRACKED_LINK` continua funcionando como fallback global e a
mesma ordem de prioridade do Hurb se aplica aqui
(`options.trackedLink` → `registry[offerId]` → `registry["ORIGEM-DESTINO"]` →
fallback global → `ok: false`).

### Travelpayouts — o que fica fora de escopo

- A **Flights Search API** (busca em tempo real) exige projeto com **≥
  50.000 MAU** (usuários ativos mensais) — não implementada aqui. Este
  módulo usa a **Data API** (`prices_for_dates`), que trabalha com preços em
  cache (até ~7 dias) encontrados por usuários do Aviasales.
- Rate limit documentado da Data API: **~200 requisições/hora por IP**. O
  módulo não implementa throttling automático — cabe ao chamador respeitar
  esse limite ao orquestrar buscas em lote.
- Rate limit da API de criação de links (`/links/v1/create`): **máx. 100
  requisições/minuto por marker**, **máx. 10 links por requisição**. Também
  documentado, não imposto no código.
- **Modo API de criação de links (`useApi: true` / `/links/v1/create`):** o
  **corpo do POST foi confirmado** (22/07/2026) via os exemplos oficiais
  indexados — `links` é um array de objetos `{ url, sub_id? }`, e `trs` (ID do
  projeto conectado à brand) e `sub_id` são campos próprios (ver
  `docs/PESQUISA-PARCEIROS.md`, seção "Atualização 22/07/2026"). Passe o `trs`
  do seu projeto via `getDealLink("travelpayouts", { useApi: true, trs,
  shorten, subId, destinationUrl })`. **Ressalva:** o *formato da resposta*
  não pôde ser confirmado (páginas oficiais retornam 403 neste ambiente); o
  parsing é **tolerante** e, se não reconhecer o link na resposta, retorna
  `ok:false` com o corpo bruto resumido no erro — valide com uma credencial
  real antes de uso intensivo em produção. Para geração de link **sem token**,
  prefira o modo `template` (padrão), que é totalmente determinístico.

### Awin — o que fica fora de escopo

- Rate limit documentado: **20 requisições/minuto por usuário**. Não
  imposto no código.
- Geração em lote (`/linkbuilder/generate-batch`, até 100 links) não foi
  implementada neste módulo (só o endpoint de link único), mas pode ser
  adicionada seguindo o mesmo padrão de `src/partners/awin.js`.
- Sem estar aprovado no programa do anunciante específico (ex.: Decolar),
  os links gerados não geram comissão — a API pode até responder com
  sucesso, mas o tracking não é válido comercialmente.

## Robustez

Todas as chamadas de rede dos parceiros passam por `httpRequest()` em
`src/http.js`. Por isso, quatro melhorias de robustez ficam concentradas
nessa camada (mais a validação de entrada em `src/validate.js`) e valem
para todos os parceiros de uma vez.

### 1. Rate limiting client-side (token bucket)

Um "token bucket" por prefixo de URL protege contra estourar os limites
documentados de cada API. Limites aplicados por default:

| Prefixo de URL                          | Limite         |
| --------------------------------------- | -------------- |
| `api.travelpayouts.com/aviasales/`      | 200 req/hora   |
| `api.travelpayouts.com/links/`          | 100 req/min    |
| `api.awin.com/`                         | 20 req/min     |
| `amadeus.com/` (test + produção)        | 10 req/s       |

Ao esgotar as fichas, o comportamento default é **fail fast**: retorna
`{ ok: false, error }` informando em ~quantos segundos há liberação (nunca
lança exceção). Passando `rateLimit: "wait"` nas options de `httpRequest`,
a chamada **aguarda** a recarga até um teto `maxWaitMs` (default 30s) antes
de falhar. Desligável globalmente via `AONDE_RATE_LIMIT=off`.

Limitação: o estado vive **em memória do processo** — múltiplos processos/
réplicas não coordenam entre si (cada um mantém seus próprios baldes).

### 2. Retry com backoff exponencial

Erros de rede (fetch rejeitado/timeout), respostas **5xx** e **429** sofrem
retry automático com backoff exponencial + jitter (default: 2 retries,
base 500ms — configuráveis via `retries`/`retryBaseMs` nas options). Um
header `Retry-After` em 429/503 é respeitado (com teto). Respostas **4xx**
(exceto 429) **não** são repetidas. Cada tentativa real consome uma ficha
do rate limiter.

### 3. Cache em memória com TTL (só GET)

Respostas **GET** bem-sucedidas podem ser cacheadas. A chave combina a URL
completa com um hash simples do token de auth (nunca o token em claro),
evitando vazar a resposta de um token para outro. Por default, só as URLs
da Data API (`api.travelpayouts.com/aviasales/`) são cacheadas, com TTL de
**15 minutos** (os preços já vêm em cache upstream). Configurável via
`AONDE_CACHE_TTL_MS` (0 = desliga) ou `cacheTtlMs` por chamada. Um cache
hit **não** consome ficha do rate limiter. `clearHttpCache()` invalida tudo.

### 4. Validação de entrada

`src/validate.js` valida e normaliza os campos de busca antes de tocar a
camada HTTP: `isIataCode` (3 letras A-Z, normaliza para maiúsculas),
`isValidDate` (`YYYY-MM` ou `YYYY-MM-DD`, com checagem real de calendário)
e `validateSearchOptions(...)`. `searchDeals()` chama essa validação no
início e retorna um erro pt-BR específico (qual campo, qual formato) antes
de qualquer requisição.

### Variáveis de ambiente de controle

| Variável              | Efeito                                                        |
| --------------------- | ------------------------------------------------------------ |
| `AONDE_RATE_LIMIT`    | `off` desliga o rate limiting (default: ligado)              |
| `AONDE_CACHE_TTL_MS`  | TTL do cache da Data API em ms; `0` desliga o cache          |

## Estrutura do módulo

```
aonde-affiliates/
  package.json
  README.md
  .env.example
  src/
    index.js               interface pública (getDealLink, searchDeals, getTypicalPrices, getAllDealLinks, toOffer/toOffers, runMonitor, createServer, ...)
    config.js               leitura de env vars + loader simples de .env
    http.js                 fetch com timeout, rate limit, retry/backoff e cache
    rateLimiter.js          token bucket por chave, com relógio injetável
    httpCache.js            cache em memória com TTL para GET (chave inclui hash do token)
    validate.js             validação/normalização de IATA e datas (entrada de busca)
    health.js               validateConfig() — health-check de config (sem rede)
    offerAdapter.js          adapter deal (searchDeals) -> Offer parcial (curadoria do Aonde)
    fareError.js            detectFareError() — heurística de erro de tarifa (triagem)
    monitor.js              runMonitor() — job de monitoramento de tarifas
    server.js               createServer() — API REST zero-dep (node:http)
    store/
      dataDir.js             resolução de AONDE_DATA_DIR + escrita atômica/leitura tolerante
      priceHistory.js        histórico de preços por rota (recordPrices/getRouteStats/listRoutes)
      offersStore.js         store de ofertas em rascunho (upsert/listOffers/getOffer)
    partners/
      travelpayouts.js
      awin.js
      hurb.js
      passagensPromo.js
      amadeus.js             preço típico de rota (Flight Price Analysis API) — getTypicalPrices
    images/
      wikimediaProvider.js   imagens reais de destino via Wikimedia Commons (Action API, sem chave) — getDestinationImage
    guides/
      placesClient.js        cliente Google Places API (New) — searchPlaces
      placePhotos.js         Google Place Photos — buildPhotoMediaUrl/resolvePhotoUri/firstPhotoFrom
      itineraryBuilder.js    buildItinerary + renderItineraryMarkdown (roteiros, com fotos)
    render/
      htmlRenderer.js        funções puras de HTML (renderOfferCard/renderOffersPage/renderItineraryPage/formatBRL)
      sampleData.js          fixtures das páginas de amostra (roteiro Recife + ofertas)
    newsletter/
      subscriberStore.js     assinantes + double opt-in (subscribe/confirm/unsubscribe)
      alertRules.js          regras de alerta de preço (addAlertRule/listAlertRules)
      alertMatcher.js        matchAlerts (puro) + dispatchAlerts + setSenderImpl
  scripts/
    monitor.js               CLI do job de monitoramento
    serve.js                 sobe a API REST (AONDE_PORT)
    roteiro.js               CLI: gera roteiro de destino em markdown
    render-samples.js        CLI: gera as páginas de amostra em samples/ (sem rede)
  samples/
    roteiro-recife.html      página de amostra do roteiro (autocontida)
    ofertas.html             página de amostra do feed de ofertas (autocontida)
  test/
    *.test.js                testes node:test (sem rede real)
  docs/
    PESQUISA-PARCEIROS.md    pesquisa completa que fundamenta as integrações
    PESQUISA-GOOGLE.md       pesquisa Google Flights + Places API (New)
  data/                     (gerado em runtime; no .gitignore) histórico, ofertas, cliques
```

## Formato de retorno

Todas as funções de link retornam o mesmo formato:

```ts
{
  ok: boolean;
  url?: string;
  partner: string;
  method: "template" | "api" | "manual" | "unknown";
  error?: string;
}
```

`searchDeals`/`searchDealsSafe` retornam:

```ts
{
  ok: boolean;
  partner: string;
  deals: Array<{
    origin: string;
    destination: string;
    departDate: string | null;
    returnDate: string | null;
    price: number | null;
    currency: string;
    airline: string | null;
    flightNumber: string | null;
    transfers: number | null;
    foundAt: string | null;
    expiresAt: string | null;
    link: string | null;
  }>;
  error?: string | null;
}
```

Nenhuma dessas funções lança exceção não tratada — toda falha (rede, HTTP
não-2xx, JSON inválido, credencial ausente) é capturada e devolvida como
`{ ok: false, error }`.
