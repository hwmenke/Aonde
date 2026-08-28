// Cartoes de compartilhamento em public/og/{ID}.jpg (1200x630).
//
// og:image de oferta e /hoje deve apontar para esses arquivos pelo GET /og/,
// nao para Special:FilePath do Commons (que 302). So devolve o caminho quando
// o arquivo existe no disco — sem inventar cartao.

import { existsSync } from "node:fs";
import path from "node:path";

const OG_DIR = path.join(process.cwd(), "public", "og");
const OG_NAME_RE = /^[A-Z0-9_-]+\.(jpg|jpeg|png)$/;

function ogFilePath(filename) {
  const name = String(filename || "");
  if (!OG_NAME_RE.test(name)) return "";
  // 9:16 stills (*-story.jpg) are for IG/WA stories. GET /og/ still serves
  // them; they must not become og:image / twitter:image (those stay 1200x630).
  if (/-story\./i.test(name)) return "";
  const filePath = path.join(OG_DIR, name);
  if (!existsSync(filePath)) return "";
  return `/og/${name}`;
}

/**
 * Caminho publico do cartao OG da oferta, se public/og/{ID em maiusculas}.jpg
 * existir. Id "gru-fln" → "/og/GRU-FLN.jpg". Sem arquivo → "".
 */
export function ogSharePathForOffer(offerId) {
  const id = String(offerId || "").trim();
  if (!id) return "";
  return ogFilePath(`${id.toUpperCase()}.jpg`);
}

/**
 * Cartao de /hoje: o og:image segue o PRIMEIRO achado reservavel da pagina.
 * Floripa → /og/GRU-FLN.jpg, Salvador → /og/GIG-SSA.jpg. HOJE.jpg (Buenos
 * Aires) so entra quando esse pick e gru-eze; o arquivo fica no repo para
 * quando /hoje voltar a ser Buenos Aires.
 */
export function hojeOgSharePath(firstOfferId) {
  const id = String(firstOfferId || "").trim().toLowerCase();
  if (!id) return "";
  if (id === "gru-eze") {
    return ogFilePath("HOJE.jpg") || ogSharePathForOffer("gru-eze");
  }
  return ogSharePathForOffer(id);
}
