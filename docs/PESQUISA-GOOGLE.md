# Pesquisa: Google Flights API e Google Places API (New) — estado em 2026-07-22

**Nota metodológica:** o WebFetch neste ambiente retornou 403 Forbidden para todos os domínios testados (developers.google.com, developers.amadeus.com, nicolalazzari.ai, woosmap.com, e até en.wikipedia.org como teste de controle) — bloqueio de rede do ambiente, não das fontes. Todas as afirmações abaixo vêm de trechos indexados retornados pelo WebSearch (snippets/resumos de página), não de leitura direta e completa das páginas oficiais. Onde a confiança é baixa por depender só de blog terceiro (não a doc oficial), isso está marcado como **[não confirmado na doc primária]**.

---

## 1. Google Flights — existe API oficial de dados/preços?

### Resumo executivo
**Não.** Não existe, em 2026, nenhuma API pública oficial do Google para buscar voos, tarifas ou histórico de preços do Google Flights. A antiga **QPX Express API** (herdada da aquisição da ITA Software) foi **desligada em abril de 2018**, por baixo uso.
Fontes:
- [Google is shutting down its QPX Express flight search API — CIOL](https://www.ciol.com/google-shutting-qpx-express-flight-search-api/)
- [Google is shutting down the QPX Express API for airfare data — Hacker News (thread com contexto)](https://news.ycombinator.com/item?id=15594975)
- [Google Flights API: How Did It Work & What Happened To It? — Duffel](https://duffel.com/blog/google-flights-api)

### Não houve relançamento em 2025/2026
Buscas específicas por "Google Flights API 2025/2026 official" não retornaram nenhum anúncio de relançamento. O consenso das fontes (inclusive blogs especializados em travel-tech de 2026) é que o Google **não oferece** uma API self-service de tarifas/voos ao público geral.
- [Google Flights API — What Happened and Best Alternatives — Airlabs](https://airlabs.co/google-flights-api-alternatives)
- [Google Flights API Alternative: Flight Price API vs Scraping Google Flights — FlightAPI.io](https://www.flightapi.io/blog/google-flight-api-history-and-alternative/)

**[não confirmado]** Uma fonte (iproyal.com) menciona que "supostamente" a QPX Express ainda estaria disponível para grandes corporações via contrato direto/enterprise com o Google — isso não foi confirmado em nenhuma doc oficial e deve ser tratado como boato/rumor de mercado, não como opção viável para este projeto.

### A única API pública do Google na área de viagens/voos hoje
O **Travel Impact Model API** — mas ela **não fornece preços**, apenas estimativas de emissão de carbono por voo (origem, destino, companhia, número do voo, data). Não serve para curadoria de ofertas de preço.
- [Travel Impact Model API — Google for Developers](https://developers.google.com/travel/impact-model)
- [GitHub — google/travel-impact-model](https://github.com/google/travel-impact-model)

### Alternativas oficiais para dados de preço histórico/típico de rota

**Amadeus Self-Service — Flight Price Analysis API** (esta é a alternativa oficial mais relevante):
- **Endpoint:** `GET https://test.api.amadeus.com/v1/analytics/itinerary-price-metrics` (ambiente de teste; produção usa `https://api.amadeus.com/...`)
- **Parâmetros obrigatórios:** `originIataCode`, `destinationIataCode`, `departureDate` (YYYY-MM-DD)
- **Parâmetros opcionais:** `currencyCode`, `oneWay`
- **Resposta:** distribuição em quartis do preço histórico (MINIMUM, FIRST, MEDIUM, THIRD, MAXIMUM) — permite responder "esse preço é uma boa oferta?"
- **Autenticação:** OAuth2 Client Credentials Grant — `POST https://test.api.amadeus.com/v1/security/oauth2/token` com `client_id`/`client_secret`, retorna `access_token` (Bearer) válido por ~30 min
- **Tier gratuito:** Self-Service APIs têm cota mensal gratuita tanto em teste quanto produção; uma fonte cita 10.000 chamadas/mês grátis para esta API especificamente **[confiança moderada — número específico não visto na doc oficial primária, apenas em resumo de busca]**. Acima da cota: cobrança por chamada (faixa geral citada: €0,0008 a €0,025 dependendo da API).
- **Cobertura:** os dados vêm dos "Marketing Information Data Tapes" (MIDT) da Amadeus (histórico de reservas no sistema Amadeus). Não encontrei confirmação clara sobre cobertura de rotas menos populares/o comportamento exato quando não há dados suficientes (esperado: resposta vazia ou interpolação via modelo de ML, segundo o blog técnico da Amadeus) — **[não confirmado com precisão]**.

Fontes:
- [Flight APIs Tutorial — Amadeus for Developers](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/flights/)
- [Building a flight price analysis model with machine learning — Amadeus for Developers (blog)](https://developers.amadeus.com/blog/flight-price-analysis-model-machine-learning)
- [Amadeus for Developers — Postman public workspace (Flight Price Analysis)](https://www.postman.com/amadeus4dev/amadeus-for-developers-s-public-workspace/request/i8nkryw/flight-price-analysis)
- [API Rate Limits — Amadeus for Developers](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/api-rate-limits/)
- [Self-Service Pricing — Amadeus for Developers](https://developers.amadeus.com/pricing)

**Outras APIs oficiais de voo — verificação de programas públicos ativos em 2026:**
- **Skyscanner:** **não** tem self-serve público. Acesso apenas via aplicação no Partner Portal, aprovação manual, tipicamente exige negócio de turismo estabelecido. Não é uma opção de "cadastre-se e use" como a Amadeus.
  - [Skyscanner API — oneclickitsolution.com (contexto de acesso)](https://www.oneclickitsolution.com/blog/skyscanner-flight-api)
- **Kiwi.com Tequila API:** o programa self-service público **foi descontinuado para novos desenvolvedores**; hoje é convite/parceria B2B apenas, sem tier gratuito documentado publicamente para novos usuários.
  - [Kiwi.com affiliate program API — Travelpayouts Help Center](https://support.travelpayouts.com/hc/en-us/articles/360019237899-Kiwi-com-affiliate-program-API)

### Serviços de "dados do Google Flights" que são scraping de terceiros (NÃO oficiais)
Os seguintes são wrappers/scrapers de terceiros que simulam consultas ao Google Flights e **não têm relação oficial com o Google** — usá-los implica risco de ToS e instabilidade:
- SerpAPI (Google Flights API) — [searchapi.io/docs/google-flights-api](https://www.searchapi.io/docs/google-flights-api), [Apify — Google Flights API](https://apify.com/api/google-flights-api)
- HasData — [hasdata.com/apis/google-flights-api](https://hasdata.com/apis/google-flights-api)
- Outros citados: FlightAPI.io, APIHiver — cobrança por crédito/request, sem SLA do Google.

**Recomendação para o módulo Aonde.com.br:** não existe API oficial do Google Flights. Para preço histórico/típico de rota, a opção oficial mais viável é a **Amadeus Flight Price Analysis API**. Qualquer integração "Google Flights data" via SerpAPI/HasData/similares deve ser tratada explicitamente como scraping de terceiro não-oficial (risco de ToS, sem SLA).

---

## 2. Google Places API (New) — busca de pontos turísticos

### Endpoint e método
- **Text Search (New):** `POST https://places.googleapis.com/v1/places:searchText`
- Corpo da requisição em JSON, ex.: `{ "textQuery": "atrações turísticas em Salvador, Brasil" }`
Fonte: [Text Search (New) — Places API — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/text-search) (via snippet indexado — página não pôde ser lida diretamente devido ao bloqueio de rede)

### Autenticação
- API key no header **`X-Goog-Api-Key`** (também suporta OAuth token como alternativa).
- Exemplo confirmado por snippet oficial:
```
curl -X POST -d '{ "textQuery" : "Spicy Vegetarian Food in Sydney, Australia" }' \
  -H 'Content-Type: application/json' \
  -H 'X-Goog-Api-Key: API_KEY' \
  -H 'X-Goog-FieldMask: places.displayName,places.formattedAddress,places.priceLevel' \
  'https://places.googleapis.com/v1/places:searchText'
```
Fonte: [Method: places.searchText — Places API — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText)

### FieldMask — obrigatório
- O header **`X-Goog-FieldMask`** (ou parâmetro `$fields`/`fields`) é **obrigatório**. Não há lista padrão de campos retornados — se omitido, a chamada retorna **erro**.
- Campos úteis para o caso de uso (pontos turísticos) e prefixo `places.`:
  - `places.displayName`
  - `places.formattedAddress`
  - `places.location`
  - `places.rating`
  - `places.userRatingCount`
  - `places.editorialSummary`
  - `places.types`
  - `places.googleMapsUri`
  - `places.photos` (retorna referências; buscar a imagem exige uma segunda chamada à Place Photo API)
Fontes:
- [Choose fields to return — Places API — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/choose-fields)
- [Place Data Fields (New) — Places API — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/data-fields)

### Parâmetros úteis de request
- `includedType`: **[não confirmado com 100% de certeza pela doc primária neste ambiente]** — o parâmetro para restringir por tipo em Text Search (New) é normalmente `includedType` (singular, um único tipo, ex. `"tourist_attraction"`) no corpo JSON. Não consegui abrir a página de referência REST completa para confirmar o nome exato do campo e se aceita lista; recomendo validar diretamente na doc antes de codar (`developers.google.com/maps/documentation/places/web-service/text-search`, seção "Parameters").
- `languageCode`: sim, existe e aceita códigos como `pt-BR` para retornar textos (nome, endereço) no idioma solicitado.
- `regionCode`: sim, existe (bias regional dos resultados, ex. `"BR"`).
Ambos os campos aparecem documentados na página oficial de Text Search (New), confirmados via snippet indexado, mas **não visualizei a tabela completa de parâmetros** — recomendo checagem direta antes de assumir nomes exatos de todos os parâmetros (ex. se `languageCode`/`regionCode` vão no corpo JSON, não como query string, já que Text Search New é `POST` com body JSON).

### Billing / cobrança
- **Exige conta de billing (cartão de crédito) do Google Cloud** para uso além da criação da chave — criar a API key em si é gratuito e sem cartão, mas para efetivamente fazer chamadas de produção é necessário billing account ativa no projeto.
- **Mudança de março/2025 confirmada:** o antigo crédito universal de US$200/mês foi **substituído** por um modelo de **cota gratuita por SKU** (não mais um pool único). Por categoria de SKU:
  - **Essentials:** 10.000 chamadas gratuitas/mês
  - **Pro:** 5.000 chamadas gratuitas/mês
  - **Enterprise:** 1.000 chamadas gratuitas/mês
  - Volume discounts automáticos agora escalam até 5.000.000+ eventos/mês (antes, a partir de 100.000+)
  - Contas novas recebem também um crédito trial de US$300 (crédito geral de onboarding do GCP, separado da cota por SKU)
Fontes:
- [Google Maps Platform March 2025 changes — Google for Developers](https://developers.google.com/maps/billing-and-pricing/march-2025)
- [Changes to Google Maps Platform automatic volume discounts... — Google for Developers (FAQ)](https://developers.google.com/maps/billing-and-pricing/faq)
- [Is the Google Maps API key actually free? A 2026 breakdown — Woosmap (blog, não oficial)](https://www.woosmap.com/blog/google-maps-api-key-free)

### SKU consumido pelo Text Search — depende dos campos pedidos
O Text Search (New) usa billing **tiered por campos solicitados no FieldMask** — quanto mais campos "ricos", maior o SKU cobrado:
- Campos apenas de ID (`places.id`, `places.name*` restrito, `nextPageToken`, `places.attributions`, `places.movedPlace(Id)`) → **Text Search Essentials ID Only**
- Campos como endereço/localização básica (`displayName`, `formattedAddress`, `location`, `types`, `googleMapsUri`, etc.) → tipicamente **Text Search Pro**
- `rating`, `userRatingCount`, `editorialSummary` e atributos de "atmosfera" (reviews, opening hours detalhado, price level, etc.) → **Text Search Enterprise + Atmosphere** (tier mais caro; uma fonte cita ~US$40,00/1.000 chamadas para esse tier em Place Details, valor equivalente esperado para Text Search) **[preço exato não confirmado na doc oficial — visto apenas em blog terceiro]**
- Ou seja: **para o caso de uso descrito (rating, userRatingCount, editorialSummary), a chamada cairá no tier Enterprise + Atmosphere**, o mais caro — vale considerar separar a chamada inicial (Pro, sem rating/summary) de uma chamada posterior de Place Details só para os lugares selecionados, se o custo for relevante.
Fontes:
- [Places API Usage and Billing — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Google Maps Platform API usage details (SKU details) — Google for Developers](https://developers.google.com/maps/billing-and-pricing/sku-details)
- (preço específico do tier Enterprise+Atmosphere) via resumo indexado, doc oficial não lida diretamente — **[não confirmado com certeza total]**

### Place Photos (New) — imagens reais dos lugares

Fonte confirmada por WebSearch (a doc oficial retorna 403 neste ambiente, mas os
campos abaixo aparecem no snippet indexado da página oficial
[Place Photos (New) — Places API](https://developers.google.com/maps/documentation/places/web-service/place-photos)
e do [Method: places.photos.getMedia](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places.photos/getMedia)):

- **Referências no Text Search:** incluir `places.photos` no `X-Goog-FieldMask`
  faz cada place retornar um array `photos[]`. Cada foto traz:
  - `name` — o **recurso** da foto, ex. `places/PLACE_ID/photos/PHOTO_RESOURCE`
  - `widthPx` / `heightPx` — dimensões da imagem original
  - `authorAttributions[]` — `{ displayName, uri, photoUri }` (**atribuição
    OBRIGATÓRIA** ao exibir a foto)
- **Obter a imagem (endpoint /media):**
  `GET https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx=800&key=API_KEY`
  (a key também pode ir no header `X-Goog-Api-Key`).
  - `maxWidthPx` / `maxHeightPx`: 1..4800 px (pelo menos um é obrigatório).
  - Sem `skipHttpRedirect` (default): o Google responde com um **redirect (302)**
    para a URL final da imagem — serve direto em `<img src>`.
  - Com `skipHttpRedirect=true`: responde **JSON** `{ name, photoUri }` com uma
    URL curta e de vida-curta (`photoUri`) já resolvida.
- **Custo (SKU):** pedir `places.photos` no Text Search **não** muda o tier de
  forma relevante além do que `rating`/`editorialSummary` já causam (Enterprise +
  Atmosphere) — o array traz só referências. A **busca da mídia** em si (cada GET
  `/media` ou `resolvePhotoUri`) é cobrada **à parte**, no SKU **Place Photo**.
- **Cache/armazenamento:** vale a mesma política — **é vedado armazenar a imagem**
  em disco; apenas **referências** (o `place id` e o `photo name`/recurso) podem
  ser guardadas, e a mídia deve ser re-obtida via `/media`. Por isso
  `resolvePhotoUri` usa `cacheTtlMs: 0` (mesma política de não-cache das chamadas
  Places).
- **Atribuição:** o crédito do autor (`authorAttributions[0].displayName`, e
  idealmente o link `uri`) **deve acompanhar cada foto exibida**. O montador de
  roteiro (`src/guides/itineraryBuilder.js`) inclui esse crédito por foto na saída
  markdown, somado à atribuição geral "Dados de lugares: Google".

Implementação no módulo: `src/guides/placePhotos.js` (`buildPhotoMediaUrl` —
puro, sem rede; `resolvePhotoUri` — rede, `skipHttpRedirect`; `firstPhotoFrom` —
extrai a 1ª foto com atribuição).

### Restrições de caching
- Regra geral: **não é permitido pré-buscar, cachear ou armazenar** o conteúdo retornado pela Places API além de exceções específicas.
- **Exceção confirmada:** o **`place_id`** é isento da restrição de cache — **pode ser armazenado indefinidamente**. Isso é útil para o módulo guardar referências estáveis aos pontos turísticos sem re-consultar a API toda vez.
- Outros campos (nome, endereço, rating etc.) **não podem** ser armazenados permanentemente conforme os Termos de Serviço padrão — há exceções pontuais e limitadas (ex.: latitude/longitude do Places UI Kit podem ficar em cache por até 30 dias corridos, depois devem ser apagadas), mas de modo geral o dado "rico" (rating, summary, fotos) deve ser tratado como não-cacheável a longo prazo e re-consultado periodicamente.
- Atribuição: ao exibir dados da Places API fora de um Google Map, é necessário incluir o logo do Google (obrigação de atribuição).
Fontes:
- [Policies and attributions for Places API — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Maps Platform Service Specific Terms — Google Cloud](https://cloud.google.com/maps-platform/terms/maps-service-terms)

### Places API Legada (`maps.googleapis.com/maps/api/place/textsearch/json`)
- **Congelada para novos clientes desde 1º de março de 2025**: a partir dessa data, `google.maps.places.PlacesService` (e por extensão o fluxo de onboarding para a API legada) **não está mais disponível para novos clientes/projetos**. A recomendação oficial do Google é usar a Places API (New).
- Para clientes **existentes** que já usavam a legada antes dessa data, ela continua funcionando ("frozen" — sem novas features, descontos de volume limitados/capados), mas o Google já sinalizou que dará **12 meses de aviso prévio** antes de uma descontinuação definitiva. Até a data desta pesquisa (22/07/2026), **nenhuma data final de desligamento foi anunciada** — mas isso está sujeito a mudança e deveria ser reconferido periodicamente.
- **Conclusão prática para este projeto (novo módulo):** a API legada **não é uma opção viável** para um projeto novo — é preciso usar a Places API (New) desde o início.
Fontes:
- [Migrate to Text Search (New) — Places API — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-text)
- [Places API (Legacy) overview — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/legacy/overview-legacy)
- [Google Places API (Legacy) Is Frozen: What EU Developers Should Know — MapAtlas (blog, não oficial, contexto adicional)](https://mapatlas.eu/blog/google-places-api-legacy-deprecation-eu)

---

## Itens explicitamente NÃO confirmados (recomenda-se checagem manual na doc oficial antes de codar)
1. Nome/formato exato do parâmetro `includedType` em Text Search (New) — se é string única ou array, e se vai no body JSON.
2. Se `languageCode`/`regionCode` vão no corpo JSON do POST (esperado) ou como query string.
3. Preço exato em US$/1.000 chamadas do tier "Text Search Enterprise + Atmosphere" (só visto em blog terceiro, não na tabela oficial de pricing).
4. Cota gratuita exata (número de chamadas/mês) da Amadeus Flight Price Analysis API — visto em resumo de busca, não na página oficial de pricing renderizada.
5. Comportamento exato da Amadeus Flight Price Analysis API para rotas de baixo volume (retorna vazio? erro? valor interpolado por ML sempre?).
6. Rumor de QPX Express ainda ativa para grandes contas enterprise do Google — não confirmado, tratar como não disponível.

**Causa da limitação:** o WebFetch retornou 403 Forbidden em 100% das tentativas neste ambiente (incluindo domínios de controle não relacionados ao Google/Amadeus), portanto todas as citações acima vêm de snippets do WebSearch, não de leitura integral das páginas oficiais.
