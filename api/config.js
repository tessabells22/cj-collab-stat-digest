// Tells the page who is signed in and which features are configured.
import { json, readSession, aiEnabled, allowedDomain, missingConfig } from "./_lib.js";

export function GET(request) {
  const s = readSession(request);
  return json({
    signedIn: !!s,
    user: s ? { email: s.email, name: s.name } : null,
    domain: allowedDomain(),
    ai: aiEnabled(),
    missing: missingConfig(),
  });
}
