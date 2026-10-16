// Tells the page what's available: whether this browser is signed in, and which features are configured.
import { json, getCookie, TOKEN_COOKIE, oauthEnabled, aiEnabled } from "./_lib.js";

export function GET(request) {
  return json({
    signedIn: !!getCookie(request, TOKEN_COOKIE),
    oauth: oauthEnabled(),
    ai: aiEnabled(),
  });
}
