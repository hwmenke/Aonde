import test from 'node:test';
import assert from 'node:assert/strict';
import { renderResultsPage, renderExitPage, renderOffersPage } from '../src/render/htmlRenderer.js';
import { partnerName } from '../src/render/partnerName.js';

const consulta = { origem: 'REC', destino: 'SSA', ida: '2027-08-12', volta: '2027-08-19', adultos: 2, criancas: 1, bebes: 1 };
for (const motivo of ['erro', 'timeout-geral', 'sem-resultados', 'sem-credenciais', 'ok']) {
  test(`submitted search recovers without sample inventory: ${motivo}`, () => {
    const html = renderResultsPage({ searched: true, consulta, rota: consulta, buscaMotivo: motivo });
    assert.doesNotMatch(html, /<article class="res-voo|voos de exemplo|Preços acima são exemplos/);
    assert.match(html, /Buscar esta rota no parceiro/);
    assert.match(html, /\/saida\/voo\?origem=REC&amp;destino=SSA/);
    assert.match(html, /Tentar de novo/);
    assert.match(html, /Editar datas/);
    assert.match(html, /Não consultamos a disponibilidade no parceiro/);
    assert.doesNotMatch(html, /o botão Buscar voos mostra <strong>exemplos/);
    const retry = html.match(/href="([^"]+)">Tentar de novo/)[1];
    const partner = html.match(/href="([^"]+)">Buscar esta rota no parceiro/)[1];
    for (const href of [retry, partner]) {
      const url = new URL(href.replaceAll('&amp;', '&'), 'https://aonde.test');
      for (const [name, value] of Object.entries(consulta)) assert.equal(url.searchParams.get(name), String(value));
    }
    for (const [name, value] of Object.entries(consulta)) {
      if (['adultos', 'criancas', 'bebes'].includes(name)) {
        assert.match(html, new RegExp(`name="${name}"[^>]*>.*?<option value="${value}" selected`));
      } else assert.match(html, new RegExp(`name="${name}"[^>]*value="${value}"`));
    }
  });
}
test('unsubmitted search retains labeled demo', () => {
  const html = renderResultsPage({ searched: false });
  assert.match(html, /data-res-voo/);
  assert.match(html, /voos de exemplo/);
});
test('partner names use allowlisted hosts and provider metadata only', () => {
  for (const [host, name] of Object.entries({ 'tp.media': 'Aviasales', 'www.aviasales.com': 'Aviasales', 'www.hurb.com': 'Hurb', 'www.passagenspromo.com.br': 'Passagens Promo' })) {
    assert.equal(partnerName(`https://${host}/x`), name);
    assert.equal(partnerName(`https://${host}.evil.test/x`), 'site parceiro');
  }
  for (const [provider, name] of Object.entries({travelpayouts:'Aviasales', aviasales:'Aviasales', hurb:'Hurb', passagensPromo:'Passagens Promo'})) assert.equal(partnerName('https://unknown.test', provider), name);
  for (const p of ['awin', 'amadeus']) assert.equal(partnerName('https://www.awin1.com/cread.php', p), 'site parceiro');
  assert.equal(partnerName('invalid', '<script>'), 'site parceiro');
  assert.equal(partnerName('https://constructor/'), 'site parceiro');
  assert.equal(partnerName('https://aviasales.com@evil.test/'), 'site parceiro');
});
test('handoff names partner and explicitly describes new tab', () => {
  const html = renderExitPage({id:'test', cidade:'Salvador'}, { affiliateUrl:'https://www.hurb.com/x' });
  assert.match(html, /Continuar para Hurb/);
  assert.doesNotMatch(html.match(/<main[\s\S]*?<\/main>/)[0], /Redirecionando|Aviasales/);
  assert.match(html, /target="_blank" rel="noopener sponsored"/);
  assert.match(html, /class="visually-hidden">\(abre em nova aba\)/);
  assert.match(html, /comissão/);
});
test('offers lead page; newsletter origin remains editable and follows filter', () => {
  for (const origem of ['', 'REC']) {
    const html = renderOffersPage([], { origem });
    assert.ok(html.indexOf('class="wrap section feed-lista"') < html.indexOf('class="wrap news-wrap"'));
    assert.match(html, /<h1>Achados de hoje<\/h1>/);
    const select = html.match(/<select id="news-origem-hero"[^>]*>(.*?)<\/select>/s)[1];
    assert.match(select, origem ? /value="REC" selected/ : /value="" selected/);
    assert.doesNotMatch(html.match(/<select id="news-origem-hero"[^>]*>/)[0], /disabled/);
  }
});
