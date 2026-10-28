# Render staging hostname fix

`render.yaml` now names the web service exactly `aonde-staging-2026`, matching the existing `test.aonde.com.br` CNAME target, `aonde-staging-2026.onrender.com`. Build/start commands, health check, and environment settings are unchanged.

`docs/DEPLOY-STAGING.md` now requires that exact service name and documents checking the Render hostname before adding the custom domain and verifying TLS. Apex and `www` stay on their existing host. Railway remains an optional fallback.

## Henning's remaining Render dashboard steps

1. Create a Blueprint from `hwmenke/Aonde`, selecting the branch containing this change and the root `render.yaml`.
2. Keep the web service name exactly `aonde-staging-2026`. Confirm `AONDE_SITE_URL=https://test.aonde.com.br`. Supply any real optional Travelpayouts credentials only in the dashboard; the site can boot without them.
3. Deploy the Blueprint and wait for **Live**. Confirm Render assigned `https://aonde-staging-2026.onrender.com`. Only if it assigned a different hostname, rename or recreate the service and confirm the expected URL.
4. Check `https://aonde-staging-2026.onrender.com/api/health` returns HTTP 200 JSON, and open `/` on that host.
5. In that service's **Settings → Custom Domains**, add `test.aonde.com.br`. Its DNS CNAME already points at the expected Render hostname; leave that record in place.
6. Click **Verify**, wait for the TLS certificate, and check `https://test.aonde.com.br/api/health` and `/` over HTTPS.

This PR cannot create the cloud service. Staging is not asserted to be live; Henning must create and deploy the Blueprint in Render.

## Validation

- `git diff --check` passed.
- `node --test` ran on Node v20.19.2: 48 passed, 28 failed, 0 skipped. This restricted environment denies local server listeners (`listen EPERM`, reproduced directly with `node test/serveListen.test.js`).
- An isolated archive of unchanged branch HEAD produced the same 48/28 result and identical failing test files. Local `main` is older (68 test files) and also fails here: 44 passed, 24 failed, 0 skipped. This is not a green or matching-skip-profile result; rerun `node --test` in an environment allowing local listeners before merge.
- No tests or application code were changed to bypass the environment restriction.
