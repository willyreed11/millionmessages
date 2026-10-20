/**
 * millionmessages.us — counter backend
 *
 * One Cloudflare Worker that (a) serves the static site from ./public and
 * (b) keeps a single integer: how many people have reported sending the message.
 *
 * What is stored, in full:
 *   - the count (one integer)
 *   - for abuse prevention only: a one-way hash of (visitor IP + a daily-rotating
 *     secret salt), kept for 24 hours and then deleted. The IP itself is never
 *     stored, and the hash cannot be reversed or linked across days.
 *
 * Nothing else. No names, emails, cookies, or analytics.
 *
 * Endpoints:
 *   GET  /api/count              -> { count, updated }
 *   POST /api/sent               -> { count, counted }   (body: { token } from Turnstile, if enabled)
 *   POST /api/admin/set          -> { count }            (Authorization: Bearer ADMIN_SECRET; body: { count })
 *   POST /api/event              -> { ok }               (body: { type }) aggregate funnel counters, nothing per visitor
 *   GET  /api/stats              -> { count, views, ... } public totals
 *   GET  /api/health             -> { ok: true }
 *   everything else              -> static assets in ./public
 *
 * Secrets (set with `wrangler secret put NAME`):
 *   SALT_SECRET        required  — random string, used only to salt the daily IP hash
 *   ADMIN_SECRET       required  — bearer token for restoring the count from a backup
 *   TURNSTILE_SECRET   optional  — Cloudflare Turnstile secret key; when absent the bot check is skipped
 */

const RATE_LIMIT_SECONDS = 24 * 60 * 60;      // one counted click per visitor per day
const COUNT_CACHE_SECONDS = 5;                // edge cache for GET /api/count
const MAX_BODY_BYTES = 4096;
const EVENT_TYPES = new Set(['view', 'view_embed', 'view_about', 'copy', 'open', 'share']);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'x-content-type-options': 'nosniff',
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One-way, daily-rotating visitor hash. Never stores or logs the IP. */
async function visitorHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const day = new Date().toISOString().slice(0, 10);
  const salt = await sha256Hex(`${env.SALT_SECRET}|${day}`);
  return sha256Hex(`${salt}|${ip}`);
}

async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing-token' };
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({ success: false }));
  return { ok: !!data.success, reason: data.success ? undefined : 'turnstile-failed' };
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      // Static site. Add a few conservative security headers.
      const res = await env.ASSETS.fetch(request);
      const h = new Headers(res.headers);
      h.set('x-content-type-options', 'nosniff');
      h.set('referrer-policy', 'strict-origin-when-cross-origin');
      // The main page refuses to be framed; /embed is intentionally frameable
      // by any site, which is the whole point of the embed.
      if (path !== '/embed' && path !== '/embed.html') h.set('x-frame-options', 'DENY');
      return new Response(res.body, { status: res.status, headers: h });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      });
    }

    const stub = env.COUNTER.get(env.COUNTER.idFromName('global'));

    if (path === '/api/health') return json({ ok: true });

    if (path === '/api/count' && request.method === 'GET') {
      // Short edge cache so a viral moment hits the Durable Object a few times a
      // second at most, not thousands.
      const cache = caches.default;
      const cacheKey = new Request(`${url.origin}/api/count`, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      const res = await stub.fetch('https://counter/count');
      const data = await res.json();
      const out = json(data, 200, { 'cache-control': `public, max-age=${COUNT_CACHE_SECONDS}` });
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }

    if (path === '/api/sent' && request.method === 'POST') {
      if (!env.SALT_SECRET) return json({ error: 'server-not-configured' }, 500);
      const body = await readJson(request);
      if (body === null) return json({ error: 'bad-request' }, 400);
      // Honeypot: real browsers never fill this field.
      if (body.website) return json({ count: null, counted: false, reason: 'rejected' }, 200);

      const check = await verifyTurnstile(body.token, request, env);
      if (!check.ok) return json({ error: check.reason }, 403);

      const hash = await visitorHash(request, env);
      const res = await stub.fetch('https://counter/increment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash, ttl: RATE_LIMIT_SECONDS }),
      });
      return json(await res.json());
    }

    if (path === '/api/event' && request.method === 'POST') {
      // Aggregate funnel counters. Each call adds 1 to a named total; nothing
      // about the visitor is stored or derivable from it.
      const body = await readJson(request);
      const type = body && typeof body.type === 'string' ? body.type : '';
      if (!EVENT_TYPES.has(type)) return json({ error: 'bad-request' }, 400);
      ctx.waitUntil(stub.fetch('https://counter/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type }),
      }));
      return json({ ok: true });
    }

    if (path === '/api/stats' && request.method === 'GET') {
      const res = await stub.fetch('https://counter/stats');
      return json(await res.json(), 200, { 'cache-control': 'public, max-age=60' });
    }

    if (path === '/api/admin/set' && request.method === 'POST') {
      const auth = request.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!env.ADMIN_SECRET || !constantTimeEqual(token, env.ADMIN_SECRET)) {
        return json({ error: 'unauthorized' }, 401);
      }
      const body = await readJson(request);
      const n = body && Number.isInteger(body.count) && body.count >= 0 ? body.count : null;
      if (n === null) return json({ error: 'count must be a non-negative integer' }, 400);
      const res = await stub.fetch('https://counter/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: n }),
      });
      return json(await res.json());
    }

    return json({ error: 'not-found' }, 404);
  },
};

/**
 * The single Durable Object holding the count. Durable Objects process one
 * request at a time, so increments can never race or lose updates.
 */
export class Counter {
  constructor(state, env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS seen (h TEXT PRIMARY KEY, exp INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS seen_exp ON seen (exp)`);
  }

  async getCount() {
    return (await this.state.storage.get('count')) || 0;
  }

  async getUpdated() {
    return (await this.state.storage.get('updated')) || null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Math.floor(Date.now() / 1000);

    if (url.pathname === '/count') {
      return Response.json({ count: await this.getCount(), updated: await this.getUpdated() });
    }

    if (url.pathname === '/increment') {
      const { hash, ttl } = await request.json();
      // Prune expired hashes opportunistically (cheap; indexed).
      this.sql.exec(`DELETE FROM seen WHERE exp < ?`, now);
      const already = this.sql.exec(`SELECT 1 FROM seen WHERE h = ?`, hash).toArray().length > 0;
      if (already) {
        return Response.json({ count: await this.getCount(), counted: false, reason: 'already-counted-today' });
      }
      this.sql.exec(`INSERT INTO seen (h, exp) VALUES (?, ?)`, hash, now + ttl);
      const count = (await this.getCount()) + 1;
      const updated = new Date().toISOString();
      await this.state.storage.put({ count, updated });
      return Response.json({ count, counted: true });
    }

    if (url.pathname === '/event') {
      const { type } = await request.json();
      const key = 'ev:' + type;
      const n = ((await this.state.storage.get(key)) || 0) + 1;
      await this.state.storage.put(key, n);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/stats') {
      const keys = ['view', 'view_embed', 'view_about', 'copy', 'open', 'share'];
      const vals = await this.state.storage.get(keys.map((k) => 'ev:' + k));
      const out = { count: await this.getCount(), updated: await this.getUpdated() };
      for (const k of keys) out[k] = vals.get('ev:' + k) || 0;
      return Response.json(out);
    }

    if (url.pathname === '/set') {
      const { count } = await request.json();
      const updated = new Date().toISOString();
      await this.state.storage.put({ count, updated });
      return Response.json({ count, updated });
    }

    return new Response('not found', { status: 404 });
  }
}
