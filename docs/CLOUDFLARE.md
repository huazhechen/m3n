# Cloudflare Deployment

The production site runs as a Cloudflare Worker. Static Vite assets are served by the Worker and shared M3N sources are stored in the `M3N_SCORES` KV binding. The browser never receives Cloudflare credentials or a KV namespace identifier.

## Create KV Namespaces

Run these commands after authenticating with `npx wrangler login`:

```powershell
npx wrangler kv namespace create M3N_SCORES
npx wrangler kv namespace create M3N_SCORES --preview
```

Copy the two returned namespace IDs into `wrangler.jsonc` as `id` and `preview_id`. Do not put API tokens, account IDs, or other credentials in this repository.

## Run And Deploy

```powershell
npm run build
npx wrangler dev
npx wrangler deploy
```

The Worker exposes two same-origin endpoints:

- `POST /api/scores` creates a temporary score for the editor's 浏览 action. The Worker derives its ID from the first 48 bits of the source SHA-256 hash, encoded as 12 lowercase hexadecimal characters. The KV record expires after 7 days.
- `POST /api/scores/submissions` stores a submitted score for the editor's 提交 action. Its body includes a key in the form `title_pinyin_13_digit_millisecond_timestamp`; the KV record expires after 15 days.
- `GET /api/scores/:id` retrieves that score.

Each source is capped at 256 KiB. The Worker accepts only the two documented ID forms; there is intentionally no browser-accessible overwrite or delete endpoint.
