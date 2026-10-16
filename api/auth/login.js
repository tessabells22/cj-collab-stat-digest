// Starts "Continue with Google", limited to the company Google Workspace domain.
import { json, setCookie, STATE_COOKIE, redirectUri, allowedDomain, missingConfig } from "../_lib.js";

export function GET(request) {
  if (missingConfig().length) return json({ error: { code: "not_configured", message: "Google sign-in isn't set up yet." } }, 500);
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("hd", allowedDomain()); // only a hint for the account picker; the callback enforces it
  url.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), "set-cookie": setCookie(STATE_COOKIE, state, 600), "cache-control": "no-store" },
  });
}
