// Registro manual de links traqueados por rota/oferta.
//
// Hurb e Parceiros Promo nao tem API publica de geracao de links (ver
// docs/PESQUISA-PARCEIROS.md): cada link e gerado manualmente no painel do
// parceiro, um por rota/oferta. Antes deste modulo, so era possivel
// configurar UM link global (HURB_TRACKED_LINK / PASSAGENS_PROMO_TRACKED_LINK).
// Este arquivo adiciona um pequeno "registro" (mapa) que permite cadastrar
// varios links pre-gerados, indexados por offerId ou por rota (origin +
// destination), mantendo a garantia central do modulo: nenhuma falha de
// parsing/config pode lancar excecao.

/**
 * Faz parse de uma string JSON contendo o registro de links traqueados.
 *
 * Nunca lanca excecao: qualquer entrada invalida (ausente, JSON malformado,
 * ou JSON que nao seja um objeto plano — array, string, numero, null, etc.)
 * resulta em `{}` (registro vazio), o que faz os parceiros carem no
 * fallback global (trackedLink) ou no erro "nao configurado" de sempre.
 *
 * @param {string|undefined} rawJson conteudo bruto da env var (ex.: HURB_TRACKED_LINKS_JSON)
 * @returns {Record<string, string>}
 */
export function parseLinkRegistry(rawJson) {
  if (!rawJson) return {};

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    // Falha nao-fatal: so avisamos no console para ajudar a debugar um .env
    // mal formatado, mas o modulo continua funcionando com registro vazio.
    console.warn(
      `[aonde-affiliates] HURB/PASSAGENS_PROMO_TRACKED_LINKS_JSON invalido (JSON malformado): ${
        (err && err.message) || err
      }`
    );
    return {};
  }

  const isPlainObject =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);

  if (!isPlainObject) {
    console.warn(
      "[aonde-affiliates] HURB/PASSAGENS_PROMO_TRACKED_LINKS_JSON invalido (esperado um objeto plano {chave: url}); ignorando."
    );
    return {};
  }

  return parsed;
}

/**
 * Monta a chave de rota usada no registro, a partir de origin/destination.
 * Sempre em maiusculas (ex.: "GRU" + "LIS" => "GRU-LIS").
 *
 * @param {string|undefined} origin
 * @param {string|undefined} destination
 * @returns {string|null} `null` se origin ou destination estiver ausente.
 */
export function buildRouteKey(origin, destination) {
  if (!origin || !destination) return null;
  return `${String(origin).toUpperCase()}-${String(destination).toUpperCase()}`;
}

/**
 * Resolve qual link traqueado usar para uma oferta, seguindo a ordem de
 * prioridade:
 *
 *   1. `explicitLink`               — override explicito passado em options.trackedLink
 *   2. `registry[offerId]`          — match exato por identificador da oferta
 *   3. `registry[buildRouteKey(...)]` — match por rota (origin-destination)
 *   4. `fallbackLink`               — link global unico (HURB_TRACKED_LINK / PASSAGENS_PROMO_TRACKED_LINK)
 *   5. nenhum dos anteriores        — retorna `null`
 *
 * @param {object} params
 * @param {Record<string, string>} [params.registry]
 * @param {string} [params.offerId]
 * @param {string} [params.origin]
 * @param {string} [params.destination]
 * @param {string} [params.explicitLink]
 * @param {string} [params.fallbackLink]
 * @returns {{url: string, source: "override"|"registry:offerId"|"registry:route"|"fallback-global"}|null}
 */
export function resolveTrackedLink({
  registry,
  offerId,
  origin,
  destination,
  explicitLink,
  fallbackLink,
} = {}) {
  if (explicitLink) {
    return { url: explicitLink, source: "override" };
  }

  const safeRegistry = registry && typeof registry === "object" ? registry : {};

  if (offerId && safeRegistry[offerId]) {
    return { url: safeRegistry[offerId], source: "registry:offerId" };
  }

  const routeKey = buildRouteKey(origin, destination);
  if (routeKey && safeRegistry[routeKey]) {
    return { url: safeRegistry[routeKey], source: "registry:route" };
  }

  if (fallbackLink) {
    return { url: fallbackLink, source: "fallback-global" };
  }

  return null;
}
