// Tells the page who is signed in and which features are configured.
import { json, readSession, readMonday, aiEnabled, allowedDomain, missingConfig } from "./_lib.js";
import { slackEnabled, recipients } from "./_briefing.js";
import { storeEnabled } from "./_store.js";

/* Labs (pages in development) are shown to these people only: PREVIEW_EMAILS (Google emails) or
   PREVIEW_MONDAY_IDS (Monday user ids; defaults to Tessa's). */
export function labsFor(s, m) {
  if (!s) return false;
  const list = (v) => String(v || "").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ids = list(process.env.PREVIEW_MONDAY_IDS ?? "67140875");
  return list(process.env.PREVIEW_EMAILS).includes(String(s.email).toLowerCase()) || (!!m && ids.includes(String(m.id)));
}

export function GET(request) {
  const s = readSession(request);
  const m = s ? readMonday(request, s) : null;
  return json({
    signedIn: !!s,
    user: s ? { email: s.email, name: s.name } : null,
    monday: m ? { id: m.id, name: m.name } : null,
    labs: labsFor(s, m),
    domain: allowedDomain(),
    ai: aiEnabled(),
    briefing: slackEnabled(),
    /* the scheduled DM needs the token store; without it only "Send me a test now" works */
    briefingScheduled: slackEnabled() && storeEnabled(),
    briefingMe: !!s && slackEnabled() && storeEnabled() && recipients().includes(s.email.toLowerCase()),
    missing: missingConfig(),
  });
}
