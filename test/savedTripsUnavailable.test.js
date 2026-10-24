import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { catalogoSalvos, SALVOS_CHAVE, scriptSalvos } from "../src/render/savedTrips.js";

test("unavailable saved items can be removed without removing valid items", () => {
  const valid = catalogoSalvos()[0];
  assert.ok(valid, "the catalog must contain a valid item");
  const missing = { tipo: valid.tipo === "guia" ? "oferta" : "guia", id: valid.id };
  const catalog = [valid];
  const storage = new Map([[SALVOS_CHAVE, JSON.stringify({
    v: 1,
    ids: [missing, { tipo: valid.tipo, id: valid.id }],
  })]]);
  const status = { textContent: "" };
  let buttons = [];
  const list = {
    html: "",
    set innerHTML(html) {
      this.html = html;
      buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map((match) => {
        const attributes = Object.fromEntries(
          [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]]),
        );
        const listeners = {};
        return {
          getAttribute: (name) => attributes[name],
          setAttribute: (name, value) => { attributes[name] = value; },
          addEventListener: (name, handler) => { listeners[name] = handler; },
          click: () => listeners.click(),
        };
      });
    },
    querySelectorAll: (selector) => selector === "[data-salvar]" ? buttons : [],
  };
  const document = {
    querySelector: (selector) => ({
      "[data-salvos-lista]": list,
      "[data-salvar-status]": status,
    })[selector] || null,
    querySelectorAll: (selector) => list.querySelectorAll(selector),
    getElementById: (id) => id === "salvos-catalogo"
      ? { textContent: JSON.stringify(catalog) } : null,
  };
  runInNewContext(scriptSalvos(), {
    document,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });

  assert.match(list.html, /Este item salvo não está mais disponível/);
  const remove = buttons.find((button) =>
    button.getAttribute("data-tipo") === missing.tipo
    && button.getAttribute("data-id") === missing.id);
  assert.ok(remove, "the unavailable item must have a removal control");
  remove.click();

  assert.deepEqual(JSON.parse(storage.get(SALVOS_CHAVE)), {
    v: 1, ids: [{ tipo: valid.tipo, id: valid.id }],
  });
  assert.equal(status.textContent, "Removido dos salvos.");
  assert.doesNotMatch(list.html, /Este item salvo não está mais disponível/);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].getAttribute("data-tipo"), valid.tipo);
  assert.equal(buttons[0].getAttribute("data-id"), valid.id);
});
