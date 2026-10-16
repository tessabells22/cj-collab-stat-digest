import { json, clearCookie, SESSION_COOKIE } from "../_lib.js";

export function POST() {
  return json({ ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });
}
