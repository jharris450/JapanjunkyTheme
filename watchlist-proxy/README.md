# JapanJunky Watchlist — Shopify setup

The watchlist stores products on the **customer's `custom.watchlist` metafield**
so it's tied to the account and saved server-side (cross-device, survives a
browser clear). Storefront theme code can read that metafield in Liquid, but it
**cannot write** it — writes go through this small App Proxy backend.

It uses **one** Shopify **Dev Dashboard app**: its Client Secret verifies the
signed App Proxy requests, and (with the Client ID) the function exchanges them
for a short-lived Admin API token via the **client-credentials grant** to read/
write the metafield. The new Dev Dashboard no longer exposes a static `shpat_`
token, so this grant is the supported path.

Setup: the **metafield**, the **app** (Client ID/Secret + App Proxy + scopes),
this **deployed function**, and the **page**.

---

## 1. Define the customer metafield  ✅ done

Settings → Metafield definitions → **Customers** → Add definition:

- Namespace and key: `custom.watchlist`
- Type: **Product** → *List of products* (`list.product_reference`)
- Enable Storefront access.

## 2. The Dev Dashboard app (Client ID/Secret + App Proxy + scopes)

`shopify.app.toml` here already declares the App Proxy (`apps/watchlist` →
`https://watchlist-proxy.vercel.app/api/watchlist`) and scopes
(`read_customers,write_customers`). From `watchlist-proxy/`:

```bash
shopify app config link    # link to your dev-dashboard app; writes client_id
shopify app deploy         # push a version: registers app_proxy + scopes
```

Then in the **Dev Dashboard** → your app → **Install** it on the store (grants the
scopes), and → **Settings** copy the **Client ID** and **Client Secret**.

> The client-credentials grant only works for apps installed in your own org — so
> the app must be installed on the store. Scopes must be configured (the toml does
> that) before the granted token will include them.

## 3. Deploy this function  ✅ deployed → `https://watchlist-proxy.vercel.app`

Vercel-style handler (`api/watchlist.js`, Node 18+):

```bash
cd watchlist-proxy && vercel --prod
```

Set env vars (Vercel → Project → Settings → Environment Variables → Production):

| Var | Value |
| --- | --- |
| `SHOPIFY_SHOP` | `your-store.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | Dev Dashboard app Client ID (step 2) |
| `SHOPIFY_CLIENT_SECRET` | Dev Dashboard app Client Secret (step 2) |

Redeploy after setting them (`vercel --prod`) so they take effect.

> Any Node host works (Netlify, Cloudflare Workers, Render…). The handler reads
> `req.query`/`req.body` and calls `res.status().json()`; adapt for your platform.

## 4. App Proxy

Declared in `shopify.app.toml` (`[app_proxy]`: prefix `apps`, subpath `watchlist`,
url = the function) and registered by `shopify app deploy`. Storefront requests to
`/apps/watchlist` are then signed by Shopify and forwarded here; the theme JS
(`assets/japanjunky-watchlist.js`) posts to that path.

## 5. Create the watchlist page

Admin → Online Store → Pages → **Add page**:

- Title: `Watchlist` (handle becomes `watchlist`)
- Theme template: **page.watchlist**

The Start-menu “watchlist” link points at `/pages/watchlist`.

---

## Contract

- `GET  /apps/watchlist` → `{ ids: [numericProductId, …] }`
- `POST /apps/watchlist` body `{ id, action: "add"|"remove"|"toggle" }`
  → `{ ids: […], watched: bool }`

Requests without a `logged_in_customer_id` (guest) get `401 not-logged-in`; the
theme JS treats that as “please log in”.
