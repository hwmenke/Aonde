# OG Images for Social Sharing

This directory contains Open Graph images for social media sharing
and 9:16 stills for Instagram / WhatsApp stories.

## Landscape cards (1200×630) — og:image only

- **HOJE.jpg** (1200×630) - Share card for /hoje when the first pick is Buenos Aires: São Paulo → Buenos Aires, GRU-EZE, 12–19 set, NO price
- **GRU-EZE.jpg** (1200×630) - Catalog card for GRU-EZE offer page: cities only, NO price
- **GRU-FLN.jpg** (1200×630) - Catalog card for GRU-FLN offer: São Paulo → Florianópolis
- **GIG-SSA.jpg** (1200×630) - Catalog card for GIG-SSA offer: Rio de Janeiro → Salvador
- **FOR-SSA.jpg** (1200×630) - Catalog card for FOR-SSA: Fortaleza → Salvador, 3–10 out, NO price. WhatsApp og:image. `/ofertas/for-ssa` uses `/og/FOR-SSA.jpg`. Never GIG-SSA.jpg (Rio) and never HOJE.jpg. Do not add `FOR-SSA-story.jpg` or `FOR-SSA-ig.jpg`.
- **GRU-SCL.jpg** (1200×630) - São Paulo → Santiago, 2–9 nov. `/ofertas/gru-scl` uses `/og/GRU-SCL.jpg`. Never Güldem Üstün. Never a GRU-LIS or Andes-only still.
- **REC-GIG.jpg** (1200×630) - Recife → Rio, 10–17 out. `/ofertas/rec-gig` uses `/og/REC-GIG.jpg`. Never GRU, never Salvador, never GIG-SSA.jpg.
- **POA-MVD.jpg** (1200×630) - Porto Alegre → Montevidéu, 10–17 out. `/ofertas/poa-mvd` uses `/og/POA-MVD.jpg`.
- **CGH-IGU.jpg** (1200×630) - Congonhas → Foz, 10–17 out. Title Congonhas, NOT GRU. `/ofertas/cgh-igu` uses `/og/CGH-IGU.jpg`. Never GRU-EZE.jpg, never a GRU origin card.
- **GRU-BRC.jpg** (1200×630) - São Paulo → Bariloche, 11–18 out. `/ofertas/gru-brc` uses `/og/GRU-BRC.jpg`.
- **VCP-BUE.jpg** (1200×630) - Catalog card for VCP-BUE offer: Campinas → Buenos Aires
- **GRU-LIS.jpg** (1200×630) - Catalog card for GRU-LIS offer: São Paulo → Lisboa

Do not use the 9:16 story files as og:image. Do not add `*-story.jpg` or `*-ig.jpg` for these lock weeks.

## Story stills (9:16) — IG / WA stories only

- **GRU-FLN-story.jpg** (9:16) - São Paulo → Florianópolis, 27 set–3 out. Not og:image.
- **GIG-SSA-story.jpg** (9:16) - Rio de Janeiro → Salvador, 7–14 nov. Not og:image.

## Photo Credits

- HOJE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-EZE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-FLN.jpg: Ponte Hercílio Luz, Florianópolis.
- GIG-SSA.jpg: Elevador Lacerda, Salvador.
- FOR-SSA.jpg: Largo do Pelourinho, Salvador. Photo: Paul R. Burley, CC BY-SA 4.0. File: Largo do Pelourinho Salvador 2019-9754.jpg. https://commons.wikimedia.org/wiki/File:Largo_do_Pelourinho_Salvador_2019-9754.jpg
- GRU-SCL.jpg: Cerro San Cristóbal / Gran Torre, Santiago. Photo: Omnespsx, CC BY-SA 4.0. File: Santiago de Chile, Desde Cerro San Cristóbal.jpg. https://commons.wikimedia.org/wiki/File:Santiago_de_Chile,_Desde_Cerro_San_Cristóbal.jpg NOT Güldem Üstün.
- REC-GIG.jpg: Botafogo / Pão de Açúcar, Rio de Janeiro. Photo: Donatas Dabravolskas, CC BY-SA 4.0. File: Botafogo_com_Pao_de_Acucar.jpg. https://commons.wikimedia.org/wiki/File:Botafogo_com_Pao_de_Acucar.jpg
- POA-MVD.jpg: Palacio Salvo, Montevidéu. Photo: Christian Córdova, CC BY 2.0. File: Palacio_Salvo-02.jpg. https://commons.wikimedia.org/wiki/File:Palacio_Salvo-02.jpg
- CGH-IGU.jpg: Iguaçu Falls. Photo: Emesbe, CC BY-SA 3.0. File: Iguazu_Falls.jpg. https://commons.wikimedia.org/wiki/File:Iguazu_Falls.jpg
- GRU-BRC.jpg: Centro Cívico, Bariloche. Photo: Phil Whitehouse, CC BY 2.0. File: Bariloche_Centro_Civico.jpg. https://commons.wikimedia.org/wiki/File:Bariloche_Centro_Civico.jpg
- GRU-FLN-story.jpg: Ponte Hercílio Luz — Rodrigo Soldon, CC BY 2.0
- GIG-SSA-story.jpg: Elevador Lacerda — Ciroamado, CC BY-SA 4.0
- VCP-BUE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-LIS.jpg: Torre de Belém, Lisboa. Photo: Juntas, CC BY-SA 4.0

All cards maintain existing media-credit overlay as designed.
Destination photography stays the destination even if the origin is swapped.
Credit also appears on-page on the offer hero when the OG card is used, or the dest photo credit when the JPEG has not landed.

## Usage

Served via GET /og/{filename} (any safe .jpg/.jpeg/.png in this folder).

og:image / twitter:image (landscape cards only):
- /hoje → card of the first bookable pick on the page (`GRU-FLN.jpg`, `GIG-SSA.jpg`, …). `HOJE.jpg` (Buenos Aires) is used only when that pick is GRU-EZE; the file stays in this folder for those days. Never `*-story.jpg`.
- /ofertas/gru-eze → GRU-EZE.jpg
- /ofertas/gru-fln → GRU-FLN.jpg
- /ofertas/gig-ssa → GIG-SSA.jpg
- /ofertas/for-ssa → /og/FOR-SSA.jpg. Never GIG-SSA.jpg. Never HOJE.jpg.
- /ofertas/gru-scl → /og/GRU-SCL.jpg
- /ofertas/rec-gig → /og/REC-GIG.jpg. Never GIG-SSA.jpg.
- /ofertas/poa-mvd → /og/POA-MVD.jpg
- /ofertas/cgh-igu → /og/CGH-IGU.jpg. Never a GRU card. Origin is Congonhas.
- /ofertas/gru-brc → /og/GRU-BRC.jpg
- /ofertas/vcp-bue → VCP-BUE.jpg (when available)
- /ofertas/gru-lis → GRU-LIS.jpg (when available)
