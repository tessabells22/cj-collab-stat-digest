// Vercel Cron calls this on weekdays at 11:30 and 12:30 UTC. Only the run that lands at 7 AM in
// New York sends, so the briefing arrives at 7:30 AM Eastern through both EST and EDT.
import { json } from "../_lib.js";
import { sendBriefing, recipients, slackEnabled } from "../_briefing.js";

const nyClock = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), weekday: parts.weekday };
};

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (!slackEnabled()) return json({ skipped: "SLACK_BOT_TOKEN isn't set" });
  const force = new URL(request.url).searchParams.get("force") === "1";
  const { hour, weekday } = nyClock();
  if (!force && (hour !== 7 || weekday === "Sat" || weekday === "Sun")) return json({ skipped: `It's ${hour}:xx on ${weekday} in New York; the briefing goes at 7:30 on weekdays.` });
  const sent = [], failed = [];
  for (const email of recipients()) {
    try { sent.push(await sendBriefing(email)); }
    catch (e) { failed.push({ email, error: e.code || "error", message: e.message }); console.error("briefing failed", email, e.code, e.message); }
  }
  return json({ sent, failed });
}
