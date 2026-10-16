// Sign in with a Monday.com personal API token instead of OAuth.
// The token is checked against Monday.com, then kept in an HttpOnly cookie so page scripts never see it again.
import { json, setCookie, TOKEN_COOKIE, whoAmI, errorResponse, MondayError } from "../_lib.js";

export async function POST(request) {
  try {
    let body;
    try { body = await request.json(); } catch { body = {}; }
    const token = String(body.token || "").trim();
    if (!token || token.length > 4000) throw new MondayError("bad_request", "Paste your Monday.com API token.", 400);
    const me = await whoAmI(token);
    return json({ ok: true, name: me.name }, 200, { "set-cookie": setCookie(TOKEN_COOKIE, token) });
  } catch (e) {
    if (e.code === "needs_reauth") return json({ error: { code: "bad_token", message: "Monday.com didn't accept that token." } }, 401);
    return errorResponse(e);
  }
}
