import test from 'node:test';
import assert from 'node:assert/strict';
import { auditOfferDates } from '../src/audit/offerDates.js';
import { viagemAindaVale, offersParaEscolha, _resetLogElegibilidade } from '../src/offers/elegibilidade.js';

test('registra exclusões por datas uma vez e respeita o silêncio dos testes', () => {
  const originalWarn = console.warn;
  const originalEnv = process.env.AONDE_LOG_ELEGIBILIDADE;
  const logs = [];
  const dia = '2026-02-01';
  const bad = { id: 'oferta-impossivel', status: 'publicada', ida: '2026-02-30', volta: '2026-02-29' };
  const valid = { id: 'oferta-valida', status: 'publicada', ida: '2026-02-20' };
  try {
    process.env.AONDE_LOG_ELEGIBILIDADE = '1';
    console.warn = (...args) => logs.push(args);
    _resetLogElegibilidade();
    assert.equal(viagemAindaVale(bad, dia), false);
    assert.equal(viagemAindaVale(bad, dia), false);
    assert.deepEqual(offersParaEscolha([bad], [], dia), []);
    const reasons = auditOfferDates([bad], dia).map(({ field, message }) => `${field}: ${message}`).join('; ');
    assert.deepEqual(logs, [[`[elegibilidade] oferta ${bad.id} fora do site: ${reasons}`]]);

    logs.length = 0;
    assert.equal(viagemAindaVale(valid, dia), true);
    assert.deepEqual(offersParaEscolha([valid], [], dia), [valid]);
    assert.deepEqual(logs, []);

    delete process.env.AONDE_LOG_ELEGIBILIDADE;
    assert.ok(process.env.NODE_TEST_CONTEXT);
    _resetLogElegibilidade();
    assert.equal(viagemAindaVale(bad, dia), false);
    assert.deepEqual(offersParaEscolha([bad], [], dia), []);
    assert.deepEqual(logs, []);
  } finally {
    console.warn = originalWarn;
    if (originalEnv === undefined) delete process.env.AONDE_LOG_ELEGIBILIDADE;
    else process.env.AONDE_LOG_ELEGIBILIDADE = originalEnv;
    _resetLogElegibilidade();
  }
});
