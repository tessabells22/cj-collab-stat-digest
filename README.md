# Collab Digest (Vercel)

The Collab Digest page and its guide, packaged to run on Vercel instead of claude.ai.

All pages share one app shell (left sidebar, top bar with breadcrumb, theme toggle and account menu), modeled on the JetHire web app:

- `public/index.html` is Home (`/`), with a today snapshot: Needs you / Due today / Late counts that open the matching digest group, plus the next three collabs to look at
- `public/digest.html` is the digest (`/digest`), behind a "Continue with Google" sign-in
- `public/kpi.html` is the weekly KPI dashboard (`/kpi`) for the signed-in person's collabs, in five sections: At a glance (delivered, on-time rate, cycle time, due this week; plus active, late, stuck, waiting on client, in revision right now), Delivery (8-week charts for deliveries split on time / late, on-time rate and cycle time), Coming up (deadline load for the next 14 days and what's due in 7), Workload (pipeline by stage, active by client) and Watchlist (late now, client review waits, oldest in stage, delivered by client)
- `public/guide.html` is the guide (`/guide`)
- `public/shell.js` and `public/shell.css` draw the sidebar, top bar and sign-in screen; add a page to the `NAV` list in `shell.js` to put it in the sidebar
- `public/collabs.js` holds the Monday column ids, the grouping rules and the loader, shared by the digest and the Home snapshot so their counts always match
- `public/app.css` holds the styles the digest, KPI and Home pages share
- `api/` holds the serverless functions:
  - `api/auth/*` handles Google sign-in, limited to one Workspace domain (`ALLOWED_EMAIL_DOMAIN`). The session is a signed, HttpOnly cookie that lasts 30 days.
  - `api/monday.js` reads the Production board with one server-side Monday.com token. It looks up the Monday user whose email matches the Google login and only returns collabs where that person is the CFS. The queries are fixed server-side and nothing writes to Monday.
  - `api/rewrite.js` powers "Rewrite with Claude" (optional).

## Deploy

### 1. Google sign-in (Google Cloud Console, signed in with your contentjet.io account)

1. Go to console.cloud.google.com and create a project (e.g. "Collab Digest").
2. **APIs & Services → OAuth consent screen**: choose **Internal**. That limits sign-in to your Workspace at Google's end too. Fill in the app name and support email.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback`
4. Copy the Client ID and Client secret.

### 2. Monday.com token

The server reads Monday with one token. Use an account that can see the Production board, ideally one that won't leave the company (a shared ops account is better than a person's). In Monday: avatar → Developers → My access tokens → copy.

Everyone's Monday.com email must match their Google email, since that's how the page finds "your" collabs.

### 3. Vercel

1. Import this repo (Framework preset: **Other**, no build command). `vercel.json` points output at `public/`.
2. Add environment variables (Settings → Environment Variables), see `.env.example`:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ALLOWED_EMAIL_DOMAIN` = `contentjet.io`
   - `SESSION_SECRET`: a long random string (`openssl rand -base64 32`)
   - `MONDAY_API_TOKEN`
   - `ANTHROPIC_API_KEY` (optional): turns on "Rewrite with Claude"
3. Deploy. If anything is missing, the sign-in page lists which variables to add.

## Differences from the claude.ai version

- **Sign-in** is company Google, not the claude.ai Monday connector. Monday is read with one shared token, and the server filters to the signed-in person's collabs.
- **Handled marks** are saved per browser (localStorage). The claude.ai version also synced them across devices; bringing that back needs a database such as Upstash Redis.
- **Rewrite with Claude** calls the Anthropic API with your key, so it's billed to that key. Only signed-in company accounts can call it.

## Local development

```
npm install
npx vercel dev
```
