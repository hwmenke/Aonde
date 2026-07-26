# Handoff: Backend do Aonde (aonde.com.br)

## Overview
O **Aonde** é uma plataforma brasileira de viagens que combina **conteúdo editorial** (guias/roteiros de destino), um **motor de reservas whitelabel** (passagens aéreas, hotéis, carros, seguro) e um módulo de **caça-ofertas** de passagens (feed de "achados" com preços abaixo da média, no estilo Melhores Destinos / Passageiro de Primeira) monetizado por **links de afiliado** + **newsletter/alertas de preço**.

O front-end (protótipo em HTML) já existe e está incluído neste pacote. **Esta entrega é a especificação para o Claude Code construir o BACK-END** que dá vida a essas telas: banco de dados, APIs, integrações com parceiros e jobs.

## About the Design Files
Os arquivos em `design/` são **referências de design criadas em HTML** — um protótipo (`Aonde.dc.html`) que mostra a aparência e o fluxo pretendidos, **não é código de produção para copiar**. O front-end final será reconstruído no ambiente do time (Next.js/React recomendado, mas fica a critério de quem implementa). **O foco desta tarefa é o back-end**: modelar dados, expor APIs REST/JSON que alimentem exatamente as telas do protótipo e integrar os serviços de parceiros. Onde o protótipo usa dados fixos (`renderVals()` em `Aonde.dc.html`), esses dados devem passar a vir das APIs descritas abaixo.

## Fidelity
**Hi-fi** para o front-end (cores, tipografia e layout finais — ver Design Tokens). Para o back-end, este README é a fonte de verdade: contratos de API, modelos e regras de negócio.

## Stack recomendada (sugestão, não obrigatória)
- **Runtime/API**: Node.js + TypeScript (NestJS ou Fastify) OU Python (FastAPI). Escolha o que o time domina.
- **Banco**: PostgreSQL (dados relacionais + JSONB para campos flexíveis como roteiros e otimizador).
- **Cache/fila**: Redis (cache de tarifas, rate-limit) + fila (BullMQ/Celery) para jobs de monitoramento de preço e envio de alertas.
- **Busca**: Postgres full-text ou OpenSearch para o feed de ofertas e guias.
- **Auth**: JWT para área "Minha conta"; painel de curadoria com RBAC (admin/editor).
- **Infra BR**: hospedar em região São Paulo; preços sempre em BRL; fuso `America/Sao_Paulo`.

---

## Domínios e modelos de dados

### 1. Offers (Achados / caça-ofertas)
Alimenta o feed de ofertas e a página de detalhe.
```
Offer {
  id: string (slug, ex "gru-lis")
  origem: string (IATA, ex "GRU")
  destino: string (IATA, ex "LIS")
  cidade: string            // "Lisboa"
  local: string             // "Portugal" | "Pernambuco"
  tipo: enum("Nacional","Internacional")
  cia: string               // "TAP", "Azul", "GOL", "LATAM"
  preco_centavos: int       // preço atual em centavos BRL
  media_centavos: int       // média histórica da rota
  economia_centavos: int    // media - preco (derivável)
  desconto_pct: int         // 0-100 (badge "48% abaixo da média")
  is_erro_tarifa: boolean   // badge "Erro de tarifa" (estilo de urgência)
  datas_sugeridas: string   // "12–24 out"
  datas_flex: [{ periodo: string, preco_centavos: int }]  // datas alternativas c/ preço
  texto: text               // explicação curta da oferta
  dicas: string[]           // bagagem, escalas, validade
  thumb_url: string|null    // miniatura do destino (upload da curadoria)
  prova_url: string|null    // print/screenshot do preço encontrado
  affiliate_url: string     // link de afiliado (CTA "Ver oferta")
  status: enum("rascunho","publicada","expirada")
  published_at: timestamp   // usado no "há 2h"
  expires_at: timestamp|null
  created_by: userId        // curadoria humana
}
```
Regras: `desconto_pct` e `economia_centavos` calculados no server; o campo "há 2h" é derivado de `published_at` (não armazenar string). Uma oferta com `is_erro_tarifa=true` recebe badge/tratamento visual distinto.

### 2. Destinations / Guides (conteúdo editorial — roteiros de 5 dias)
Alimenta os cards de "Roteiros" e a página de guia. São 10 no protótipo (Recife/Porto de Galinhas, Salvador, Fernando de Noronha, Rio, Gramado, Bariloche, Chapada Diamantina, Foz do Iguaçu, Jericoacoara, Buenos Aires).
```
Guide {
  id: string (slug)
  tag: string               // "Praia · Pernambuco"
  titulo: string
  resumo: string            // texto do card
  intro: text               // abertura da página
  breadcrumb: string
  hero_image_url: string|null
  hero_credit: string|null  // atribuição da foto
  preco_from_centavos: int  // "a partir de"
  cta_voos: string
  meta: [{ k: string, v: string }]     // Duração, Melhor época, Voo, Base, Estilo
  dias: [{                             // roteiro dia a dia (5 dias)
    n: int, titulo: string, desc: text,
    pontos: [{ nome: string, nota: string }],
    restaurante: string, restaurante_nota: string
  }]
  optimizer: Optimizer                 // ver abaixo
  published: boolean
}
```

### 3. Optimizer (otimizador de datas por destino)
Alimenta o "Otimizador de datas": mapa de preço por mês + melhor janela + comparação com concorrentes.
```
Optimizer {
  dest_name: string          // "Recife (REC)"
  origin: string             // "GRU" (default; idealmente por-origem do usuário)
  months_centavos: int[12]   // preço por mês (Jan..Dez); menor = destaque verde
  best_window: { label: string, preco_centavos: int, save_pct: int, note: string }
  sources: [{ name: string, preco_centavos: int, note?: string, is_best?: boolean }]
                             // "Aonde" (melhor), "Google Flights", "Kayak", "Skyscanner"
  updated_at: timestamp
}
```
Regras: no protótipo os valores são fixos. Em produção, `months_centavos` e `sources` devem ser preenchidos por um **job de monitoramento** (ver Jobs) que coleta tarifas por rota/mês e por fonte de comparação. A célula "mais barata" é o `min(months_centavos)`; a UI já faz o realce.

### 4. Flight search (motor de reservas whitelabel)
Alimenta o formulário de busca (home) e a tela de resultados.
```
SearchQuery { origem, destino, ida: date, volta: date|null, pax: {adultos,criancas,bebes}, cabine }
FlightResult {
  id, cia, numero_voo, saida: datetime, chegada: datetime,
  duracao_min: int, paradas: int, paradas_desc: string,
  preco_centavos: int, parcela_12x_centavos: int,
  fare_class: string, bagagem: {...}, deep_link/offer_id do parceiro
}
```
Ordenação suportada: `mais_barato | mais_rapido | recomendado`. Filtros: paradas, companhias, faixa de horário de partida. **A busca real vem de um agregador/GDS parceiro** (whitelabel) — ver Integrações. O Aonde exibe co-branding discreto ("operado em parceria com…").

### 5. Newsletter / Alertas de preço
```
Subscriber {
  id, email (unique), whatsapp?: string, origem_preferida: string (IATA),
  double_optin_confirmed: boolean, consent_lgpd_at: timestamp,
  channels: ["email","whatsapp"], created_at, unsubscribed_at?
}
AlertRule { subscriber_id, origem, destino?|region?, preco_alvo_centavos?, canais }
```
Regras LGPD: double opt-in por e-mail obrigatório; armazenar consentimento e origem do opt-in; link de descadastro em todo envio; WhatsApp só com opt-in explícito e via provedor oficial (WhatsApp Business API).

### 6. User / Minha conta
```
User { id, nome, email, senha_hash, telefone?, cidade_origem?, criado_em }
Booking { id, user_id, tipo(voo|hotel|carro|seguro), partner_ref, status, valor_centavos, pagamento }
```

---

## Contratos de API (REST/JSON) — o que cada tela precisa

### Feed de ofertas — tela `ofertas`
- `GET /api/offers?origem=GRU&tipo=Internacional&sort=recentes&page=1`
  → `{ items: Offer[], total, page }`. Filtro por origem é o seletor fixo do topo. Ordenar por `published_at desc` por padrão.
- `GET /api/offers/origins` → lista de aeroportos de origem com contagem de ofertas ativas (para os chips "GRU, VCP, GIG, CNF").

### Detalhe da oferta — tela `oferta`
- `GET /api/offers/:id` → `Offer` completo (texto, dicas, datas_flex, prova_url, affiliate_url).
- `GET /api/offers/:id/related?limit=3` → ofertas do mesmo `tipo` (ou mesma rota).
- `POST /api/offers/:id/click` → registra o clique no CTA de afiliado (atribuição/analytics) e retorna `{ redirect: affiliate_url }`. **Toda saída para afiliado passa por aqui** para rastrear conversão.

### Guias / roteiros — telas `home` (cards) e `guia`
- `GET /api/guides` → lista de cards (`tag, titulo, resumo, hero_image_url, melhor_mes derivado do optimizer`).
- `GET /api/guides/:slug` → `Guide` completo incluindo `dias[]` e `optimizer`.

### Busca de voos — telas `home` (form) e `results`
- `POST /api/search/flights` (body: `SearchQuery`) → `{ results: FlightResult[], filters_disponiveis }`.
- `GET /api/search/airports?q=reci` → autocomplete de aeroportos/cidades (IATA + nome PT-BR).

### Ofertas da semana (home)
- `GET /api/deals/weekly` → 4-8 ofertas em destaque com `de/por`, `desconto`, `parcela_12x`, `periodo`.

### Newsletter
- `POST /api/newsletter/subscribe` (body: `{ email, whatsapp?, origem }`) → dispara double opt-in, retorna `{ status: "pending_optin" }`. (No protótipo, o botão só troca para o estado "Tudo certo!".)
- `GET /api/newsletter/confirm?token=…` → confirma double opt-in.
- `POST /api/newsletter/unsubscribe`.

### Pagamento / reserva (whitelabel)
- `POST /api/bookings` → cria reserva no parceiro; suportar **parcelamento em até 12x sem juros** e **Pix com 5% de desconto** (regra de negócio central, exibida em todo o site). Retornar breakdown do preço (à vista Pix vs. 12x).

---

## Integrações com parceiros
- **Motor de voos/hotéis (whitelabel)**: integrar com um agregador/consolidador (ex.: Amadeus/Travelport/Duffel, ou consolidador nacional). O Aonde é a camada de marca; a emissão/reserva ocorre no parceiro. Exibir co-branding discreto no rodapé/módulos.
- **Pagamentos**: gateway BR com **Pix** e **cartão parcelado 12x** (ex.: Pagar.me, Stripe BR, Adyen, MercadoPago). Aplicar 5% off no Pix e 12x sem juros no cartão.
- **Afiliados**: gerar/rotear `affiliate_url` por oferta (redes de afiliado das cias/OTAs). Rastrear clique (`/offers/:id/click`) e, se possível, conversão via postback/S2S.
- **E-mail**: provedor transacional + campanhas (SendGrid/Resend/SES) para double opt-in e alertas.
- **WhatsApp**: WhatsApp Business API (Meta) via BSP (ex.: Zenvia, Twilio) para alertas — respeitar templates aprovados e opt-in.
- **Imagens**: uploads da curadoria (S3 + CDN). No protótipo, os placeholders `<image-slot>` marcam onde entram `hero_image_url`, `thumb_url` e `prova_url`. Fotos de terceiros (ex.: Unsplash) exigem armazenar a atribuição (`hero_credit`).

## Jobs / processos assíncronos
1. **Monitor de tarifas**: varre rotas monitoradas em intervalos, calcula média histórica, detecta quedas e possíveis erros de tarifa → cria `Offer` em `rascunho` para curadoria e alimenta `Optimizer.months_centavos`.
2. **Comparador**: coleta preço de referência em fontes concorrentes para preencher `Optimizer.sources` (uso apenas comparativo/exibição).
3. **Disparo de alertas**: ao publicar oferta, casa com `AlertRule` (origem/destino/preço-alvo) e enfileira e-mail/WhatsApp.
4. **Expiração**: marca ofertas como `expirada` após `expires_at` ou queda de disponibilidade.

## Regras de negócio transversais
- Moeda **BRL**, centavos como inteiros; formatação `R$ 1.847` no front.
- **12x sem juros** e **5% no Pix** aparecem em todo o funil — centralizar num serviço de precificação.
- Textos e datas em **pt-BR**, fuso `America/Sao_Paulo`.
- **LGPD**: consentimento, double opt-in, descadastro, minimização de dados; termos de afiliado transparentes ("podemos receber comissão, sem custo extra").
- Curadoria humana aprova toda oferta antes de publicar (campo `status`).

---

## Design Tokens (para reconstrução do front, se aplicável)
- **Cores**: fundo `#f7f7f5`; texto `#18181b`; secundário `#6b6b66` / `#8a8a84`; bordas `#e7e7e3` / `#dededa`; verde primário `#4d7c0f` (hover `#3f6212`); verde-limão de destaque `#84cc16` / `#a3e635`; tint verde `#f1f8e4`; escuro (seções/rodapé) `#18181b`; alerta "erro de tarifa" `#fde3cf` / texto `#9a3412`.
- **Tipografia**: títulos serifados **Instrument Serif** (400, itálico opcional); corpo/UI **Archivo** (400/500/600/700). Preço em Archivo bold, tamanho dominante (até 56px no detalhe).
- **Raio**: cards 16px; painéis 20px; inputs/botões 12px; chips/badges 999px.
- **Sombra**: cards em hover `0 16px 32px -24px rgba(24,24,27,0.35)`; card de CTA `0 24px 48px -34px rgba(24,24,27,0.3)`.
- **Grid**: largura máx. de conteúdo 1200px; mobile-first (grande parte do tráfego de ofertas vem de WhatsApp/redes) — feeds em `repeat(auto-fit, minmax(280px, 1fr))`.

## Telas no protótipo (`Aonde.dc.html`, prop `screen`)
- `home` — hero cinematográfico (praia/montanha/urbano), busca de voos, ofertas da semana, estilos de viagem, cards de roteiros, experiências (hotel/carro/seguro), confiança.
- `ofertas` — feed de achados + filtro de origem fixo + hero de newsletter + "como funciona".
- `oferta` — detalhe do achado (preço dominante, prova, datas flex, dicas, CTA de afiliado, relacionadas).
- `results` — resultados de busca de voos (filtros, ordenação, "melhor preço").
- `guia` — roteiro de 5 dias + **otimizador de datas** (prop `guia` = slug do destino).

## Files
- `design/Aonde.dc.html` — protótipo completo (template + lógica em `renderVals()` com todos os dados mock; use como espelho dos contratos de API).
- `design/image-slot.js`, `design/support.js` — runtime do protótipo (referência; não é código de produção).

## Observações finais
- Comece pelos modelos `Offer`, `Guide`/`Optimizer` e `Subscriber` + suas rotas GET — são o que mais alimenta o front hoje.
- O motor de voos (busca/reserva) depende do contrato do parceiro whitelabel; modele `FlightResult` como adaptador sobre a resposta do agregador.
- Todos os dados mock estão em `Aonde.dc.html` dentro de `renderVals()` — replique-os como seeds para desenvolvimento.
