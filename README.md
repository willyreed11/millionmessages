# millionmessages.us

A one-page site that holds a short message to the White House, makes it one click to copy and open the official contact form, and keeps a running count of people who report having sent it.

**The count is self-reported.** Nobody outside the White House can see what is submitted through its form. The number on the site is the number of "I sent it" clicks, limited to one per visitor per day.

## What is stored

- The count: one integer, in a Cloudflare Durable Object.
- For abuse prevention only: a one-way SHA-256 hash of `(daily-rotating secret salt + visitor IP)`, kept for 24 hours and then deleted. The IP is never stored; hashes cannot be linked across days.
- Nothing else. No names, emails, cookies, accounts, or analytics. Access logging is disabled (`[observability] enabled = false` in `wrangler.toml`).

The entire client side is in `public/` and can be inspected in any browser's developer tools. The entire server side is `src/worker.js` (about 200 lines).

## Layout

```
public/           the website (static files served by the Worker)
  index.html      main page
  embed.html      compact version loaded inside the embed iframe
  embed.js        one-line embed for other sites
  config.js       THE MESSAGE TEXT and settings — edit here
  app.js          page logic (copy, open form, "I sent it", live count)
  style.css
src/worker.js     API + Durable Object counter
wrangler.toml     Cloudflare configuration
scripts/          nightly backup + restore (run on a home machine)
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/count` | `{ count, updated }` — public, CORS-enabled, cached 5 s |
| POST | `/api/sent` | records one click; body `{ token }` from Turnstile when enabled |
| POST | `/api/admin/set` | `Authorization: Bearer ADMIN_SECRET`, body `{ count }` — restore from backup |
| GET | `/api/health` | `{ ok: true }` |

## Embedding on another site

```html
<script src="https://millionmessages.us/embed.js" async></script>
```

This inserts an iframe of `https://millionmessages.us/embed`. The iframe runs on this domain, so the host page cannot read or alter anything inside it and the human check works everywhere.

## Changing the message

Edit `public/config.js`, add a line to `versionHistory`, redeploy. The count lives in the Worker and is unaffected.

## Running locally

```
npm install
cp .dev.vars.example .dev.vars   # local test secrets
npm run dev                      # http://127.0.0.1:8787
```

## Deploying

See `SETUP-GUIDE.pdf` (or `wrangler deploy` once secrets and the custom domain are configured).

## License

MIT.
