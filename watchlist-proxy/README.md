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

## 2. Create the app(s)

Two capabilities are needed: an **App Proxy** (so storefront requests are signed
and carry `logged_in_customer_id`) and an **Admin API token** (to write the
metafield). Important: the admin **Develop apps** flow gives an Admin token but
has **no App Proxy** — App Proxy lives only on a **Partner Dashboard app** (or is
declared in `shopify.app.toml` via the Shopify CLI).

**Recommended — one Partner app (CLI):**

1. Free Partner account at <https://partners.shopify.com>.
2. From `watchlist-proxy/`, link/create the app and register config (this fills
   `client_id` in `shopify.app.toml` and registers the App Proxy + scopes):
   ```bash
   npm i -g @shopify/cli
   shopify app config link      # creates/links the app, writes client_id
   shopify app deploy           # registers app_proxy + access_scopes from the toml
   ```
   `shopify.app.toml` already declares the App Proxy (`apps/watchlist`) and scopes
   (`read_customers,write_customers`) — edit the URLs to your deployed function.
3. Install the app on the store. After install, get the **Admin API access token**
   → `SHOPIFY_ADMIN_TOKEN`, and the app's **API secret key** (Partner Dashboard →
   the app → API credentials) → `SHOPIFY_APP_SECRET` (this signs proxy requests).

**Alternative — two apps:** a Partner app *only* for the App Proxy (its API secret
→ `SHOPIFY_APP_SECRET`), plus an admin **Develop apps** custom app for the Admin
token (`read_customers`,`write_customers` → `SHOPIFY_ADMIN_TOKEN`). Both env vars
just need to come from the right place; they don't have to be the same app.

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

Already declared in `shopify.app.toml` (`[app_proxy]`): prefix `apps`, subpath
`watchlist`, URL = your function. `shopify app deploy` registers it. (Or set it
by hand in Partner Dashboard → the app → **App proxy** with the same values.)

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
