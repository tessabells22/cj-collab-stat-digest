// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.

const MONDAY_URL = "https://api.monday.com/v2";
export const TOKEN_COOKIE = "cd_mt";
export const STATE_COOKIE = "cd_oauth_state";
const NINETY_DAYS = 90 * 24 * 60 * 60;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function getCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function setCookie(name, value, maxAge = NINETY_DAYS) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearCookie = (name) => setCookie(name, "", 0);

export class MondayError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function monday(token, query, variables = {}) {
  const headers = { "content-type": "application/json", authorization: token };
  if (process.env.MONDAY_API_VERSION) headers["API-Version"] = process.env.MONDAY_API_VERSION;
  let r;
  try {
    r = await fetch(MONDAY_URL, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
  } catch {
    throw new MondayError("server_unavailable", "Monday.com could not be reached.", 503);
  }
  if (r.status === 401 || r.status === 403) throw new MondayError("needs_reauth", "Monday.com rejected the sign-in.", 401);
  if (r.status === 429) throw new MondayError("rate_limited", "Monday.com rate limit reached.", 429);
  let body;
  try { body = await r.json(); } catch { throw new MondayError("server_unavailable", `Monday.com returned ${r.status}.`, 503); }
  const errs = body.errors || (body.error_message ? [{ message: body.error_message }] : null);
  if (errs && errs.length) {
    const msg = errs.map((e) => e.message).join("; ");
    if (/not authenticated|unauthorized|invalid token/i.test(msg)) throw new MondayError("needs_reauth", msg, 401);
    if (/complexity|rate limit/i.test(msg)) throw new MondayError("rate_limited", msg, 429);
    throw new MondayError("tool_error", msg, 502);
  }
  if (!r.ok) throw new MondayError("server_unavailable", `Monday.com returned ${r.status}.`, 503);
  return body.data || {};
}

/* Confirms the token works and, when ALLOWED_MONDAY_ACCOUNT_ID is set, that it belongs to that account. */
export async function whoAmI(token) {
  const data = await monday(token, "query{ me{ id name account{ id name } } }");
  const me = data.me;
  if (!me) throw new MondayError("needs_reauth", "Monday.com did not return a user.", 401);
  const allowed = (process.env.ALLOWED_MONDAY_ACCOUNT_ID || "").trim();
  if (allowed && String(me.account && me.account.id) !== allowed) {
    throw new MondayError("wrong_account", "This Monday.com account isn't allowed on this page.", 403);
  }
  return me;
}

export function requireToken(request) {
  const token = getCookie(request, TOKEN_COOKIE);
  if (!token) throw new MondayError("not_signed_in", "Sign in with Monday.com first.", 401);
  return token;
}

export function errorResponse(e) {
  if (e instanceof MondayError) {
    const headers = e.code === "needs_reauth" || e.code === "wrong_account" ? { "set-cookie": clearCookie(TOKEN_COOKIE) } : {};
    return json({ error: { code: e.code, message: e.message } }, e.status, headers);
  }
  console.error(e);
  return json({ error: { code: "internal", message: "Something went wrong on the server." } }, 500);
}

export const oauthEnabled = () => !!(process.env.MONDAY_CLIENT_ID && process.env.MONDAY_CLIENT_SECRET);
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export function redirectUri(request) {
  return process.env.MONDAY_REDIRECT_URI || new URL("/api/auth/callback", request.url).toString();
}
