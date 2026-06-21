/**
 * Shopify App Proxy handler — customer watchlist read/write.
 *
 * Mounted (via the app's App Proxy config) at the storefront path /apps/watchlist.
 * Shopify forwards storefront requests here, appending `logged_in_customer_id`,
 * `shop`, `timestamp`, `signature` query params and signing them with the app's
 * API secret. We verify that signature, then read/write the customer's
 * `custom.watchlist` metafield (type list.product_reference) via the Admin API.
 *
 * Deploy target: Vercel serverless (default export handler). Node 18+ (global fetch).
 * Required env vars (see README):
 *   SHOPIFY_SHOP            e.g. japanjunky.myshopify.com
 *   SHOPIFY_CLIENT_ID       Dev Dashboard app Client ID
 *   SHOPIFY_CLIENT_SECRET   Dev Dashboard app Client Secret. Verifies the App
 *                           Proxy signature AND (with the Client ID) fetches a
 *                           short-lived Admin API token via the client-
 *                           credentials grant. App must be installed on the
 *                           store with read_customers + write_customers scopes.
 *
 * Contract:
 *   GET  /apps/watchlist            -> { ids: [numericProductId, ...] }
 *   POST /apps/watchlist            body { id: <numericProductId>, action: "add"|"remove"|"toggle" }
 *                                   -> { ids: [...], watched: <bool> }
 */

const crypto = require('crypto');

const API_VERSION = '2024-10';
const NAMESPACE = 'custom';
const KEY = 'watchlist';

// ── App-proxy signature verification ───────────────────────────────────────
// Shopify signs proxy requests: signature = HMAC-SHA256(secret, sortedParams)
// where sortedParams is each "key=value" (values comma-joined if repeated),
// sorted by key and concatenated with no separator. `signature` is excluded.
function verifyProxySignature(query, secret) {
  const { signature, ...rest } = query;
  if (!signature) return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  // timing-safe compare
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function gidToNumericId(gid) {
  const m = /Product\/(\d+)/.exec(gid || '');
  return m ? m[1] : null;
}

// ── Admin token via the client-credentials grant ───────────────────────────
// New Dev Dashboard apps don't expose a static token; we exchange client
// id+secret for a 24h Admin API token. Cache it across warm invocations.
let cachedToken = null;
let cachedTokenExp = 0; // epoch ms

async function getAdminToken(shop, clientId, clientSecret) {
  if (cachedToken && Date.now() < cachedTokenExp) return cachedToken;
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!res.ok) throw new Error('client-credentials grant failed: ' + res.status);
  const json = await res.json();
  if (!json.access_token) throw new Error('no access_token in grant response');
  cachedToken = json.access_token;
  // refresh a few minutes before the 24h expiry
  cachedTokenExp = Date.now() + Math.max(60, (json.expires_in || 86399) - 300) * 1000;
  return cachedToken;
}

async function adminGraphQL(shop, token, queryStr, variables) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query: queryStr, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error('Admin GraphQL error: ' + JSON.stringify(json.errors));
  return json.data;
}

// Read the customer's current watchlist (array of numeric product ids).
async function readWatchlist(shop, token, customerGid) {
  const data = await adminGraphQL(
    shop,
    token,
    `query($id: ID!) {
       customer(id: $id) {
         metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value }
       }
     }`,
    { id: customerGid }
  );
  const raw = data && data.customer && data.customer.metafield && data.customer.metafield.value;
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch (e) { return []; } // list.product_reference => JSON array of GIDs
  return arr.map(gidToNumericId).filter(Boolean);
}

// Write the customer's watchlist (array of numeric product ids -> product GIDs).
async function writeWatchlist(shop, token, customerGid, ids) {
  const value = JSON.stringify(ids.map((id) => `gid://shopify/Product/${id}`));
  await adminGraphQL(
    shop,
    token,
    `mutation($metafields: [MetafieldsSetInput!]!) {
       metafieldsSet(metafields: $metafields) {
         userErrors { field message }
       }
     }`,
    {
      metafields: [{
        ownerId: customerGid,
        namespace: NAMESPACE,
        key: KEY,
        type: 'list.product_reference',
        value
      }]
    }
  );
}

module.exports = async function handler(req, res) {
  const shop = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop || !clientId || !clientSecret) {
    res.status(500).json({ error: 'server-misconfigured' });
    return;
  }

  // req.query is provided by Vercel; verify Shopify signed this proxy request
  // with the app's client secret.
  if (!verifyProxySignature(req.query, clientSecret)) {
    res.status(401).json({ error: 'bad-signature' });
    return;
  }

  const customerId = req.query.logged_in_customer_id;
  if (!customerId) {
    res.status(401).json({ error: 'not-logged-in' });
    return;
  }
  const customerGid = `gid://shopify/Customer/${customerId}`;

  try {
    const token = await getAdminToken(shop, clientId, clientSecret);

    if (req.method === 'GET') {
      const ids = await readWatchlist(shop, token, customerGid);
      res.status(200).json({ ids });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const pid = String(body.id || '').replace(/\D/g, '');
      const action = body.action || 'toggle';
      if (!pid) { res.status(400).json({ error: 'missing-id' }); return; }

      const ids = await readWatchlist(shop, token, customerGid);
      const has = ids.indexOf(pid) >= 0;
      let next = ids;
      let watched = has;
      if (action === 'add' || (action === 'toggle' && !has)) {
        if (!has) next = ids.concat(pid);
        watched = true;
      } else if (action === 'remove' || (action === 'toggle' && has)) {
        next = ids.filter((x) => x !== pid);
        watched = false;
      }
      if (next !== ids) await writeWatchlist(shop, token, customerGid, next);
      res.status(200).json({ ids: next, watched });
      return;
    }

    res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    res.status(500).json({ error: 'server-error', detail: String(e && e.message || e) });
  }
};
