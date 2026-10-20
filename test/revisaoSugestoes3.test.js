// Terceira leva de sugestões: promessas da home, seletor de aeroporto,
// bagagem, logística do dia, hospedagem com cidade, filtros de guias,
// hierarquia do card de voo e páginas de região.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.js";
import { mapAmadeusOffersToFlights } from "../src/flights/mapAmadeus.js";
import { resolveAeroporto, sugerirAeroportos, rotuloCompletoAeroporto } from "../src/render/aeroportos.js";
import { catalogoDescoberta, hubPorSlug } from "../src/render/descoberta.js";
import { pageStyles } from "../src/render/estilos.js";
import { GUIDE_LIST } from "../src/render/aondeContent.js";
import { partesDaTag } from "../src/render/guideLinks.js";
import {
  renderGuidePage,
  renderGuidesIndexPage,
  renderHomePage,
  renderRegiaoPage,
  renderResultsPage,
} from "../src/render/htmlRenderer.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function oferta(travelerPricings) {
  return {
    price: { grandTotal: "900.00", currency: "BRL" },
    validatingAirlineCodes: ["G3"],
    itineraries: [
      {
        duration: "PT3H",
        segments: [
          {
            carrierCode: "G3",
            number: "1234",
            departure: { iataCode: "GRU", at: "2027-08-12T08:00:00" },
            arrival: { iataCode: "REC", at: "2027-08-12T11:00:00" },
          },
        ],
      },
      {
        duration: "PT3H",
        segments: [
          {
            carrierCode: "G3",
            number: "1235",
            departure: { iataCode: "REC", at: "2027-08-19T18:00:00" },
            arrival: { iataCode: "GRU", at: "2027-08-19T21:00:00" },
          },
        ],
      },
    ],
    travelerPricings,
  };
}

test("home troca promessas sem fonte por texto que o site consegue cumprir", () => {
  const home = renderHomePage({});
  assert.doesNotMatch(home, /Aonde Viagens Ltda/);
  assert.doesNotMatch(home, /plataformas certificadas/i);
  assert.doesNotMatch(home, /40 mil/);
  assert.doesNotMatch(home, /5% off|12x sem juros|sempre com voo direto/i);
  assert.doesNotMatch(home, /todos os dias/);
  assert.match(home, /A reserva é feita no site do parceiro/);
  assert.match(home, /0 a mais/);
  assert.match(home, /quando o parceiro oferece/);
  const inicioExtras = home.indexOf('id="extras"');
  const extras = home.slice(inicioExtras, home.indexOf("conf-card", inicioExtras));
  assert.match(extras, /href="\/guias"/);
  assert.match(extras, /Datas e hóspedes não vão nesse link/);
  assert.doesNotMatch(extras, /hotellook\.com/);
  assert.doesNotMatch(extras, /Ver pacotes/);
});

test("chips de estilo apontam para o roteiro ou para o filtro correspondente", () => {
  const home = renderHomePage({});
  const estilos = home.slice(home.indexOf('id="estilos"'), home.indexOf('id="extras"'));
  assert.match(estilos, /href="\/guias\/portodegalinhas"/);
  assert.match(estilos, /href="\/guias\/maceio"/);
  assert.match(estilos, /href="\/guias\/jeri"/);
  assert.match(estilos, /href="\/guias\?estilo=praia"/);
  assert.match(estilos, /href="\/guias\?estilo=cidade-historica"/);
  assert.match(estilos, /href="\/guias\/bariloche"/);
  assert.doesNotMatch(estilos, /href="\/ofertas"/);
  assert.doesNotMatch(estilos, /Morro de São Paulo|Valle Nevado|Ushuaia/);
});

test("seletor usa o registro: cidade, nome e IATA, sem busca da cidade inteira", () => {
  assert.equal(resolveAeroporto("São Paulo"), "GRU");
  assert.equal(resolveAeroporto("São Paulo · Congonhas (CGH)"), "CGH");
  assert.equal(resolveAeroporto("galeao"), "GIG");
  assert.equal(resolveAeroporto("Buenos Aires"), "EZE");
  assert.equal(rotuloCompletoAeroporto("CGH"), "São Paulo · Congonhas (CGH)");
  const paulo = sugerirAeroportos("sao paulo").map((o) => o.iata);
  assert.deepEqual(paulo.sort(), ["CGH", "GRU"]);
  assert.equal(sugerirAeroportos("congonhas")[0].iata, "CGH");
  assert.ok(!sugerirAeroportos("buenos").some((o) => o.iata === "BUE"));
  assert.ok(sugerirAeroportos("buenos").some((o) => o.iata === "EZE"));
  assert.ok(sugerirAeroportos("buenos").some((o) => o.iata === "AEP"));

  const home = renderHomePage({});
  assert.match(home, /list="busca-origem-dados"/);
  assert.match(home, /São Paulo · Guarulhos \(GRU\)/);
  assert.match(home, /<button type="button" class="sc-swap" data-troca-rota hidden>/);
  const troca = home.slice(home.indexOf("[data-troca-rota]"), home.indexOf("semAcentoCampo"));
  assert.match(troca, /\[name=origem\]/);
  assert.match(troca, /\[name=destino\]/);
  assert.doesNotMatch(troca, /ida|volta|adultos|criancas|bebes/);
  assert.match(home, /removeAttribute\('list'\)/);
  assert.match(home, /ArrowDown/);
  assert.match(home, /Escape/);
});

test("bagagem e regras só aparecem como a resposta da busca trouxe", () => {
  const [voo] = mapAmadeusOffersToFlights({
    data: [
      oferta([
        {
          travelerType: "ADULT",
          price: { total: "700.00" },
          fareDetailsBySegment: [
            {
              cabin: "ECONOMY",
              brandedFare: "LIGHT",
              includedCheckedBags: { quantity: 0 },
              amenities: [{ description: "REFUNDABLE TICKET", amenityType: "BRANDED_FARES", isChargeable: true }],
            },
            {
              cabin: "BUSINESS",
              fareBasis: "Y26",
              includedCheckedBags: { weight: 23, weightUnit: "KG" },
              includedCabinBags: { quantity: 1 },
              amenities: [
                { description: "CHANGE BEFORE DEPARTURE", amenityType: "BRANDED_FARES", isChargeable: false },
                { description: "SEAT SELECTION", amenityType: "BRANDED_FARES" },
              ],
            },
          ],
        },
        {
          travelerType: "HELD_INFANT",
          price: { total: "200.00" },
          fareDetailsBySegment: [{ cabin: "ECONOMY" }],
        },
      ]),
    ],
  });
  assert.equal(voo.inclusoes[0].tipo, "Adulto");
  assert.equal(voo.inclusoes[0].trechos[0].cabine, "Econômica");
  assert.equal(voo.inclusoes[0].trechos[0].tarifa, "LIGHT");
  assert.equal(voo.inclusoes[0].trechos[0].despachada.texto, "não incluída (0)");
  assert.equal(voo.inclusoes[0].trechos[0].mao.texto, "não informada");
  assert.equal(voo.inclusoes[0].trechos[0].amenidades[0].cobranca, "extra pago");
  assert.equal(voo.inclusoes[0].trechos[1].cabine, "Executiva");
  assert.equal(voo.inclusoes[0].trechos[1].tarifa, "Y26");
  assert.equal(voo.inclusoes[0].trechos[1].despachada.texto, "23 KG");
  assert.equal(voo.inclusoes[0].trechos[1].mao.texto, "1 volume");
  assert.equal(voo.inclusoes[0].trechos[1].amenidades[0].cobranca, "incluído na tarifa");
  assert.equal(voo.inclusoes[0].trechos[1].amenidades[1].cobranca, "não informado se é pago");
  assert.equal(voo.inclusoes[1].tipo, "Bebê de colo");
  assert.equal(voo.inclusoes[1].trechos[0].despachada.texto, "não informada");

  const [sem] = mapAmadeusOffersToFlights({ data: [oferta(undefined)] });
  assert.equal(sem.inclusoes, null);
  const html = renderResultsPage({
    voos: [voo],
    voosReais: true,
    rota: { origem: "GRU", destino: "REC", resumo: "" },
    consulta: { destino: "REC", ida: "2027-08-12", volta: "2027-08-19" },
  });
  const card = html.slice(html.indexOf('class="res-voo'), html.indexOf("</article>"));
  const itinerario = card.indexOf("res-itinerario");
  const preco = card.indexOf("res-preco");
  const cta = card.indexOf("Buscar esta rota no parceiro");
  const detalhes = card.indexOf("res-detalhes");
  assert.ok(itinerario < preco && preco < cta && cta < detalhes);
  assert.match(card, /Volta 18:00/);
  assert.ok(card.indexOf("res-parcela") > detalhes);
  assert.match(card, /conta ilustrativa, não uma oferta de parcelamento/);
  assert.match(card, /não incluída \(0\)/);
  assert.match(card, /Alteração e reembolso: não informados/);
  const hotel = html.match(/<aside class="res-hotel">[\s\S]*?<\/aside>/);
  assert.ok(hotel);
  assert.match(hotel[0], /Hospedagem em Recife/);
  assert.match(hotel[0], /destination=Recife/);
  assert.match(hotel[0], /Datas e hóspedes não vão nesta URL/);
  assert.doesNotMatch(hotel[0], /checkIn|adults=/);
});

test("o dia mostra logística só quando o roteiro trouxe, e o plano original fica", () => {
  const html = renderGuidePage("portodegalinhas");
  const dia1 = html.slice(html.indexOf('id="dia-1"'), html.indexOf('id="dia-2"'));
  assert.doesNotMatch(dia1, /Como se deslocar|Precisa reservar|Acessibilidade|Se o tempo mudar/);
  const dia3 = html.slice(html.indexOf('id="dia-3"'), html.indexOf('id="dia-4"'));
  assert.match(dia3, /Como se deslocar/);
  assert.match(dia3, /Transfer de 1h saindo cedo, do Recife até a vila/);
  assert.match(dia3, /Precisa reservar/);
  assert.match(dia3, /Dia de piscinas naturais/);
  assert.doesNotMatch(dia3, /Se o tempo mudar|Acessibilidade/);
  const onde = html.slice(html.indexOf('id="onde-ficar"'), html.indexOf('id="onde-ficar"') + 1200);
  assert.match(onde, /destination=/);
  assert.match(onde, /Datas e hóspedes não vão nesta URL/);
});

test("filtros de guias nascem das tags, ficam na URL e o catálogo inteiro existe sem JS", () => {
  const praia = renderGuidesIndexPage({ estilo: "praia" });
  assert.match(praia, /rel="canonical" href="[^"]*\/guias\?estilo=praia"/);
  assert.match(praia, /aria-current="true"/);
  assert.match(praia, /href="\/guias">Limpar filtros/);
  assert.match(praia, /<span class="chip-n">/);
  assert.match(praia, /data-guia-busca hidden/);
  const desconhecido = renderGuidesIndexPage({ estilo: "orcamento-baixo" });
  assert.match(desconhecido, /Não há um filtro com esse nome/);
  assert.match(desconhecido, /rel="canonical" href="[^"]*\/guias"/);
  const vazio = renderGuidesIndexPage({ regiao: "bahia", estilo: "neve" });
  assert.match(vazio, /Nenhum roteiro combina esses filtros/);
  assert.match(vazio, /href="\/guias">Ver o catálogo inteiro/);
});

test("página de região só existe para hub editorial e o resto é 404", async () => {
  const hubs = catalogoDescoberta().hubs;
  assert.ok(hubs.length >= 1);
  assert.ok(hubs.every((h) => h.guias.length >= 3));
  const hub = hubs[0];
  const pagina = renderRegiaoPage(hub.slug);
  assert.match(pagina, new RegExp(`Roteiros em ${hub.nome}`));
  assert.match(pagina, /não cobre todo destino possível/);
  assert.match(pagina, new RegExp(`rel="canonical" href="[^"]*/regioes/${hub.slug}"`));
  assert.match(pagina, /BreadcrumbList/);
  assert.equal(renderRegiaoPage("destino-que-nao-existe"), null);

  const guia = GUIDE_LIST.find((g) => hubPorSlug(partesDaTag(g.tag).regiao));
  assert.ok(guia);
  const htmlGuia = renderGuidePage(guia.id);
  const slug = hubPorSlug(partesDaTag(guia.tag).regiao).slug;
  assert.match(htmlGuia, new RegExp(`href="/regioes/${slug}">Mais roteiros em`));

  const ok = await fetch(`${base}/regioes/${hub.slug}`);
  assert.equal(ok.status, 200);
  const ruim = await fetch(`${base}/regioes/destino-que-nao-existe`);
  assert.equal(ruim.status, 404);
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemap, new RegExp(`/regioes/${hub.slug}`));
});

test("pesos 500 e 600 do Archivo têm fallback com a mesma métrica do 400", () => {
  const css = pageStyles();
  assert.match(css, /font-family:"Archivo Fallback";font-weight:400;/);
  assert.match(css, /font-family:"Archivo Fallback";font-weight:500;/);
  assert.match(css, /font-family:"Archivo Fallback";font-weight:600;/);
  assert.match(css, /font-family:"Archivo Fallback";font-weight:700;/);
});
