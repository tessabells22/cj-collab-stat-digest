// Signs out and forgets the Monday token on this browser. A token saved for the Slack briefing stays,
// so the morning DM keeps coming; "Disconnect Monday.com" in the account menu removes that too.
import { json, clearCookie, SESSION_COOKIE, TOKEN_COOKIE } from "../_lib.js";

export function POST() {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  headers.append("set-cookie", clearCookie(TOKEN_COOKIE));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
