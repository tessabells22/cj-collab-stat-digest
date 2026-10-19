// Tells the page who is signed in and which features are configured.
import { json, readSession, aiEnabled, allowedDomain, missingConfig } from "./_lib.js";
import { slackEnabled, recipients } from "./_briefing.js";

export function GET(request) {
  const s = readSession(request);
  return json({
    signedIn: !!s,
    user: s ? { email: s.email, name: s.name } : null,
    domain: allowedDomain(),
    ai: aiEnabled(),
    briefing: slackEnabled(),
    briefingMe: !!s && slackEnabled() && recipients().includes(s.email.toLowerCase()),
    missing: missingConfig(),
  });
}
