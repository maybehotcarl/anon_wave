# anonwave.live

Anonymous posting frontend for the 6529 Anon Wave.

## MVP shape

- Next.js app with a single anonymous submission page
- Cloudflare Turnstile support for captcha verification
- Rate limiting with Upstash Redis in production and an in-memory fallback for local development
- Direct 6529 posting support using the same wallet-auth flow as the existing chatbot project

## Privacy boundary

- Anonymous users do not log in
- Client IP is only used server-side for captcha verification and rate limiting
- IP, user-agent, and location data are not attached to the 6529 drop payload

## Environment

Copy `.env.example` to `.env.local` and fill in the values you have.

Required for production:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `ANON_WAVE_ID`
- `WAVE_POST_MODE`
- `WAVE_SIGNER_PRIVATE_KEY` or `PRIVATE_KEY`

Optional but recommended for production:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `WAVE_POST_WEBHOOK_URL`
- `WAVE_POST_BEARER_TOKEN`

## 6529 posting mode

Set `WAVE_POST_MODE=6529` to post directly with a dedicated 6529 wallet.

The adapter follows the same flow used in the existing chatbot repo:

1. Request a nonce from `https://api.6529.io/api/auth/nonce`
2. Sign that nonce with the wallet private key
3. Exchange the signed nonce for a JWT at `https://api.6529.io/api/auth/login`
4. Post a chat drop to `https://api.6529.io/api/drops`

Use a fresh burner wallet for this site, not your main wallet.

## Development

```bash
npm install
npm run dev
```

## Health check

`GET /api/health` returns the current config state without exposing secrets.
