// Tells the page who is signed in and which features are configured.
import { json, readSession, readMonday, aiEnabled, allowedDomain, missingConfig } from "./_lib.js";
import { slackEnabled, recipients } from "./_briefing.js";
import { storeEnabled } from "./_store.js";

export function GET(request) {
  const s = readSession(request);
  const m = s ? readMonday(request, s) : null;
  return json({
    signedIn: !!s,
    user: s ? { email: s.email, name: s.name } : null,
    monday: m ? { id: m.id, name: m.name } : null,
    domain: allowedDomain(),
    ai: aiEnabled(),
    briefing: slackEnabled(),
    /* the scheduled DM needs the token store; without it only "Send me a test now" works */
    briefingScheduled: slackEnabled() && storeEnabled(),
    briefingMe: !!s && slackEnabled() && storeEnabled() && recipients().includes(s.email.toLowerCase()),
    missing: missingConfig(),
  });
}
