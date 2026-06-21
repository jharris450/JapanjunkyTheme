# JapanJunky Watchlist — Shopify setup

The watchlist stores products on the **customer's `custom.watchlist` metafield**
so it's tied to the account and saved server-side (cross-device, survives a
browser clear). Storefront theme code can read that metafield in Liquid, but it
**cannot write** it — writes go through this small App Proxy backend, which uses
the Admin API.

Three things must be set up: the **metafield**, a **custom app** (for the Admin
token + proxy secret), and this **deployed function** wired as an **App Proxy**.

---

## 1. Define the customer metafield

Admin → Settings → Custom data → **Customers** → Add definition:

- Namespace and key: `custom.watchlist`
- Type: **Product** → *List of products* (`list.product_reference`)
- Storefronts access: **expose to Storefront / Liquid** (so the theme can read it)

## 2. Create a custom app (Admin token + secret)

Admin → Settings → Apps and sales channels → Develop apps → **Create an app**.

- **Admin API access scopes:** `read_customers`, `write_customers`
- Install it, then copy the **Admin API access token** → `SHOPIFY_ADMIN_TOKEN`.
- On the app's **API credentials** tab copy the **API secret key** → `SHOPIFY_APP_SECRET`
  (this signs App Proxy requests).

## 3. Deploy this function

It's a single Vercel-style serverless handler (`api/watchlist.js`, Node 18+).

```bash
cd watchlist-proxy
npx vercel deploy --prod
```

Set env vars on the deployment (Vercel dashboard → Project → Settings → Environment Variables):

| Var | Value |
| --- | --- |
| `SHOPIFY_SHOP` | `japanjunky.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API access token from step 2 |
| `SHOPIFY_APP_SECRET` | API secret key from step 2 |

After deploy you'll have a URL like `https://japanjunky-watchlist.vercel.app/api/watchlist`.

> Any Node host works (Netlify Functions, Cloudflare Workers, Render…). The
> handler reads `req.query`/`req.body` and calls `res.status().json()`; adapt the
> signature for your platform if not using Vercel.

## 4. Wire the App Proxy

In the custom app → **App proxy**:

- Subpath prefix: `apps`
- Subpath: `watchlist`
- Proxy URL: your deployed function URL (e.g. `https://japanjunky-watchlist.vercel.app/api/watchlist`)

Now storefront requests to `/apps/watchlist` are signed by Shopify and forwarded
to the function. The theme JS (`assets/japanjunky-watchlist.js`) posts there.

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
