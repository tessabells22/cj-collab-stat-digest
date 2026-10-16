// Starts the Monday.com OAuth flow.
import { json, setCookie, STATE_COOKIE, oauthEnabled, redirectUri } from "../_lib.js";

export function GET(request) {
  if (!oauthEnabled()) return json({ error: { code: "oauth_disabled", message: "Monday.com sign-in isn't configured." } }, 404);
  const state = crypto.randomUUID();
  const url = new URL("https://auth.monday.com/oauth2/authorize");
  url.searchParams.set("client_id", process.env.MONDAY_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), "set-cookie": setCookie(STATE_COOKIE, state, 600), "cache-control": "no-store" },
  });
}
