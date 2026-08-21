# OG Images for Social Sharing

This directory contains Open Graph images for social media sharing.

## Files

- **HOJE.jpg** (1200×630) - Share card for /hoje daily pick: São Paulo → Buenos Aires, GRU-EZE, 12–19 set, NO price
- **GRU-EZE.jpg** (1200×630) - Catalog card for GRU-EZE offer page: cities only, NO price
- **VCP-BUE.jpg** (1200×630) - Catalog card for VCP-BUE offer: Campinas → Buenos Aires
- **GRU-LIS.jpg** (1200×630) - Catalog card for GRU-LIS offer: São Paulo → Lisboa

## Photo Credits

- HOJE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-EZE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- VCP-BUE.jpg: Obelisco, Buenos Aires. Photo: Roberto Fiadone, CC BY-SA 4.0
- GRU-LIS.jpg: Torre de Belém, Lisboa. Photo: Juntas, CC BY-SA 4.0

All cards maintain existing media-credit overlay as designed.

## Usage

Served via GET /og/{filename} endpoint. Used as og:image meta tags for:
- /hoje → HOJE.jpg
- /ofertas/gru-eze → GRU-EZE.jpg
- /ofertas/vcp-bue → VCP-BUE.jpg (when available)
- /ofertas/gru-lis → GRU-LIS.jpg (when available)
