# Collab Digest (Vercel)

The Collab Digest page and its guide, packaged to run on Vercel instead of claude.ai.

- `public/index.html` is the digest (`/`)
- `public/guide.html` is the guide (`/guide`)
- `api/` holds the serverless functions that replace the claude.ai runtime:
  - `api/monday.js` reads the Production board with the signed-in person's own Monday.com token. The queries are fixed server-side and nothing writes to Monday.
  - `api/auth/*` signs people in (Monday.com OAuth, or a pasted personal API token). The token lives in an HttpOnly cookie, never in page scripts.
  - `api/rewrite.js` powers "Rewrite with Claude" (optional).

## Deploy

1. Import this repo in Vercel (Framework preset: **Other**, no build command). `vercel.json` already points output at `public/`.
2. Add environment variables (Project → Settings → Environment Variables). All are optional; see `.env.example`:
   - `ALLOWED_MONDAY_ACCOUNT_ID`: recommended. Only people in your Monday account can sign in and use Claude. Find the id by running `query { me { account { id } } }` in Monday's API playground.
   - `ANTHROPIC_API_KEY`: turns on "Rewrite with Claude". Without it the button is hidden and the template still works.
   - `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET`: turns on "Sign in with Monday.com". Without them, people paste a personal API token.
3. Deploy, then open the URL.

### Setting up "Sign in with Monday.com" (optional, nicer for a team)

1. In Monday.com: avatar → Developers → Create app.
2. Under OAuth, add the scopes `me:read`, `boards:read`, `updates:read` and the redirect URL `https://<your-domain>/api/auth/callback`.
3. Copy the Client ID and Client Secret into Vercel, then redeploy.
4. Depending on your Monday plan, an admin may need to approve or install the app for the account.

## Differences from the claude.ai version

- **Sign-in:** each person signs in with their own Monday.com account instead of the claude.ai connector. Same result: everyone sees only their own CFS collabs.
- **Handled marks** are saved per browser (localStorage). The claude.ai version also synced them across devices; bringing that back needs a database such as Upstash Redis.
- **Rewrite with Claude** calls the Anthropic API with your key, so it's billed to that key. Only signed-in Monday users can call it (and only your account, when `ALLOWED_MONDAY_ACCOUNT_ID` is set).

## Local development

```
npm install
npx vercel dev
```
