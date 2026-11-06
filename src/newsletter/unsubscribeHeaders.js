// Cabecalhos de descadastro (RFC 2369 + RFC 8058 one-click).
// Puros: sem I/O. Quem monta a requisicao do provedor anexa o que fizer sentido.

/** @param {string} unsubscribeUrl URL https absoluta da pagina/API de descadastro */
export function unsubscribeHeaders(unsubscribeUrl) {
  const url = typeof unsubscribeUrl === "string" ? unsubscribeUrl.trim() : "";
  if (!/^https:\/\//i.test(url)) return {};
  // One-click: o provedor/cliente POSTa para a mesma URL; a pagina ja confirma sem formulario.
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
