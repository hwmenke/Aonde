# OG Images for Social Sharing

This directory contains Open Graph images for social media sharing
and 9:16 stills for Instagram / WhatsApp stories.

## Landscape cards (1200×630) — og:image only

- **HOJE.jpg** (1200×630) - Share card for /hoje when the first pick is Buenos Aires: São Paulo → Buenos Aires, GRU-EZE, 12–19 set, NO price
- **GRU-EZE.jpg** (1200×630) - Catalog card for GRU-EZE offer page: cities only, NO price
- **GRU-FLN.jpg** (1200×630) - Catalog card for GRU-FLN offer: São Paulo → Florianópolis
- **GIG-SSA.jpg** (1200×630) - Catalog card for GIG-SSA offer: Rio de Janeiro → Salvador
- **FOR-SSA.jpg** (1200×630) - Catalog card for FOR-SSA: Fortaleza → Salvador, 3–10 out, NO price. JPEG bytes did not land in this checkout (attachment was a description). Do not remake. When the file is in this folder, `/ofertas/for-ssa` uses it as og:image. Until then OG falls back to the Salvador dest photo (`thumbUrl`). Never GIG-SSA.jpg (Rio) and never HOJE.jpg.
- **VCP-BUE.jpg** (1200×630) - Catalog card for VCP-BUE offer: Campinas → Buenos Aires
- **GRU-LIS.jpg** (1200×630) - Catalog card for GRU-LIS offer: São Paulo → Lisboa

Do not use the 9:16 story files as og:image.

## Story stills (9:16) — IG / WA stories only

- **GRU-FLN-story.jpg** (9:16) - São Paulo → Florianópolis, 27 set–3 out. Not og:image.
- **GIG-SSA-story.jpg** (9:16) - Rio de Janeiro → Salvador, 7–14 nov. Not og:image.

## Photo Credits

- HOJE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-EZE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-FLN.jpg: Ponte Hercílio Luz, Florianópolis.
- GIG-SSA.jpg: Elevador Lacerda, Salvador.
- FOR-SSA.jpg: Largo do Pelourinho, Salvador. Photo: Paul R. Burley, CC BY-SA 4.0. File: Largo do Pelourinho Salvador 2019-9754.jpg. https://commons.wikimedia.org/wiki/File:Largo_do_Pelourinho_Salvador_2019-9754.jpg
- GRU-FLN-story.jpg: Ponte Hercílio Luz — Rodrigo Soldon, CC BY 2.0
- GIG-SSA-story.jpg: Elevador Lacerda — Ciroamado, CC BY-SA 4.0
- VCP-BUE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-LIS.jpg: Torre de Belém, Lisboa. Photo: Juntas, CC BY-SA 4.0

All cards maintain existing media-credit overlay as designed.
Destination photography stays the destination even if the origin is swapped.

## Usage

Served via GET /og/{filename} (any safe .jpg/.jpeg/.png in this folder).

og:image / twitter:image (landscape cards only):
- /hoje → card of the first bookable pick on the page (`GRU-FLN.jpg`, `GIG-SSA.jpg`, …). `HOJE.jpg` (Buenos Aires) is used only when that pick is GRU-EZE; the file stays in this folder for those days. Never `*-story.jpg`.
- /ofertas/gru-eze → GRU-EZE.jpg
- /ofertas/gru-fln → GRU-FLN.jpg
- /ofertas/gig-ssa → GIG-SSA.jpg
- /ofertas/for-ssa → /og/FOR-SSA.jpg when the file exists; otherwise Salvador dest photo. Never GIG-SSA.jpg. Never HOJE.jpg.
- /ofertas/vcp-bue → VCP-BUE.jpg (when available)
- /ofertas/gru-lis → GRU-LIS.jpg (when available)
