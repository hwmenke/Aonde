import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/render/htmlRenderer.js', import.meta.url), 'utf8');
const script = source.slice(source.indexOf("  document.querySelectorAll('[data-newsletter]')"), source.indexOf('  // Formulario de descadastro'));

function setup(fetch) {
  const attrs = new Map();
  const button = { textContent: 'Receber alertas', disabled: false,
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
  const msg = {};
  let submit;
  const form = {
    action: '/newsletter',
    email: { value: 'pessoa@example.com', addEventListener() {}, removeAttribute() {} },
    querySelector: selector => selector === '[data-newsletter-msg]' ? msg : button,
    querySelectorAll: () => [], setAttribute() {},
    addEventListener: (event, handler) => { if (event === 'submit') submit = handler; }
  };
  const timers = new Map();
  let timerId = 0;
  const requests = [];
  vm.runInNewContext(script, {
    document: { querySelectorAll: () => [form] }, AbortController,
    fetch: (...args) => { requests.push(args); return fetch(...args); },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  return { form, button, msg, attrs, timers, requests, submit: () => submit({ preventDefault() {} }) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('stalled newsletter request is aborted and can be retried without losing email', async () => {
  const state = setup(() => new Promise(() => {}));
  state.submit();
  assert.equal(state.button.disabled, true);
  assert.equal(state.timers.size, 1);
  const deadline = [...state.timers.values()][0];
  assert.ok(deadline.delay > 0 && deadline.delay <= 30000);
  deadline.callback();
  await settle();
  assert.equal(state.requests[0][1].signal.aborted, true);
  assert.equal(state.button.disabled, false);
  assert.equal(state.attrs.has('aria-busy'), false);
  assert.equal(state.button.textContent, 'Receber alertas');
  assert.equal(state.form.email.value, 'pessoa@example.com');
  assert.match(state.msg.textContent, /não.*confirmar.*recebimento/i);
  assert.match(state.msg.textContent, /tente de novo/i);
  assert.equal(state.timers.size, 0);
  state.submit();
  assert.equal(state.requests.length, 2);
});

test('timely newsletter success clears its deadline', async () => {
  const state = setup(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ status: 'ok' }) }));
  state.submit();
  assert.equal(state.timers.size, 1);
  await settle();
  assert.equal(state.timers.size, 0);
  assert.equal(state.requests[0][1].signal.aborted, false);
  assert.equal(state.button.disabled, false);
  assert.equal(state.form.email.value, '');
  assert.match(state.msg.textContent, /Pedido recebido/);
});
