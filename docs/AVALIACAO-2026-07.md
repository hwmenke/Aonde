# Avaliação do Aonde — julho de 2026

Dez avaliadores independentes, cada um com uma lente, todos em modo somente
leitura. Cada achado abaixo foi **reproduzido na integração** antes de entrar
nesta lista — o que não foi confirmado está marcado como tal, e o que foi
relatado mas não se sustentou foi descartado.

Marcação: **MEDIDO** = reproduzido com comando/número. **SUSPEITO** = raciocínio
plausível, sem medição.

Base: 533 testes passando, 18 ofertas, 22 roteiros.

---

## 1. Honestidade — o site afirma o que o código não sustenta

Este é o valor central do produto, então vem primeiro.

### 1.1 — CRÍTICO — "Roteiros escritos por quem conhece o destino"

- **MEDIDO.** `src/render/htmlRenderer.js:1489` afirma isso ao usuário.
  `src/render/moreGuides.js:1-4`, no cabeçalho do próprio arquivo, documenta:
  *"12 roteiros editoriais escritos por agentes de turismo (Sonnet)"*.
- 12 dos 22 roteiros (55%) foram gerados por IA. A home afirma o contrário.
- Não é exagero de marketing: é uma afirmação factual falsa sobre a origem do
  conteúdo, exatamente o tipo de coisa que o produto se propõe a não fazer.
- **Decisão editorial do dono do produto**, não técnica. Uma redação possível
  que é verdadeira e continua vendendo: *"Roteiros com dia a dia na ordem certa
  e um bom restaurante para cada dia, conferidos um a um."*

### 1.2 — CRÍTICO — Urgência fabricada

- **MEDIDO.** `src/render/aondeContent.js:156`:
  *"Preço encontrado às 9h de hoje — tarifas assim somem em horas"*
- String estática, nunca reavaliada. A mesma página mostra "publicado há 6 dias"
  ao lado — as duas frases se contradizem na mesma dobra.
- Ocorre em 1 das 18 ofertas. **Correção: apagar a frase.**

### 1.3 — CRÍTICO — Superlativo insustentável

- **MEDIDO.** `src/render/aondeContent.js:155`:
  *"Somos o melhor preço para Portugal no ano."*
- O Aonde não tem como saber nem sustentar isso. **Correção: apagar a frase.**

### 1.4 — CRÍTICO — JSON-LD promete ao Google o que a página nega ao usuário

- **MEDIDO.** `src/render/structuredData.js:233` emite
  `availability: https://schema.org/InStock` com preço firme.
- Na mesma página, `htmlRenderer.js:1782` diz "tarifas de exemplo por enquanto".
- Pior: vale também para `gru-rec`, a oferta marcada como **"Erro de tarifa,
  pode ser cancelado pela cia"** — o dado estruturado afirma disponibilidade
  garantida de uma tarifa que o próprio site diz que pode ser cancelada.
- Risco real de penalização por dado estruturado enganoso, além de ser desonesto.
- **Correção:** só emitir `offers` quando houver preço garantido; caso contrário
  omitir `availability` e `price`.

### 1.5 — CRÍTICO — Contador do cliente rotula preço real como exemplo

- **MEDIDO.** `src/render/htmlRenderer.js:2793` grava, em JS de browser:
  `contador.textContent = visiveis + ' voos de exemplo · ordenar por'`
- Os quatro textos renderizados no servidor respeitam `voosReais`; o do cliente
  não. Com busca ao vivo ligada, o rótulo começa certo e vira "voos de exemplo"
  no primeiro clique em qualquer filtro — passando preço real da Amadeus por
  exemplo.
- Regressão introduzida na própria rodada que criou a distinção real/exemplo:
  a correção parou na camada do servidor.
- **Correção:** passar `voosReais` para o script e usar o mesmo rótulo.

### 1.6 — CRÍTICO — Botões de ordenação decorativos

- **MEDIDO.** `src/render/htmlRenderer.js:2263` renderiza "Mais barato / Mais
  rápido / Recomendado" como `<button>`, sem nenhum listener. Clicar não faz nada.
- O repositório já tem teste documentando esse padrão como corrigido — mas só
  para os checkboxes de filtro, não para a ordenação.
- **Correção:** implementar (a lista já está no DOM) ou remover os botões.

### 1.7 — ALTO — Promessa de WhatsApp sem condição

- **MEDIDO.** `src/render/htmlRenderer.js:1207` promete *"Atendimento humano por
  WhatsApp, todos os dias"* incondicionalmente, mesmo sem `AONDE_WHATSAPP`.
- O próprio arquivo documenta a regra oposta nas linhas 58-61, e todo o resto do
  código a respeita. É o único ponto que escapa.

### 1.8 — ALTO — "12x sem juros" e "5% no Pix" como garantia do Aonde

- **MEDIDO.** Aparece em dezenas de lugares, e a parcela é **calculada**
  (`preço ÷ 12`) inclusive para voos reais da Amadeus (`src/flights/mapAmadeus.js:125`).
- Quem processa o pagamento é sempre o parceiro — o próprio FAQ do site diz isso.
- **Correção:** qualificar ("conforme o parceiro") ou não calcular a parcela.

### 1.9 — ALTO — "Otimizador de datas" se contradiz sozinho

- **MEDIDO.** `src/render/htmlRenderer.js:834,841,855`, presente nas 22 páginas
  de roteiro. Manchete: *"monitoramos todos os dias"*, *"atualizados nas últimas
  24h"*. Rodapé do **mesmo bloco**: *"coletados manualmente, podem não refletir
  o preço agora"*. Os dados são estáticos.
- **Correção:** manter só a versão honesta e apagar a alegação de monitoramento.

### 1.10 — ALTO — E-mail promete descadastro em um clique que não existe

- **MEDIDO.** `src/newsletter/emailTemplates.js:90` diz *"Cancelar inscrição —
  um clique, sem perguntas"*. Clicar num link de e-mail é GET.
  `GET /api/newsletter/unsubscribe` → **405**. Só existe POST+JSON.
- Promessa não cumprível pelo código atual, e problema de LGPD.

---

## 2. Funcional — o site não fecha compra

### 2.1 — CRÍTICO — Nenhuma das 18 ofertas tem link de afiliado

- **MEDIDO** pelo avaliador de conversão. Nenhuma oferta editorial tem
  `affiliate_url`; `/saida/gru-lis` devolve **HTTP 409**. O CTA principal da
  página de oferta nem tenta a saída: manda para `/resultados`, que é busca de
  exemplo.
- O caminho funciona quando existe `affiliate_url` real (verificado semeando uma).
- **É a decisão de produto mais importante da lista.** Hoje, 100% do catálogo
  visível é beco sem saída.

### 2.2 — CRÍTICO — Busca de rota falha em silêncio

- **MEDIDO** por mim:

  | Digitado | Rota entregue |
  |---|---|
  | "Porto Alegre" → "Sao Paulo" | **GRU ⇄ SAO** |
  | "Recife" → "Rio de Janeiro" | **GRU ⇄ RIO** |
  | "xyz" → "abc" | **XYZ ⇄ ABC** |
  | (vazio) | GRU ⇄ REC |

- Quem digita o nome da cidade (comportamento normal) tem a origem trocada
  silenciosamente por GRU, sem nenhum aviso. Lixo é aceito como código de
  aeroporto. Uma pessoa de Porto Alegre recebe voos saindo de São Paulo.
- **Correção:** aceitar nome de cidade (já existe `src/render/aeroportos.js` com
  o mapa IATA→cidade), e quando não reconhecer, **dizer** em vez de adivinhar.

### 2.3 — ALTO — Voos de exemplo são idênticos entre rotas

- **MEDIDO** por mim: `/resultados?origem=GRU&destino=REC` e
  `?origem=CNF&destino=FLN` devolvem os **mesmos números de voo**
  (AD 4102, LA 3342, AD 2917, LA 3260).
- Está rotulado como exemplo, então não é desonesto — mas para um usuário
  cético é prova visível de dado forjado, e destrói a confiança que o resto do
  site trabalha para construir.

### 2.4 — ALTO — O preço da oferta some ao clicar

- **MEDIDO** pelos avaliadores de conversão e persona. A pessoa clica numa
  oferta de R$ 312 e cai numa busca que mostra R$ 1.184–1.310, com outra data,
  sem explicação. Parece isca.

---

## 3. Acessibilidade

Contraste já estava resolvido (zero falhas AA nos dois temas). O resto, não.

### 3.1 — CRÍTICO — Todos os formulários quebram sem JavaScript

- **MEDIDO** por mim. Um `<form method="post">` nativo manda
  `application/x-www-form-urlencoded`. `readJsonBody` (`src/server.js:167`) só
  aceita JSON:

  ```
  POST como formulário nativo  -> 400 {"error":"Corpo da requisicao nao e um JSON valido."}
  POST como JSON (com JS)      -> 200
  ```

- O usuário vê JSON cru na tela, sem HTML e sem caminho de volta. Afeta
  newsletter, alerta de preço e descadastro.
- **Correção:** aceitar os dois formatos e responder HTML quando a requisição
  não for XHR.

### 3.2 — ALTO — Reflow falha a 320px (WCAG 1.4.10)

- **MEDIDO:** `/` (332px), `/ofertas` (400px), `/guias/*` (332px),
  `/resultados` (330px), `/hoje` (360px). Passam: `/mapa`, `/ajuda`, `/alertas`.
- Causa: `minmax(340px,1fr)` e `minmax(280px,1fr)` em grids maiores que o
  viewport (`.hoje-grid:3180`, `.news-card:3168`) e `min-width:260px` fixo em
  `.res-trecho:3401`.
- A 200% de zoom nenhuma rota estoura.

### 3.3 — ALTO — Abas do carrossel sem estado exposto (WCAG 4.1.2)

- **MEDIDO** via `accessibility.snapshot()`: "Praia/Montanha/Urbano" não têm
  `aria-pressed`/`aria-selected`.

### 3.4 — ALTO — Mensagens de status não anunciadas (WCAG 4.1.3)

- `.news-msg` (5 formulários) e a contagem/vazio de `/resultados` não têm
  `aria-live`. O filtro do `/guias` faz certo — o padrão não foi replicado.

### 3.5 — MÉDIO — Pulo de hierarquia H1→H3 em `/hoje` e `/resultados`

**Confirmado correto:** `prefers-reduced-motion` desliga tudo, skip link e ordem
de foco corretos, filtro do `/guias` acessível por teclado com Esc, nenhuma
imagem sem `alt`, SVGs bem marcados.

---

## 4. Segurança e privacidade

Nenhum achado CRÍTICO. XSS, open redirect, SQLi e path traversal foram atacados
com payload real e **seguraram**.

### 4.1 — ALTO — Rate limiting neutralizável por X-Forwarded-For

- **MEDIDO** por mim, 30 POSTs em `/api/newsletter/subscribe`:
  - sem XFF: 20 aceitos, 10 bloqueados (funciona)
  - com XFF forjado por requisição: **30 aceitos, 0 bloqueados**
- `clientIp()` (`src/inboundRateLimiter.js:62`) confia no cabeçalho sem condição.
- **Correção:** só confiar em XFF quando `AONDE_TRUST_PROXY` estiver ligado.

### 4.2 — MÉDIO — CSP sem `default-src`/`script-src`/`style-src`

- `src/server.js:92`. Não há restrição de execução de script. Não explorável
  hoje, mas remove toda defesa em profundidade se um escape falhar no futuro.

### 4.3 — MÉDIO — PII mantida indefinidamente após descadastro

- E-mail e WhatsApp ficam em texto puro em `data/subscribers.json` para sempre,
  só marcados com `unsubscribed_at`. Sem caminho de apagamento efetivo sob
  pedido do titular (LGPD).

### 4.4 — BAIXO — Canal de tempo na inscrição

- Diferença de mediana ~1.7x entre e-mail já confirmado e novo, embora a
  resposta HTTP seja corretamente uniforme.

---

## 5. Robô diário e e-mails

### 5.1 — CRÍTICO — Não existe motor de envio

- `senderImpl` só grava em `alert_queue.jsonl`. Sem provedor, sem worker, sem
  retentativa, sem bounce, sem supressão. A camada de e-mail está escrita mas
  desligada.

### 5.2 — CRÍTICO — `dispatchAlerts` sem deduplicação

- **MEDIDO:** 24 chamadas seguidas com a mesma oferta abaixo do alvo geraram
  **24 notificações** para o mesmo assinante. Assim que houver envio real, um
  cron rodando mais de 1x/dia vira spam garantido.

### 5.3 — ALTO — Só 12 das 18 ofertas podem ser escolhidas pelo robô

- O robô só escolhe ofertas com roteiro casado. 6 ofertas nunca aparecem.

### 5.4 — ALTO — O "dia" depende do fuso do processo

- Sem fuso fixo. Rodando em UTC, a partir de ~21h em Brasília a página `/hoje`
  já mostra a escolha de amanhã com a data rotulada errada.

**Confirmado correto:** distribuição do robô perfeitamente uniforme (10/10 em 60
dias), determinismo por data, `/hoje` nunca cai, templates escapam XSS, têm
texto + HTML, CSS inline, sem urgência falsa, assunto honesto.

---

## 6. SEO

### 6.1 — CRÍTICO — Meta description idêntica em quase todas as páginas

- **MEDIDO** por mim: **2 descriptions distintas em 11 rotas** (só `/hoje`
  difere). Todos os 22 guias e 18 ofertas usam `DEFAULT_DESCRIPTION`.
- Cada guia tem `intro` e cada oferta tem `texto`, únicos, nunca aproveitados.

### 6.2 — ALTO — Título e H1 iguais entre ofertas diferentes

- `/ofertas/gig-ssa` (Rio→Salvador) e `/ofertas/for-ssa` (Fortaleza→Salvador)
  têm o mesmo `<title>` e o mesmo `<h1>Salvador</h1>` — o código usa só o
  destino, sem a origem (`htmlRenderer.js:1931`).

### 6.3 — MÉDIO — `SITE_URL` hardcoded no JSON-LD

- `structuredData.js:16` ignora `getConfig().siteUrl`. Com
  `AONDE_SITE_URL=staging`, o canonical acompanha mas o JSON-LD continua
  apontando para produção.

### 6.4 — MÉDIO — `og:image` sem dimensão e sem `alt`

- Aponta para `Special:FilePath/...` (redirect 302) em vez do arquivo final.
  `wikimediaProvider.js` já sabe resolver a URL final com dimensões.
- **Não verificável aqui:** `commons.wikimedia.org` está bloqueado pela política
  de saída do ambiente (403 no CONNECT). Precisa de conferência externa.

---

## 7. Conteúdo

### 7.1 — ALTO — Nenhum roteiro traz informação prática de risco

- **MEDIDO** nos 22: nenhum tem nota de segurança urbana. `manaus` não menciona
  febre amarela (o alerta existe só numa oferta, não no roteiro que a pessoa lê).
  `cusco`, `bariloche`, `atacama` não mencionam moeda. Nenhum internacional
  menciona documento exigido (RG x passaporte) nem tomada/voltagem.
- Não é falta de enfeite: é informação que muda a viagem.

### 7.2 — MÉDIO — Ordem geográfica com idas e voltas

- `portodegalinhas`, `salvador` e `buenosaires` atravessam a cidade sem
  necessidade dentro do mesmo dia.

### 7.3 — MÉDIO — As ofertas repetem molde

- 78% das 18 abrem com "[Origem]–[Destino] por R$ [preço] ida e volta em [mês]"
  — dado que já aparece em campo próprio logo ao lado.

**Confirmado correto:** frase-molde nos roteiros **não** é problema — só 6
repetições reais entre os 22 (n-gramas de 6 palavras). Amostra de 10
restaurantes checada por busca: todos existem e batem com bairro/dia.

### Destinos sem roteiro, com demanda real

Orlando e Lisboa (**já têm oferta ativa e nenhum roteiro**), Natal/Pipa,
Balneário Camboriú, Punta del Este, Caldas Novas, Nova York, Cancún.

---

## 8. Código

- `htmlRenderer.js` tem **3.590 linhas**, das quais 782 são CSS numa única
  função e 218 são JS de browser em string — 28% não é lógica de servidor.
  Há um plano de 6 passos para dividir, começando pelo CSS (risco baixíssimo).
- **Antes de qualquer divisão:** `src/flights/mapAmadeus.js:19` e
  `src/newsletter/emailTemplates.js:27` importam `formatBRL`/`escapeHtml` de
  `htmlRenderer.js` em vez de `texto.js`, onde as funções realmente moram.
- **Código morto MEDIDO:** `AWIN_RATE_LIMIT` e `TRAVELPAYOUTS_*_RATE_LIMIT`
  exportados e nunca usados (o limite real está duplicado e hardcoded em
  `http.js`). `src/index.js` é um barrel com ~25 exports sem consumidor.
- **Duplicação:** `dailyPick.js:60` (`normalizar`) é cópia byte a byte de
  `texto.js` (`semAcento`). `withMarker()` duplicada entre `htmlRenderer.js:106`
  e `exitFlight.js:34`.
- **Ciclos de importação: nenhum.** O antigo htmlRenderer↔sparkline está de fato
  quebrado.
- **Testes:** 533 passam, cobertura 97,5% de linha mas **82% de branch**. O gap
  estrutural: nenhum teste executa o JS de browser embutido, porque não há DOM no
  projeto. **Um bug na lógica de filtro do cliente não derrubaria nenhum teste**
  — foi exatamente assim que o item 1.5 passou despercebido.
- Os piores buracos de cobertura são os caminhos de degrade (config quebrada,
  histórico corrompido) — justamente os que a filosofia "nunca quebra a página"
  mais precisa proteger.

---

## Ordem sugerida

**Primeiro — honestidade e o que está quebrado de verdade:**
1. Autoria dos roteiros (1.1) — *decisão sua*
2. Apagar urgência fabricada e superlativo (1.2, 1.3) — duas linhas
3. Contador do cliente rotulando preço real como exemplo (1.5)
4. JSON-LD prometendo InStock em tarifa de exemplo e em erro de tarifa (1.4)
5. Formulários sem JS devolvendo JSON cru (3.1)
6. Busca de rota falhando em silêncio (2.2)

**Depois — o que impede o site de existir como negócio:**
7. Ofertas sem link de afiliado (2.1) — *decisão sua*
8. Descadastro por GET (1.10) + dedup de alertas (5.2)
9. Rate limit por XFF (4.1)

**Então — alcance e qualidade:**
10. Meta description por página (6.1)
11. Reflow a 320px (3.2)
12. Avisos de vacina/documento/moeda nos roteiros (7.1)
13. Roteiro para Lisboa e Orlando, que já têm oferta e não têm guia

**Estrutural, quando houver fôlego:**
14. Desacoplar `mapAmadeus`/`emailTemplates` de `htmlRenderer` e extrair o CSS
15. Um teste que execute o JS de browser (o buraco que deixou 1.5 passar)
