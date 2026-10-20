// Connects the signed-in person's Monday.com account: checks their personal API token with Monday,
// then keeps it in a sealed, HttpOnly cookie on this browser. DELETE disconnects.
// If they get the Slack briefing and a token store is set up, the token is also saved for the 7:30 AM run.
import { json, requireSession, errorResponse, whoAmI, tokenCookie, clearCookie, TOKEN_COOKIE, AppError } from "../_lib.js";
import { storeEnabled, saveToken, dropToken } from "../_store.js";
import { recipients, slackEnabled } from "../_briefing.js";

const getsBriefing = (email) => slackEnabled() && storeEnabled() && recipients().includes(email.toLowerCase());

export async function POST(request) {
  try {
    const session = requireSession(request);
    let body;
    try { body = await request.json(); } catch { body = {}; }
    const token = String(body.token || "").trim();
    if (!token || token.length > 4000 || /\s/.test(token)) throw new AppError("bad_token", "Paste the whole token from Monday.com.", 400);
    let me;
    try { me = await whoAmI(token); }
    catch (e) { if (e.code === "monday_token") throw new AppError("bad_token", "Monday.com didn't accept that token. Copy it again from Developers → My access tokens.", 400); throw e; }
    const t = { email: session.email.toLowerCase(), token, id: me.id, name: me.name };
    let briefing = false;
    if (getsBriefing(session.email)) {
      try { await saveToken(t); briefing = true; } catch (e) { console.error(e.message); }
    }
    return json({ ok: true, monday: { id: me.id, name: me.name, email: me.email }, briefing }, 200, { "set-cookie": tokenCookie(t) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request) {
  try {
    const session = requireSession(request);
    if (storeEnabled()) { try { await dropToken(session.email); } catch (e) { console.error(e.message); } }
    return json({ ok: true }, 200, { "set-cookie": clearCookie(TOKEN_COOKIE) });
  } catch (e) {
    return errorResponse(e);
  }
}
