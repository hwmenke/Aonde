# Pesquisa de Programas de Afiliados de Viagem — Projeto Aonde.com.br

> Data da pesquisa: 22/07/2026
> Objetivo: alimentar um módulo Node.js de geração de links de afiliado e busca de ofertas de passagens.

## Nota metodológica importante (limitação de acesso)

A política de egresso deste ambiente **bloqueou o acesso direto (HTTP 403 no CONNECT / DNS ESERVFAIL)** a praticamente todos os domínios de documentação oficial:
`support.travelpayouts.com`, `travelpayouts.github.io`, `developer.awin.com`, `help.awin.com`, `www.awin.com`, `success.awin.com`, `wiki.awin.com`, `blog.hurb.com`, `www.parceirospromo.com.br`.

Por isso, **não foi possível abrir e transcrever as páginas oficiais palavra por palavra**. As informações abaixo vêm dos resumos indexados dessas mesmas páginas oficiais (via busca). Sempre que um detalhe (ex.: corpo exato de um POST, template exato de URL) **não pôde ser confirmado na fonte**, isso está marcado como **"não confirmado / não documentado publicamente"**. Antes de codar em produção, recomenda-se abrir manualmente as URLs oficiais citadas para validar os campos exatos, pois são elas as fontes canônicas.

---

## 1. Travelpayouts (Aviasales, Kiwi, Hotellook, WayAway)

**Resumo:** É o parceiro mais "programável" dos quatro. Tem **API real de dados/busca**, **API para gerar links de afiliado** e formato de deep link documentado. Exige cadastro na plataforma (para obter token + marker) e conexão a cada marca ("brand") cujos links você quer gerar.

### Tem API real ou só gerador manual?
**API real**, em três frentes:
1. **Aviasales Data API** — preços em cache (histórico de buscas de usuários dos últimos ~2 a 7 dias). É a que serve para um site de curadoria de ofertas.
2. **Aviasales Flights Search API** — busca em tempo real (real-time e multi-city). **Só liberada para projetos com ≥ 50.000 MAU** (usuários ativos mensais). Abaixo disso, usar a Data API.
3. **API for Travelpayouts partner links** — converte um link direto da marca em link de afiliado.

### Autenticação
- **Token de API** (string), obtido no painel em *Profile → API token*.
- Enviado no header **`X-Access-Token`** ou no parâmetro de query **`token`**.
- **`marker`** = seu Partner ID (antigo "marker"), identifica o afiliado; entra nos links e, na Search API, na assinatura.
- **Flights Search API** exige adicionalmente uma **assinatura MD5** (ver abaixo).

### Exige aprovação/cadastro?
- **Sim, cadastro na plataforma Travelpayouts** para ter token + marker.
- **Data API:** disponível após registro, sujeita ao cumprimento do acordo de parceria (sem exigência pública de MAU alta).
- **Flights Search API:** requer **≥ 50.000 MAU** comprovados no projeto.
- Para a **partner-links API** é preciso estar **conectado a cada brand** cujos links deseja gerar.
- Processo: criar conta em travelpayouts.com → pegar token/marker no perfil → aderir às marcas desejadas. Não há tentativa de contornar; é auto-serviço com aprovação por marca.

### Detalhes técnicos concretos

**Base URL:** `https://api.travelpayouts.com`

**a) Data API — endpoints (JSON):**
- `GET https://api.travelpayouts.com/aviasales/v3/search_by_price_range`
  - params: `origin`, `destination`, `value_min`, `value_max`, `one_way`, `direct`, `locale`, `currency`, `market`, `limit`, `page`, `token`
- `GET https://api.travelpayouts.com/aviasales/v3/grouped_prices`
  - **Recomendado no lugar do antigo `/prices.json`.** Retorna as passagens mais baratas para datas específicas encontradas por usuários do Aviasales nas últimas 48h.
- `GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates`
- `GET https://api.travelpayouts.com/aviasales/v3/get_latest_prices`
- (existem ainda endpoints legados de calendário/cheap/month-matrix/city-directions e o **Price Map API** — os caminhos exatos dessas variantes **não foram confirmados** aqui; validar em travelpayouts.github.io/slate)

**Formatos e regras da Data API:**
- Datas nos formatos **`YYYY-MM`** ou **`YYYY-MM-DD`**.
- Resposta sempre JSON: `{ "success": true|false, "data": {...}, "error": null|"..." }`.
- Preços têm validade — checar `expires_at`; não usar preços expirados.
- Dados ficam em cache por até 7 dias.

**Rate limits (Data / ticket search):**
- Por padrão, **máx. 200 requisições por hora por IP** na API de busca de tickets.

**b) Flights Search API (tempo real) — fluxo:**
1. `init_search` (POST) com `marker`, `host`, `user_ip`, `locale`, `trip_class`, `passengers` (`adults`/`children`/`infants`), segmentos `origin`/`destination`/`date`, e a **`signature`**. Retorna um `search_id`.
2. Requisição de resultados usando o `search_id`.

**Assinatura MD5 (Flights Search API):**
- String = `token` + `marker` + **todos os valores dos parâmetros da requisição, ordenados alfabeticamente pela chave, separados por `:`**.
- Exemplo de string a ser hasheada (formato oficial):
  `PutYourTokenHere:beta.aviasales.com:en:PutYourMarkerHere:1:0:0:2022-05-25:BCN:LON:2022-06-18:LON:BCN:Y:127.0.0.1`
- Aplica-se `md5()` sobre essa string; a assinatura vai **tanto no header quanto no body** da chamada de início da busca.

**c) API de geração de links de afiliado (partner links):**
- `POST https://api.travelpayouts.com/links/v1/create`
- Body (campos observados): `trs`, `marker`, `shorten` (bool), `links` (array de URLs de destino). *(A composição exata do JSON não foi 100% confirmada — validar na doc oficial "API for Travelpayouts partner links".)*
- **Limites:** **máx. 100 requisições/minuto por marker**; **máx. 10 links por requisição**; **usar links completos** (não usar links curtos da marca).
- Requer estar conectado às brands correspondentes.

**d) Deep link / template de URL de afiliado (sem API — manual/programático):**
- Template do redirecionador `tp.media`:
  `https://tp.media/r?marker={MARKER}&p={PROGRAM_ID}&u={URL_DESTINO_ENCODED}`
  - Exemplo oficial: `https://tp.media/r?marker=78606&p=4114&u=https://www.aviasales.com`
  - `marker` = seu Partner ID; `p` = ID do programa/marca; `u` = URL de destino (encodada).
- **SubID** para tracking: acrescentar ao marker no formato `{MARKER}.{subID}` (ex.: `marker=1234567.WLActions`). Também há parâmetro `sub_id` na via API.
- Regra de validação: o link final **precisa conter `marker=SEU_ID`**.

**Fontes (páginas oficiais indexadas):**
- https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
- https://support.travelpayouts.com/hc/en-us/articles/30565016140434-Aviasales-Flights-Search-API-real-time-and-multi-city-search
- https://support.travelpayouts.com/hc/en-us/articles/210996008-How-to-create-a-signature-md-5
- https://support.travelpayouts.com/hc/en-us/articles/210995808-Requirements-for-Aviasales-Flight-Search-API-access
- https://support.travelpayouts.com/hc/en-us/articles/25289759198226-API-for-Travelpayouts-partner-links
- https://support.travelpayouts.com/hc/en-us/articles/203955653-ID-and-SubID-Affiliate-marker-and-additional-marker
- https://support.travelpayouts.com/hc/en-us/articles/205895848-What-are-the-restrictions-on-API-requests
- Referência técnica completa (recomendado abrir): https://travelpayouts.github.io/slate/

---

## 2. Awin (rede que hospeda Decolar.com e outras OTAs)

**Resumo:** **API REST real e madura**, incluindo o **Link Builder** para gerar tracking links por programa/anunciante. Autenticação **OAuth2 (token pessoal, Bearer)**. **É obrigatório estar aprovado no programa de cada anunciante** antes de gerar links que paguem comissão.

### Tem API real ou só gerador manual?
**API REST real** (`https://api.awin.com`), com resposta JSON, seguindo princípios REST. Cobre: **Link Builder** (gerar tracking links single e em lote), relatórios de transações, lista de programas do publisher, e **product feeds** (via "Create-a-Feed", exportável por API ou CSV). Também existe UI manual de Link Builder (`ui.awin.com/link-builder`), mas o foco para automação é a API.

### Autenticação
- **OAuth2** — **token de acesso pessoal** criado em `https://ui.awin.com/awin-api`.
- Vinculado à **conta de usuário pessoal** (não a um publisher/advertiser específico).
- Enviado no header **`Authorization: Bearer {access_token}`**.

### Exige aprovação/cadastro?
- **Duas camadas:**
  1. **Aprovação na rede Awin** (screening do publisher; e-mail de aprovação geralmente em 24–48h em dias úteis, com site claro e compliant).
  2. **Aprovação por anunciante:** o publisher **precisa aderir ao programa de cada advertiser** (ex.: Decolar) para ter acesso às ferramentas promocionais e a **tracking links que gerem comissão**. Sem estar "joined"/aprovado no programa, o link não credita.
- O token OAuth2 é criado no próprio painel após aprovação de conta.

### Detalhes técnicos concretos

**Base URL:** `https://api.awin.com`

**Link Builder — gerar 1 link:**
- `POST https://api.awin.com/publishers/{publisherId}/linkbuilder/generate`
- Header: `Authorization: Bearer {access_token}`, `Content-Type: application/json`
- Body (campos observados):
  ```json
  {
    "advertiserId": 12345,
    "destinationUrl": "https://www.decolar.com/...",
    "parameters": {
      "campaign": "aonde-passagens",
      "clickref": "id-interno"
    }
  }
  ```
- Resposta: objeto com **`url`** e, se `shorten=true`, **`shortUrl`** (`shortLink`).

**Link Builder — lote (até 100 links):**
- `POST https://api.awin.com/publishers/{publisherId}/linkbuilder/generate-batch`
- Aceita um **array de requisições** (mesmos campos). Resposta é um JSON com array **`responses`**, cada item com `status` (HTTP status code) e `body`.
- *(O nome exato do endpoint de lote aparece como `generate-batch`; confirmar grafia na doc oficial `developer.awin.com/apidocs/generatebatchlinks`.)*

**Rate limit:**
- **20 chamadas por minuto por usuário** (throttling do Awin).

**Product feeds:**
- Ferramenta **"Create-a-Feed"**: gera feed de produtos (imagens, descrições, preços) por **API ou CSV**. Requer estar aprovado nos programas cujos produtos serão puxados.

**Fontes (páginas oficiais indexadas):**
- https://developer.awin.com/apidocs (Introdução)
- https://developer.awin.com/apidocs/generatelink (Generate Tracking Link)
- https://developer.awin.com/apidocs/generatebatchlinks (Generate Tracking Links batch)
- https://www.awin.com/us/how-to-use-awin/link-builder-api
- https://success.awin.com/s/article/Can-I-create-affiliate-links-in-bulk-via-API
- https://ui.awin.com/awin-api (criação do token OAuth2)
- https://www.awin.com/us/faqs (aprovação por anunciante / joining programmes)

---

## 3. Hurb / Clube Hurb (hurb.com)

**Resumo:** **Não há API pública documentada.** A geração de links é **manual, via painel** ("Traquear URL"). Cadastro simples, gratuito, com **aprovação por e-mail**. O **formato exato do link de afiliado e seus parâmetros não estão documentados publicamente**.

### Tem API real ou só gerador manual?
**Somente painel manual.** No painel do afiliado, escolhe-se a oferta e usa-se a opção **"Traquear URL"**, que gera um novo link rastreável para divulgação. **Nenhuma API pública, endpoint ou documentação técnica de integração foi localizada.** → **não documentado publicamente.**

### Autenticação
- Não se aplica no sentido de API. O rastreamento é feito pelo link gerado no painel (código/identificador do afiliado embutido na URL). **Formato/nome dos parâmetros não documentados publicamente** (a busca não confirmou `cmp`/`ref`/`utm` específicos; materiais de terceiros citam UTMs genéricos, mas isso **não é fonte oficial**).

### Exige aprovação/cadastro?
- **Sim.** Cadastro gratuito em **https://www.clubehu.com.br/** (o Clube Hurb). Preenche-se dados pessoais; **a solicitação é avaliada e há confirmação por e-mail**. Não é obrigatório ter site — pode-se divulgar por redes sociais.
- Comissão citada: até **6,5%** sobre o valor pago em pedidos aprovados; dashboard atualizado diariamente.

### Detalhes técnicos concretos
- **URL base do programa:** `https://www.clubehu.com.br/` (painel de afiliados).
- **Geração de link:** manual, opção **"Traquear URL"** no painel → retorna link rastreável por oferta.
- **Template de deep link / parâmetros exatos:** **não documentado publicamente.** Para o módulo Node.js, **não há como gerar links programaticamente de forma suportada** — seria necessário obter/colar links já traqueados do painel, ou solicitar formalmente ao Hurb um esquema de link/parametrização (não há endpoint público).
- **Rate limits / headers:** não se aplicam (sem API).

**Fontes:**
- https://www.clubehu.com.br/ (cadastro/painel)
- https://blog.hurb.com/afiliados-no-turismo-a-estrategia-do-clube-hurb/ (visão geral — *host bloqueado no ambiente; conteúdo via índice de busca*)
- https://www.mercadoeeventos.com.br/noticias/agencias-e-operadoras/hurb-cria-programa-para-divulgar-ofertas-de-viagens-conheca-o-clube-hurb/
- (Tutoriais de terceiros descrevem o fluxo "Traquear URL"; **não são documentação oficial**.)

---

## 4. Parceiros Promo / Passagens Promo (parceirospromo.com.br, passagenspromo.com.br — grupo Amo Promo)

**Resumo:** **Não há API pública de geração de links documentada.** Trabalha por **portal/painel do afiliado** + **plugin WordPress** (auto-atualizável). Cadastro **com aprovação prévia** (não garantida); ao ser aprovado, o afiliado recebe um **código de afiliado (FRANQ)**. **Formato exato do link não documentado publicamente.**

### Tem API real ou só gerador manual?
**Painel/portal manual + plugin WordPress.** A plataforma oferece: link de afiliado exclusivo, relatórios de acessos/vendas em tempo real, banners/materiais e um **plugin WordPress que atualiza automaticamente**. **Nenhuma API pública documentada (endpoints, auth) foi localizada.** → **API pública não documentada.** (Obs.: a base técnica é a **Amo Promo**, empresa de tecnologia de turismo — pode existir integração B2B sob contrato, mas isso **não é público**.)

### Autenticação
- Não há API pública, portanto sem esquema de auth documentado. O rastreamento se dá pelo **link exclusivo do afiliado** contendo o **código FRANQ**. **Nome/posição exata do parâmetro na URL: não documentado publicamente.**

### Exige aprovação/cadastro?
- **Sim, com aprovação explícita.** Segundo o Termo de Adesão: *"a participação só é considerada após a aprovação do afiliado; o pedido de cadastro não é garantia de aprovação e a ParceirosPromo pode recusar o cadastro."*
- Após aprovado, o afiliado **recebe por e-mail seu código de afiliado (FRANQ)** e acesso ao **Portal do Afiliado** para gerir prospecções e vendas.
- Cadastro em `https://www.parceirospromo.com.br/` (login em `/signin/`).

### Detalhes técnicos concretos
- **URL base do programa:** `https://www.parceirospromo.com.br/` (portal); `https://www.passagenspromo.com.br/` (marca de passagens do grupo).
- **Marcas disponíveis:** comparadores de passagens/voos, hospedagens, seguro viagem, chip internacional, entre outras.
- **Geração de link:** manual no Portal do Afiliado; **plugin WordPress** para integração em sites WP.
- **Template de deep link / parâmetros (FRANQ):** **não documentado publicamente.** Para o módulo Node.js, não há endpoint público de geração; a via suportada é o portal/plugin. Confirmar com o suporte (WhatsApp/e-mail) se disponibilizam esquema de URL parametrizável.
- **Rate limits / headers:** não se aplicam (sem API pública).

**Fontes:**
- https://www.parceirospromo.com.br/
- https://www.parceirospromo.com.br/signin/
- https://www.parceirospromo.com.br/static/img/termo_adesao_afiliados.pdf (Termo de Adesão — regras de aprovação e código FRANQ; *host bloqueado no ambiente; conteúdo via índice de busca*)
- https://www.amopromo.com/ (empresa de tecnologia por trás)

---

## Síntese para implementação (Node.js)

| Parceiro | API de dados/busca | API de geração de link | Auth | Aprovação prévia | Automatizável? |
|---|---|---|---|---|---|
| **Travelpayouts** | **Sim** (Data API; Search API só ≥50k MAU) | **Sim** (`/links/v1/create`) + deep link `tp.media` | Token (`X-Access-Token`) + `marker`; Search API usa assinatura MD5 | Cadastro + conexão por brand; Search API exige 50k MAU | **Sim (alto)** |
| **Awin** | Parcial (product feeds; relatórios) | **Sim** (Link Builder `/publishers/{id}/linkbuilder/generate`) | **OAuth2 Bearer** (token pessoal) | Rede + **por anunciante** | **Sim (alto)** |
| **Hurb / Clube Hurb** | Não (não documentado) | Não — **painel manual "Traquear URL"** | n/a (link do painel) | Cadastro + aprovação por e-mail | **Não** (sem API pública) |
| **Parceiros Promo** | Não (não documentado) | Não — **portal + plugin WordPress** | n/a (código FRANQ no link) | **Sim**, aprovação não garantida | **Não** (sem API pública) |

**Recomendação prática:** construir o módulo em torno de **Travelpayouts** (busca de ofertas de passagens + geração automática de links) e **Awin** (deep links de OTAs como Decolar via Link Builder). Para **Hurb** e **Parceiros Promo**, projetar o módulo para **armazenar links traqueados obtidos manualmente do painel** (ou templates de URL fornecidos formalmente pelo parceiro), já que **não expõem API pública de geração** — não inventar formato de link.

---

## Atualização 22/07/2026 — verificação do corpo do POST `/links/v1/create` (Travelpayouts)

Nova tentativa de confirmar o **corpo exato do POST `/links/v1/create`** (item marcado antes como "não confirmado").

**O que foi tentado nesta rodada:**
- `WebFetch` direto em `https://support.travelpayouts.com/hc/en-us/articles/25289759198226` → **HTTP 403** (mesmo bloqueio da rodada anterior).
- `WebFetch` em `https://travelpayouts.github.io/slate/` → **HTTP 403**.
- Múltiplas buscas `WebSearch` ("travelpayouts links v1 create API request body format", "…response format partner_link…", etc.).

**Resultado — corpo da requisição CONFIRMADO** via os **exemplos oficiais indexados** do artigo "API for Travelpayouts partner links" (retornados na íntegra pelo `WebSearch`, ainda que a página em si permaneça 403). Formato real:

```json
{
  "trs": 197987,
  "marker": 339296,
  "shorten": true,
  "links": [
    { "url": "https://www.aviasales.ge/search/TBS1803PAR1", "sub_id": "exemplo" }
  ]
}
```

**Correções aplicadas em `createLinkViaApi` (`src/partners/travelpayouts.js`):**
1. `links` é um **array de objetos `{ url, sub_id? }`** — antes estava como array de strings.
2. `sub_id` vai **dentro** do objeto do link — antes era concatenado ao marker (`marker.subId`).
3. `trs` é o **ID do projeto conectado à brand** — antes estava sendo preenchido, erroneamente, com `marker.subId`. Agora é um parâmetro próprio (`options.trs`).

**O que permanece NÃO confirmável:** o **formato exato da RESPOSTA** (nome do campo com o link gerado). As páginas com o schema de resposta continuam 403. Por isso o parsing (`extractGeneratedLink`) foi feito **tolerante** — reconhece `link`/`partner_link`/`url`/`shorten_link`/etc., em array ou objeto — e, quando não reconhece nada, retorna `ok:false` com o **corpo bruto resumido** no erro, para facilitar a depuração quando houver credencial real.

**Fonte:** https://support.travelpayouts.com/hc/en-us/articles/25289759198226-API-for-Travelpayouts-partner-links (exemplos obtidos via índice de busca; página 403 no acesso direto).

---

## Amadeus (adicionado 23/07/2026) — Flight Price Analysis API como "preço típico de rota"

**Motivação:** o histórico próprio (Travelpayouts + `src/store/priceHistory.js`) leva semanas para acumular as 5 observações mínimas que `getRouteStats` exige antes de calcular uma média confiável. A **Amadeus Self-Service — Flight Price Analysis API** (`itinerary-price-metrics`) dá a referência estatística de preço **imediatamente**, com um único GET. Não existe API oficial do Google Flights (ver `docs/PESQUISA-GOOGLE.md`), então a Amadeus é a opção oficial mais viável.

**O que foi implementado** (`src/partners/amadeus.js`):
- **OAuth2 Client Credentials Grant:** `POST {base}/v1/security/oauth2/token` (form-urlencoded, `grant_type=client_credentials` + `client_id`/`client_secret`). O token Bearer (validade ~30 min via `expires_in`) é **cacheado em memória** e renovado com margem de 60s. Cache e relógio são resetáveis para testes (`resetAmadeusState`/`setAmadeusClock`, não exportados no `index.js`).
- **`getTypicalPrices({ origin, destination, departureDate, currency="BRL", oneWay })`** → `GET {base}/v1/analytics/itinerary-price-metrics`. Retorna `{ ok, partner:"amadeus", route, quartiles:{ min, first, median, third, max } (em CENTAVOS), currency, oneWay, error? }`. Valida origin/destination como IATA (reutiliza `src/validate.js`) e exige `departureDate` no formato `YYYY-MM-DD`. Credenciais ausentes → `ok:false` com instrução pt-BR (developers.amadeus.com, Self-Service, tier gratuito). **Nunca lança exceção.**
- **Base URL** por env `AMADEUS_ENV=test|production` (default `test` = sandbox `https://test.api.amadeus.com`; produção = `https://api.amadeus.com`).
- **Rate limit:** aplicado na camada `src/http.js` (regra `amadeus`, prefixo `amadeus.com/` que cobre test + produção e os dois endpoints), **10 req/s** — limite documentado do tier de teste. Optou-se por centralizar no `http.js` (em vez de um `rateLimiter` local em `amadeus.js`) para manter o padrão do módulo: toda chamada de rede passa por `http.js` e o balde é único por processo.
- **Integração no monitor** (`src/monitor.js`): nova opção `mediaFallback: "amadeus" | "none"` (default `"none"` — comportamento atual intacto). Quando `getRouteStats` retorna `ok:false` (amostra insuficiente) **e** `mediaFallback==="amadeus"` **e** há credenciais Amadeus, usa a **mediana** dos quartis como média de rota para o `toOffer`, marcando `statsSource: "amadeus-median"` vs `"own-history"` no `perRoute`. Falha da Amadeus **não derruba a rota** (segue sem média). A detecção de erro de tarifa continua exigindo histórico próprio com `sampleCount` (a mediana da Amadeus, sem contagem de amostra, nunca sinaliza erro de tarifa sozinha — decisão conservadora). Flag do CLI: `scripts/monitor.js --media-fallback amadeus`.

**Status a-validar (mesma limitação de acesso das demais seções):** as páginas oficiais da Amadeus retornaram **HTTP 403** neste ambiente, então o **shape EXATO da resposta** de `itinerary-price-metrics` não pôde ser confirmado palavra por palavra. O shape esperado (`{ data: [ { priceMetrics: [ { amount, quartileRanking }, ... ] } ] }`) veio de resumos indexados/workspace público de Postman. Por isso `extractQuartiles` é **tolerante**: aceita `data` como array ou objeto, o array de métricas como `priceMetrics`/`price_metrics`, e cada métrica com a chave em `quartileRanking`/`quartile_ranking`/`ranking` e o valor em `amount`/`value`/`price`; quando não reconhece nada, retorna `ok:false` com o corpo bruto resumido no erro. Também **não confirmados na doc primária:** a cota gratuita mensal exata e o comportamento para rotas de baixo volume (resposta vazia vs. valor interpolado por ML). Antes de produção, validar o schema real com uma credencial em mãos.

**Fontes:** ver `docs/PESQUISA-GOOGLE.md` (seção "Amadeus Self-Service — Flight Price Analysis API") para as URLs oficiais.
