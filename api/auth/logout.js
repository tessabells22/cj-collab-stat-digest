import { json, clearCookie, TOKEN_COOKIE } from "../_lib.js";

export function POST() {
  return json({ ok: true }, 200, { "set-cookie": clearCookie(TOKEN_COOKIE) });
}
