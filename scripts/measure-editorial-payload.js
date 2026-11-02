// Local measurement only; renders existing content without external requests.
import { gzipSync } from 'node:zlib';
import { renderHomePage, renderOffersPage, renderResultsPage, renderGuidePage } from '../src/render/htmlRenderer.js';
import { GUIDE_LIST } from '../src/render/aondeContent.js';
export function measure(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const decoration = html.match(/<div class="seasons3d"[\s\S]*?<div class="s3-veil"><\/div><\/div>/)?.[0] || '';
  return { cssBytes: Buffer.byteLength(css), cssGzipBytes: gzipSync(css).length, decorationBytes: Buffer.byteLength(decoration), decorationElements: [...decoration.matchAll(/<[a-z][^>]*>/g)].length };
}
for (const [page, html] of [ ['/', renderHomePage()], ['/ofertas', renderOffersPage([])], ['/resultados', renderResultsPage()], [`/guias/${GUIDE_LIST[0].id}`, renderGuidePage(GUIDE_LIST[0].id)] ]) console.log(JSON.stringify({page, ...measure(html)}));
