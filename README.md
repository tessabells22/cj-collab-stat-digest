# Collab Digest (Vercel)

The Collab Digest page and its guide, packaged to run on Vercel instead of claude.ai.

All pages share one app shell (left sidebar, top bar with breadcrumb, theme toggle and account menu), modeled on the JetHire web app:

- `public/index.html` is Home (`/`), with a today snapshot: Needs you / Due today / Late counts that open the matching digest group, plus the next three collabs to look at
- `public/digest.html` is the digest (`/digest`), behind a "Continue with Google" sign-in
- `public/kpi.html` is the weekly KPI dashboard (`/kpi`) for the signed-in person's collabs, in five sections: At a glance (delivered, on-time rate, cycle time, due this week; plus active, late, stuck, waiting on client, in revision right now), Delivery (8-week charts for deliveries split on time / late, on-time rate and cycle time), Coming up (deadline load for the next 14 days and what's due in 7), Workload (pipeline by stage, active by client) and Watchlist (late now, client review waits, oldest in stage, delivered by client)
- `public/creators.html` is Creators (`/creators`): everyone on your collabs with active / late / due-soon counts, their on-time record with you and last update; opening one lists their collabs and past deliveries, with a Message button
- `public/messages.html` is Messages (`/messages`): Brkaway templates (late nudge, asset chase, revision request, deadline reminder, check-in, welcome, videos received) that fill in a creator's collabs and deadlines, plus a Chase list with one late nudge per creator
- `public/meeting.html` is Team meeting (`/meeting`), a Labs page (in development): only people on `PREVIEW_EMAILS` / `PREVIEW_MONDAY_IDS` see it in the sidebar or can open it (the ids default to Tessa's). It's for the JetCrew syncs on Monday, Wednesday and Friday. Pick a crew (A: Kaycee Inza-Cruz, B: Olimpio Brunetto, C: Djanice Bettencourt; a collab belongs to a crew when that PM is on its PM column) and it shows your collabs for that crew as an agenda: wins approved since the last meeting, late, due by the next meeting, blockers and asks, moved since the last meeting, waiting on the client, plus your own talking points. **Present** hides the app chrome for screen sharing; **Copy as text** gives a summary to paste in chat. Crews and PMs live in the `CREWS` list at the top of the page's script.
- `public/post.html` is Post update (`/post`): tick several collabs, write one update (with **bold** and real @-tags: type `@` or press the @ button and pick a person; only picked names become Monday tags), and it's posted on each one under your Monday name, as a new update (pin to top is optional, off by default) or as a reply under an existing update (the latest one, or one you pick per collab). You confirm first; failures can be retried without double-posting. This is the app's only write to Monday.
- `public/guide.html` is the guide (`/guide`)
- `public/shell.js` and `public/shell.css` draw the sidebar, top bar and sign-in screen; add a page to the `NAV` list in `shell.js` to put it in the sidebar
- `public/collabs.js` holds the Monday column ids, the grouping rules and the loader, shared by the digest and the Home snapshot so their counts always match
- `public/app.css` holds the styles the digest, KPI and Home pages share
- `api/` holds the serverless functions:
  - `api/auth/*` handles Google sign-in, limited to one Workspace domain (`ALLOWED_EMAIL_DOMAIN`). The session is a signed, HttpOnly cookie that lasts 30 days.
  - `api/auth/monday-token.js` connects each person's own Monday.com personal API token. After Google sign-in the page asks for it (Monday.com avatar (top right) → Developers → API token), checks it with Monday, and keeps it in an AES-256-GCM sealed, HttpOnly cookie tied to that Google account. The avatar menu shows which Monday account is connected and lets you change or disconnect it.
  - `api/monday.js` reads the Production board with the signed-in person's token and only returns collabs where the token's owner is the CFS. The queries are fixed server-side.
  - `api/_briefing.js`, `api/cron/briefing.js` and `api/briefing/test.js` send the morning Slack briefing (see below). The briefing runs the browser's own `public/collabs.js` on the server, so its counts match the digest.
  - `api/post.js` backs Post update: `create_update` with `item_id`, or with `parent_id` for replies after checking the parent update is on that collab (tags written as Monday's own mention links in the body; `mentions_list` isn't used because Monday then appends every tagged name a second time) then `pin_to_top` for each collab, four at a time, up to 50 per request, with the person's own token. It refuses any item that isn't one of their active collabs where they're the CFS. Pinning needs Monday API version 2024-10 or later (the default), so leave `MONDAY_API_VERSION` empty or set it to a recent version.
  - `api/rewrite.js` powers "Rewrite with Claude" (optional).

## Deploy

### 1. Google sign-in (Google Cloud Console, signed in with your contentjet.io account)

1. Go to console.cloud.google.com and create a project (e.g. "Collab Digest").
2. **APIs & Services → OAuth consent screen**: choose **Internal**. That limits sign-in to your Workspace at Google's end too. Fill in the app name and support email.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback`
4. Copy the Client ID and Client secret.

### 2. Monday.com tokens

Nothing to set up on the server. Each CFS pastes their own personal API token the first time they sign in, once per browser. The Production board only shows members the items assigned to them, so a shared member token can't see everyone's collabs, and each person's own token sees exactly what they see in Monday.

A personal token can do anything its owner can do in Monday. The app only sends the fixed read queries in `api/_collabs.js` and, from Post update, the two update mutations in `api/post.js`; the token never reaches page JavaScript, and it's encrypted with a key derived from `SESSION_SECRET`. Changing `SESSION_SECRET` makes everyone sign in and reconnect. If someone regenerates their token in Monday, the page asks for the new one.

### 3. Vercel

1. Import this repo (Framework preset: **Other**, no build command). `vercel.json` points output at `public/`.
2. Add environment variables (Settings → Environment Variables), see `.env.example`:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ALLOWED_EMAIL_DOMAIN` = `contentjet.io`
   - `SESSION_SECRET`: a long random string (`openssl rand -base64 32`)
   - `ANTHROPIC_API_KEY` (optional): turns on "Rewrite with Claude"
3. Deploy. If anything is missing, the sign-in page lists which variables to add.

### 4. Morning Slack briefing (optional)

Each person on the list gets a Slack DM at 7:30 AM Eastern on weekdays with their Needs you / Due today / Late counts and top three collabs.

The scheduled run has no browser and so no cookie, so it reads Monday with tokens saved in a small Redis store. Only people on `BRIEFING_EMAILS` have their token saved, encrypted, when they connect Monday or press **Send me a test now**. Without the store, "Send me a test now" still works (it uses the token on that browser) but nothing goes out at 7:30.

1. Go to api.slack.com/apps → **Create New App** → **From scratch**, name it "Collab Digest" and pick your workspace.
2. **OAuth & Permissions** → **Bot Token Scopes**: add `chat:write`, `users:read`, `users:read.email`.
3. **App Home** → turn on the **Messages Tab** so the DMs show up.
4. **Install to Workspace** (a Slack admin may need to approve it) and copy the **Bot User OAuth Token** (`xoxb-…`).
5. In Vercel add `SLACK_BOT_TOKEN`, `BRIEFING_EMAILS` (comma-separated company emails), and `CRON_SECRET` (a long random string; Vercel sends it with each scheduled call).
6. In Vercel → **Storage** (or Marketplace) → **Upstash Redis** → create a free database and connect it to this project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Redeploy.
7. Each person on the list opens Home and presses **Send me a test now** once. That checks Slack reaches them and saves their token for the 7:30 run. Someone added to the list later does the same.

"Disconnect" in the account menu removes the saved token too; plain sign-out keeps it so the DM keeps coming. Taking someone off `BRIEFING_EMAILS` stops their DM; their saved token stays until they disconnect.

Timing: Vercel Cron runs in UTC, so `vercel.json` schedules 11:30 and 12:30 UTC on weekdays and the function only sends on the run that lands at 7 AM in New York. That keeps 7:30 AM Eastern through both EST and EDT. On Vercel's Hobby plan a scheduled run can fire anywhere within its hour; Pro runs on time.

Each person's Slack email must match their Google email. Collabs marked "handled" in the digest are saved per browser, so the briefing still counts them.

## Loading speed

- Each page keeps a saved copy of your last data in the browser and shows it straight away, then swaps in the fresh read. Signing out deletes the saved copies.
- `/api/monday` `op:"digest"` returns active collabs and their latest updates in one request, with update batches run in parallel. Updates are re-read for every collab on each refresh: a new update or comment doesn't always change an item's `updated_at` in Monday, so skipping "unchanged" items missed new comments and @mentions.
- The server keeps each person's list for 45 seconds, so moving between pages doesn't re-read Monday. Refresh buttons skip it.
- The Monday user id is stored with the token when it's connected, which saves a lookup on every request.
- KPIs and Creators read active collabs plus Approved/Completed ones from the last 180 days, in parallel, instead of the whole history.

## Differences from the claude.ai version

- **Sign-in** is company Google, not the claude.ai Monday connector. Monday is read with each person's own personal API token instead.
- **Handled marks** are saved per browser (localStorage). The claude.ai version also synced them across devices; bringing that back needs a database such as Upstash Redis.
- **Rewrite with Claude** calls the Anthropic API with your key, so it's billed to that key. Only signed-in company accounts can call it.

## Local development

```
npm install
npx vercel dev
```
