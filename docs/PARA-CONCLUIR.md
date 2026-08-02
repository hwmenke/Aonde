# O que falta, e como concluir

Isto é o que **não consigo fazer daqui** — cada item depende de credencial,
decisão editorial ou rede que este ambiente bloqueia. Está em ordem de impacto.
O que já foi feito está em `AVALIACAO-2026-07.md` e no histórico do branch.

---

## 1. Links de afiliado — o site não fecha nenhuma venda

**Estado:** 18 de 18 ofertas sem `affiliate_url`. `/saida/gru-lis` devolve
**HTTP 409**. Todo o produto desemboca num botão que não leva a lugar nenhum.

**Por que não consigo:** exige cadastro em programa de afiliados com CNPJ e
aprovação humana. Não dá para automatizar nem simular.

**O código já está pronto e testado** — verifiquei que o caminho inteiro
funciona quando existe `affiliate_url`. Falta só a credencial.

### Passo a passo

1. **Escolha o programa.** Para voo no Brasil, o caminho mais curto é o
   **Travelpayouts** (rede da Aviasales/Jetradar): cadastro sem CNPJ, aprovação
   em dias, e cobre passagem, hotel e seguro. Alternativas: **Awin** (tem
   Decolar e outras marcas, exige CNPJ) e **Hurb**.
   → `docs/MODULO-AFILIADOS.md` tem o levantamento dos quatro, com o que cada
   um exige.

2. **Cadastre-se e pegue o `marker`.** No Travelpayouts o identificador é um
   número que entra em toda URL. Guarde-o.

3. **Ponha no `.env`:**
   ```
   TRAVELPAYOUTS_MARKER=seu_numero
   TRAVELPAYOUTS_TOKEN=seu_token
   ```
   As duas já são lidas por `src/config.js` — não precisa mexer em código.

4. **Preencha o `affiliate_url` das ofertas.** Duas formas:
   - **Manual, para começar:** em `src/render/aondeContent.js`, cada oferta
     ganha um campo `affiliateUrl` com o link gerado no painel do parceiro.
     Dá para fazer as 18 numa tarde.
   - **Automático, depois:** `src/partners/travelpayouts.js` já sabe montar
     link a partir de origem/destino/data. Ligar isso ao feed elimina o
     trabalho manual — mas só faz sentido quando as ofertas vierem de busca
     ao vivo, não de curadoria.

5. **Confirme que fechou o ciclo:**
   ```bash
   node scripts/serve.js
   # abra /ofertas/gru-lis e clique no botão principal
   # tem de ir para /saida/gru-lis e de lá para o parceiro
   ```
   O teste `test/saidaVoo.test.js` já cobre o caminho; ele passa a exercitar
   dados reais assim que houver `affiliateUrl`.

6. **Só então** volte ao item 5 deste documento (JSON-LD): com preço garantido
   de verdade, as ofertas voltam a poder anunciar `availability: InStock`.

**Cuidado:** o Travelpayouts paga por venda concluída, não por clique. Com 18
ofertas de curadoria e sem tráfego, a receita realista no primeiro mês é
próxima de zero. O item existe para o site deixar de ser beco sem saída, não
como plano de receita.

---

## 2. Autoria dos roteiros — a home afirma algo que não é verdade

**Estado:** `htmlRenderer.js` diz *"Roteiros escritos por quem conhece o
destino"*. O cabeçalho de `src/render/moreGuides.js` documenta que **12 dos 22
foram gerados por IA**. É a única contradição direta ao valor central do
produto, e a única que não se resolve mexendo em código.

**Por que não decido sozinho:** é escolha sua sobre o que o produto é. As três
saídas são legítimas e levam a produtos diferentes.

### As três saídas

**A. Mudar a frase** (1 hora)
Substituir por algo verdadeiro que continue vendendo o valor real:
> "Roteiros com o dia a dia na ordem certa e um bom restaurante para cada dia,
> conferidos um a um."
Não afirma autoria humana, e descreve o que o conteúdo entrega.
- Onde: `src/render/htmlRenderer.js`, na seção `roteirosSectionHtml`.
- Há teste esperando a frase antiga? Não — nenhum teste prende esse texto.

**B. Assumir a autoria mista, com transparência** (meio dia)
Manter a qualidade e dizer como o conteúdo é feito, numa linha no rodapé de
cada roteiro: *"Roteiro montado com apoio de IA e revisado por uma pessoa
antes de publicar."* Isso só vale se a revisão humana **existir de verdade** —
senão troca uma afirmação falsa por outra.

**C. Reescrever os 12** (semanas, ou custo de redator)
Torna a frase original verdadeira. É a única saída que preserva a promessa sem
mudar o texto — e a mais cara.

**Recomendação:** A agora, C aos poucos, nos destinos de maior tráfego. B só
se você realmente for revisar.

---

## 3. As 18 URLs de foto nunca foram verificadas

**Estado:** todas apontam para `commons.wikimedia.org/wiki/Special:FilePath/…`.
Foram encontradas por busca, **nunca confirmadas por requisição** — o host está
bloqueado pela política de saída deste ambiente (403 no CONNECT).

**O risco é assimétrico:** dentro da página, foto quebrada cai no placeholder
(`onerror`). Mas `og:image` **não tem fallback**: se a URL estiver errada, o
preview no WhatsApp e no Facebook quebra — justamente onde o link circula.

### Passo a passo (10 minutos em qualquer máquina com internet)

```bash
node -e "
import('./src/render/aondeContent.js').then(async m => {
  const urls = [...new Set(m.OFFERS.map(o => o.thumbUrl))];
  for (const u of urls) {
    try {
      const r = await fetch(u, { method: 'HEAD', redirect: 'follow' });
      const ct = r.headers.get('content-type') || '';
      console.log(r.ok && ct.startsWith('image/') ? 'OK  ' : 'RUIM', r.status, decodeURIComponent(u.split('FilePath/')[1]));
    } catch (e) { console.log('ERRO', e.message, u); }
  }
});
"
```

Rode o mesmo para `heroSrc` dos 22 roteiros (`m.GUIDES`). Qualquer linha
`RUIM`/`ERRO` é uma foto a trocar. Depois, confirme o preview real colando um
link em https://developers.facebook.com/tools/debug/.

---

## 4. Posicionamento competitivo — a pergunta sem resposta

**Estado:** uma persona experiente (usa Decolar e Kayak) deu **4/10** e disse
que não viu razão para voltar. A avaliação que responderia isso nunca rodou: o
agente morreu no limite de gasto, três vezes.

**Por que não consigo:** exige pesquisa de mercado ampla e atualizada sobre o
que Decolar, 123milhas, MaxMilhas, Google Flights e Skyscanner oferecem hoje.

### Passo a passo

1. Liste o que é **padrão de mercado** e o Aonde não tem: preço em tempo real
   para qualquer rota, só-ida, multitrecho, classe executiva, filtro por
   bagagem, alerta por rota arbitrária (hoje é só das rotas curadas).
2. Liste o que o Aonde tem e os outros não: roteiro dia a dia ligado à oferta,
   rotulagem honesta de preço de exemplo, histórico que se recusa a inventar
   tendência. **Pergunte se isso importa** para quem só quer voo barato.
3. Decida o posicionamento. As duas saídas coerentes:
   - **Virar buscador de verdade** — competir de frente. Caro, e o Google
     Flights é grátis e melhor.
   - **Deixar de competir em busca** — assumir "revista de viagem que também
     vende passagem". Aí a busca genérica de voos vira distração e talvez deva
     sair; o valor está nos roteiros e no alerta das rotas curadas.
4. Meu palpite, para você contestar: a segunda. O site é bom no que os outros
   não fazem e fraco no que eles fazem melhor. Manter `/resultados` como busca
   genérica convida à comparação que o Aonde perde.

---

## 5. JSON-LD: `availability` está desligado de propósito

**Estado:** `structuredData.js` só emite `offers` quando há preço garantido
(sem erro de tarifa **e** com link de afiliado). Como nenhuma oferta tem link,
**nenhuma anuncia preço ao Google** hoje.

Isso é correto agora e passa a ser desperdício depois do item 1. Quando houver
`affiliateUrl`, o `offers` volta sozinho — sem tocar em código. Só confirme:

```bash
node -e "import('./src/render/structuredData.js').then(m=>console.log(JSON.stringify(m.buildOfferProduct({cidade:'Lisboa',preco:'R\$ 1.847',href:'/ofertas/x',affiliateUrl:'https://parceiro/x'}),null,1)))"
```

---

## 6. Cron: nada roda sozinho ainda

O robô do dia e o worker de e-mail existem e são idempotentes, mas **nenhum
está agendado**.

```cron
# escolha do dia — 6h no horário de Brasília (09:00 UTC)
0 9 * * *  cd /caminho/do/aonde && node scripts/daily-pick.js --json >> logs/dia.log 2>&1

# fila de alertas — de hora em hora
0 * * * *  cd /caminho/do/aonde && node scripts/enviar-alertas.js >> logs/envio.log 2>&1
```

Os dois são seguros para rodar mais de uma vez: o robô é determinístico por
data, e o worker tem checkpoint (testado — rodar duas vezes não reenvia).

**Antes de agendar o envio**, configure o provedor:
```
AONDE_EMAIL_PROVIDER=resend
AONDE_EMAIL_API_KEY=re_xxxx
AONDE_EMAIL_FROM=alertas@aonde.com.br   # domínio VERIFICADO no provedor
```
Sem isso o worker roda em modo registro e diz que não enviou nada — de
propósito.

---

## 7. Produção: o que falta antes de pôr no ar

- `AONDE_SITE_URL` com o domínio real (alimenta canonical, og:url e JSON-LD).
- `AONDE_TRUST_PROXY=1` **só** se houver proxy reverso reescrevendo
  `X-Forwarded-For`. Exposto direto, deixe desligado — senão o limite de taxa
  volta a ser contornável.
- HTTPS e HSTS ficam no proxy; o servidor Node não os fornece.
- Backup de `data/` — hoje é o único lugar onde vivem assinantes, alertas e
  histórico de preço. É JSON em disco, sem réplica.
- A CSP ainda usa `'unsafe-inline'` porque o site embute `<script>` e
  `<style>`. Trocar por nonce por resposta é o próximo aperto de segurança.
