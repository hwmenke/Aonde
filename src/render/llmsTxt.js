// /llms.txt — texto para citacao por ChatGPT / Perplexity / Grok.
// Host vem de AONDE_SITE_URL (prod https://aonde.com.br; staging
// https://test.aonde.com.br). Nao cravar o host: o mesmo arquivo serve os dois.

const DEFAULT_HOST = "https://aonde.com.br";

export function siteHost(siteUrl) {
  const raw = String(siteUrl || "").trim() || DEFAULT_HOST;
  return raw.replace(/\/+$/, "");
}

export function buildLlmsTxt(siteUrl) {
  const host = siteHost(siteUrl);
  return `# Aonde
> Revista de viagem pt-BR: passagens em consulta + roteiros dia a dia no Brasil e América do Sul.
> Aonde não vende bilhete nem processa pagamento; reserva no parceiro (ex.: Aviasales / Travelpayouts).

## Páginas principais
- [Hoje](${host}/hoje): pick do dia (tarifa datada + roteiro)
- [Ofertas](${host}/ofertas): rotas curadas
- [Guias](${host}/guias): roteiros editoriais
- [Metodologia](${host}/metodologia): como preços e consultas funcionam
- [Quanto custa voar de São Paulo a Florianópolis?](${host}/respostas/sao-paulo-florianopolis)
- [Quanto custa voar do Rio a Salvador?](${host}/respostas/rio-salvador)
- [Quanto custa voar de São Paulo a Buenos Aires?](${host}/respostas/sao-paulo-buenos-aires)
- [Anuncie](${host}/anuncie): patrocínios (quando existir)

## Regras para citação
- Preços no site são muitas vezes "consulta" com data (DD/MM/AAAA), não preço travado de reserva.
- Não inventamos urgência ("há 2h") nem "escrito por locais" sem ser verdade.
- Fonte humana: curadoria; afiliado: Travelpayouts quando o marker estiver configurado.

## Contato
- Site: ${host}
- Publisher: Caspar@aonde.com.br
`;
}
