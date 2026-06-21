# Watchlist tied to customer account — design

**Date:** 2026-06-21
**Goal:** A working watchlist saved server-side per customer (cross-device,
survives browser clears). Decision (user): store on the **customer
`custom.watchlist` metafield** (`list.product_reference`), not localStorage.

## Constraint

Shopify storefront/theme code can **read** customer metafields in Liquid but
**cannot write** them. Writes must go through an Admin-API backend reached via an
**App Proxy** (`/apps/watchlist`). So the feature is three parts:

1. **Theme** (this repo) — read state in Liquid, toggle via the proxy in JS.
2. **Backend** (`watchlist-proxy/`) — App Proxy handler, Admin API writes.
3. **Shopify config** (store admin) — metafield def, custom app, app proxy, page.
   See `watchlist-proxy/README.md` for exact steps.

## Data model

`customer.metafields.custom.watchlist` — `list.product_reference`, value is a
JSON array of product GIDs. Liquid renders `.value` as product objects directly.

## Components

- `snippets/jj-watch-button.liquid` — reusable toggle; computes `is_watched` from
  the metafield; emits `[data-watch][data-product-id]`; guests get `data-guest`.
  Rendered in the PDP actions row (`sections/jj-product.liquid`).
- `sections/jj-watchlist.liquid` + `templates/page.watchlist.json` — the page;
  lists the metafield's products with remove buttons (`data-watch-remove-row`).
  Start-menu link → `/pages/watchlist`.
- `assets/japanjunky-watchlist.js` — `window.JJ_Watchlist`; optimistic toggle via
  `POST /apps/watchlist {id, action:"toggle"}`; reverts on error; 401 → login;
  removes the row on the watchlist page after a confirmed unwatch.
- `assets/japanjunky-watchlist.css` — CRT-styled button (gold star, glow when
  active) + watchlist list.
- `watchlist-proxy/api/watchlist.js` — Vercel-style handler: verifies the proxy
  HMAC signature, resolves `logged_in_customer_id`, reads/mutates/writes the
  metafield via Admin GraphQL. Env: `SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN`,
  `SHOPIFY_APP_SECRET`.

## Graceful degradation

Until the proxy + metafield exist: the page shows an empty/login state, and watch
buttons revert (no crash). Guests are routed to `/account/login`.

## Follow-ups (not in this pass)

- Watch buttons on grid cards (cards are JS-rendered in `japanjunky-product-grid.js`;
  needs product id in `JJ_PRODUCTS` + a button in the card template).
- Optional “price dropped / back in stock” signal on watched items.
