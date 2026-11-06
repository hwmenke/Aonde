import { unsubscribe } from "./subscriberStore.js";

export function parseUnsubscribeEmail({ queryEmail, body } = {}) {
  const email = typeof body?.email === "string" && body.email.trim() ? body.email : queryEmail;
  return typeof email === "string" ? email.trim() : "";
}

export function isOneClickBody(body) {
  return !!body && typeof body === "object" && Object.entries(body).some(
    ([key, value]) => key.trim().toLowerCase() === "list-unsubscribe" &&
      typeof value === "string" && value.trim().toLowerCase() === "one-click"
  );
}

// HTML payloads are renderer inputs; this module has no rendering dependency.
export function decideUnsubscribeResponse({ result, veioDeForm = false, oneClick = false }) {
  if (!result.ok) {
    // One-click agents expect a tiny response, not an HTML page.
    if (oneClick) return { status: 400, kind: "empty", payload: "" };
    return { status: 400, kind: veioDeForm ? "html" : "json",
      payload: veioDeForm ? { ok: false, error: result.error } : { error: result.error } };
  }
  if (oneClick) return { status: 200, kind: "empty", payload: "" };
  if (veioDeForm) return { status: 200, kind: "html", payload: { ok: true, descadastrado: true } };
  return { status: 200, kind: "json", payload: { ok: true, message: "Se o e-mail estava inscrito, foi descadastrado." } };
}

export function processUnsubscribe({ email, veioDeForm, oneClick }) {
  return decideUnsubscribeResponse({ result: unsubscribe(email), veioDeForm, oneClick });
}
