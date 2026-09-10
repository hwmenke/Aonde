# Deploy staging — `test.aonde.com.br`

One-click host for this repo as a Node web service. **Render is primary.** Railway is the fallback. After the host is live, point DNS `test` at it.

Do **not** put a real Travelpayouts marker or token in git, in `render.yaml`, or in this file. Set them only in the host dashboard.

The site boots without those keys (editorial content only). Marker enables tracked affiliate links; token (optional) enables Travelpayouts Data API search.

## 1. Render Blueprint (preferred)

Exact click path:

1. Merge this branch to `main` (or deploy from the branch you want live).
2. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in.
3. Top right: **New +** → **Blueprint**.
4. Click **Connect** on `hwmenke/Aonde`. Connect GitHub first if the repo is missing.
5. Form:
   - **Blueprint Name:** e.g. `aonde-staging`
   - **Branch:** `main`
   - **Blueprint Path:** leave default (`render.yaml` at repo root)
6. Review the planned service `aonde-staging` (Node web, start `node scripts/serve.js`, health `/api/health`).
7. When Render prompts for `sync: false` env vars, paste from Travelpayouts → Profile (never from a commit):
   - `TRAVELPAYOUTS_MARKER` — Partner ID
   - `TRAVELPAYOUTS_TOKEN` — optional; leave blank if you only need link templates
8. Confirm `AONDE_SITE_URL` is `https://test.aonde.com.br`.
9. Click **Deploy Blueprint**. Wait until the web service is **Live**.
10. Open the service → copy the generated URL, e.g. `https://aonde-staging-xxxx.onrender.com`.
11. Smoke-check: `https://<that-host>/api/health` must return HTTP 200 JSON `{ "ok": true, ... }`.

Render injects `PORT`. `scripts/serve.js` listens on `PORT || AONDE_PORT || 3333` at `0.0.0.0`.

### Custom domain + DNS

12. In the **same** service: **Settings** → **Custom Domains** → **+ Add Custom Domain**.
13. Enter `test.aonde.com.br` → **Save**.
14. Render shows the CNAME target (the `*.onrender.com` hostname).
15. At the DNS host for `aonde.com.br` (Registro.br, Cloudflare, etc.):

    | Type  | Name | Value                          |
    |-------|------|--------------------------------|
    | CNAME | `test` | `aonde-staging-xxxx.onrender.com` |

    Use the **exact** hostname Render displays (no `https://`, no trailing slash). Remove any `AAAA` on `test`.
16. Back in Render Custom Domains, click **Verify**. Wait for the TLS cert (minutes, sometimes longer).
17. Open `https://test.aonde.com.br/api/health` and `https://test.aonde.com.br/`.

Hobby includes a small number of custom domains; add-ons are billed by Render if you exceed the plan.

Free instances may sleep; first request after idle can be slow. Upgrade the service plan in **Settings** if staging must stay warm.

## 2. Railway (optional fallback)

1. Open [https://railway.app/new](https://railway.app/new) → **Deploy from GitHub repo** → `hwmenke/Aonde`.
2. Railway reads `railway.json`: start `node scripts/serve.js`, health `/api/health`. Or deploy the `Dockerfile` (same `CMD`).
3. **Variables** (no values in git):
   - `AONDE_SITE_URL` = `https://test.aonde.com.br`
   - `TRAVELPAYOUTS_MARKER` (optional until you want tracked links)
   - `TRAVELPAYOUTS_TOKEN` (optional)
4. **Settings** → **Networking** → **Generate Domain**. Copy `xxx.up.railway.app`.
5. Smoke-check `/api/health` on that host.
6. **Settings** → **Networking** → **Custom Domain** → `test.aonde.com.br`.
7. DNS: `CNAME` `test` → the Railway hostname shown in the UI.

## Env checklist (dashboard only)

| Variable | Required | Notes |
|---|---|---|
| `AONDE_SITE_URL` | yes for staging SEO | Default in Blueprint: `https://test.aonde.com.br` |
| `TRAVELPAYOUTS_MARKER` | no | Partner ID; enables `tp.media` affiliate links |
| `TRAVELPAYOUTS_TOKEN` | no | Data API search |
| `PORT` | set by host | Do not hardcode |

Do not invent affiliate URLs. Without a marker, deals stay editorial / untracked — that is expected.

## Local check (same process the host runs)

```bash
PORT=3333 node scripts/serve.js
# other terminal:
curl -sS http://127.0.0.1:3333/api/health
```

Or: `docker build -t aonde . && docker run --rm -p 3333:3333 -e PORT=3333 aonde`
