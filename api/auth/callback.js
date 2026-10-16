// Google sends the user back here. We swap the code for an ID token, check the Workspace domain,
// then set our own signed session cookie.
import { getCookie, clearCookie, sessionCookie, STATE_COOKIE, redirectUri, allowedDomain, missingConfig } from "../_lib.js";

function back(request, error, cookies = []) {
  const to = new URL("/", request.url);
  if (error) to.searchParams.set("auth_error", error);
  const headers = new Headers({ location: to.pathname + to.search, "cache-control": "no-store" });
  [clearCookie(STATE_COOKIE), ...cookies].forEach((c) => headers.append("set-cookie", c));
  return new Response(null, { status: 302, headers });
}

export async function GET(request) {
  if (missingConfig().length) return back(request, "not_configured");
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back(request, "denied");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== getCookie(request, STATE_COOKIE)) return back(request, "state");

  let idToken;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(request),
        grant_type: "authorization_code",
      }),
    });
    const body = await r.json().catch(() => ({}));
    idToken = body.id_token;
    if (!r.ok || !idToken) return back(request, "exchange");
  } catch {
    return back(request, "exchange");
  }

  // The token came straight from Google's token endpoint over TLS using our client secret,
  // so its claims can be read without re-checking the signature.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
  } catch {
    return back(request, "exchange");
  }
  const domain = allowedDomain();
  const email = String(claims.email || "").toLowerCase();
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now()) return back(request, "exchange");
  if (!claims.email_verified || claims.hd !== domain || !email.endsWith("@" + domain)) return back(request, "wrong_domain");

  return back(request, null, [sessionCookie({ email, name: claims.name || email })]);
}
