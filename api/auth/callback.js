// Monday.com sends the user back here after they approve the app.
import { getCookie, setCookie, clearCookie, STATE_COOKIE, TOKEN_COOKIE, oauthEnabled, redirectUri, whoAmI } from "../_lib.js";

function back(request, error, cookies = []) {
  const to = new URL("/", request.url);
  if (error) to.searchParams.set("auth_error", error);
  const headers = new Headers({ location: to.pathname + to.search, "cache-control": "no-store" });
  [clearCookie(STATE_COOKIE), ...cookies].forEach((c) => headers.append("set-cookie", c));
  return new Response(null, { status: 302, headers });
}

export async function GET(request) {
  if (!oauthEnabled()) return back(request, "oauth_disabled");
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back(request, "denied");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== getCookie(request, STATE_COOKIE)) return back(request, "state");

  let token;
  try {
    const r = await fetch("https://auth.monday.com/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.MONDAY_CLIENT_ID,
        client_secret: process.env.MONDAY_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri(request),
      }),
    });
    const body = await r.json().catch(() => ({}));
    token = body.access_token;
    if (!r.ok || !token) return back(request, "exchange");
  } catch {
    return back(request, "exchange");
  }

  try {
    await whoAmI(token);
  } catch (e) {
    return back(request, e.code === "wrong_account" ? "wrong_account" : "exchange");
  }
  return back(request, null, [setCookie(TOKEN_COOKIE, token)]);
}
