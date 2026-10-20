// Vercel Cron calls this on weekdays at 11:30 and 12:30 UTC. Only the run that lands at 7 AM in
// New York sends, so the briefing arrives at 7:30 AM Eastern through both EST and EDT.
import { json } from "../_lib.js";
import { sendBriefing, recipients, slackEnabled } from "../_briefing.js";
import { storeEnabled, loadToken } from "../_store.js";

const nyClock = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), weekday: parts.weekday };
};

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (!slackEnabled()) return json({ skipped: "SLACK_BOT_TOKEN isn't set" });
  if (!storeEnabled()) return json({ skipped: "No token store (KV_REST_API_URL / KV_REST_API_TOKEN), so there are no Monday tokens to read with" });
  const force = new URL(request.url).searchParams.get("force") === "1";
  const { hour, weekday } = nyClock();
  if (!force && (hour !== 7 || weekday === "Sat" || weekday === "Sun")) return json({ skipped: `It's ${hour}:xx on ${weekday} in New York; the briefing goes at 7:30 on weekdays.` });
  const sent = [], failed = [];
  for (const email of recipients()) {
    try {
      const m = await loadToken(email);
      if (!m) { failed.push({ email, error: "no_token", message: "Hasn't connected Monday.com since being added. They can press Send me a test now on Home." }); continue; }
      sent.push(await sendBriefing(email, m));
    }
    catch (e) { failed.push({ email, error: e.code || "error", message: e.message }); console.error("briefing failed", email, e.code, e.message); }
  }
  return json({ sent, failed });
}
