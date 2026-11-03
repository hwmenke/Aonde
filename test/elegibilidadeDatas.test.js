import test from 'node:test';
import assert from 'node:assert/strict';
import { datasImpossiveis, viagemAindaVale, offersParaEscolha } from '../src/offers/elegibilidade.js';

const dia = '2026-02-01';
const valida = { id: 'valida', status: 'publicada', ida: '2026-02-20', volta: '2026-02-25' };

for (const [nome, campos] of [
  ['ida em 30 de fevereiro', { ida: '2026-02-30' }],
  ['volta antes da ida', { volta: '2026-02-19' }],
  ['data de exibição impossível', { datas: '31 fev' }],
]) {
  test(`${nome} exclui a oferta`, () => {
    const offer = { ...valida, ...campos };
    assert.equal(datasImpossiveis(offer, dia), true);
    assert.equal(viagemAindaVale(offer, dia), false);
    assert.deepEqual(offersParaEscolha([offer], []), []);
  });
}

test('observação futura só exclui quando há dia válido', () => {
  const offer = { ...valida, seen_at: '2026-02-02T12:00:00Z' };
  assert.equal(viagemAindaVale(offer, dia), false);
  for (const clock of [undefined, null, '', 'inválido', '2026-02-30', '2026-02-01T00:00:00Z']) {
    assert.equal(datasImpossiveis(offer, clock), false);
    assert.deepEqual(offersParaEscolha([offer], [], clock), [offer]);
  }
  assert.deepEqual(offersParaEscolha([offer], [], dia), []);
  assert.deepEqual(offersParaEscolha([], [offer], dia), []);
});

test('oferta válida continua incluída', () => {
  assert.equal(datasImpossiveis(valida, dia), false);
  assert.equal(viagemAindaVale(valida, dia), true);
  assert.deepEqual(offersParaEscolha([valida], [], dia), [valida]);
  assert.deepEqual(offersParaEscolha([], [valida]), [valida]);
});

test('oferta não publicada continua bloqueando o mesmo id editorial', () => {
  const rascunho = { ...valida, status: 'rascunho' };
  assert.equal(viagemAindaVale(rascunho, dia), false);
  assert.deepEqual(offersParaEscolha([rascunho], [valida], dia), []);
});

test('offersParaEscolha exclui editorial com datas impossíveis', () => {
  const editorial = { id: 'editorial', datas: '30–31 fev' };
  assert.deepEqual(offersParaEscolha([valida], [editorial]), [valida]);
});
