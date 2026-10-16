// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.
import { createHmac, timingSafeEqual } from "node:crypto";

const MONDAY_URL = "https://api.monday.com/v2";
export const SESSION_COOKIE = "cd_session";
export const STATE_COOKIE = "cd_oauth_state";
const SESSION_DAYS = 30;

export class AppError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

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

export function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearCookie = (name) => setCookie(name, "", 0);

/* ---------- config ---------- */

export const allowedDomain = () => (process.env.ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase().replace(/^@/, "");
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const missingConfig = () =>
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "ALLOWED_EMAIL_DOMAIN", "MONDAY_API_TOKEN"].filter((k) => !process.env[k]);

export function redirectUri(request) {
  return process.env.GOOGLE_REDIRECT_URI || new URL("/api/auth/callback", request.url).toString();
}

/* ---------- session: an HMAC-signed cookie holding the Google identity ---------- */

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data) => createHmac("sha256", process.env.SESSION_SECRET).update(data).digest("base64url");

export function sessionCookie({ email, name }) {
  const payload = b64(JSON.stringify({ email, name, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return setCookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, SESSION_DAYS * 86400);
}

export function readSession(request) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString());
    const domain = allowedDomain();
    if (!s.email || s.exp < Date.now() || !domain || !s.email.toLowerCase().endsWith("@" + domain)) return null;
    return s;
  } catch {
    return null;
  }
}

export function requireSession(request) {
  const s = readSession(request);
  if (!s) throw new AppError("not_signed_in", "Sign in with your Google account first.", 401);
  return s;
}

/* ---------- Monday.com, read with the shared server token ---------- */

export async function monday(query, variables = {}) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new AppError("not_configured", "MONDAY_API_TOKEN isn't set on the server.", 500);
  const headers = { "content-type": "application/json", authorization: token };
  if (process.env.MONDAY_API_VERSION) headers["API-Version"] = process.env.MONDAY_API_VERSION;
  let r;
  try {
    r = await fetch(MONDAY_URL, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
  } catch {
    throw new AppError("server_unavailable", "Monday.com could not be reached.", 503);
  }
  if (r.status === 401 || r.status === 403) throw new AppError("monday_token", "The server's Monday.com token was rejected.", 502);
  if (r.status === 429) throw new AppError("rate_limited", "Monday.com rate limit reached.", 429);
  let body;
  try { body = await r.json(); } catch { throw new AppError("server_unavailable", `Monday.com returned ${r.status}.`, 503); }
  const errs = body.errors || (body.error_message ? [{ message: body.error_message }] : null);
  if (errs && errs.length) {
    const msg = errs.map((e) => e.message).join("; ");
    if (/not authenticated|unauthorized|invalid token/i.test(msg)) throw new AppError("monday_token", msg, 502);
    if (/complexity|rate limit/i.test(msg)) throw new AppError("rate_limited", msg, 429);
    throw new AppError("tool_error", msg, 502);
  }
  if (!r.ok) throw new AppError("server_unavailable", `Monday.com returned ${r.status}.`, 503);
  return body.data || {};
}

/* Maps a signed-in Google email to the Monday.com user with the same email. */
const userCache = new Map();
export async function mondayUser(email) {
  const key = email.toLowerCase();
  const hit = userCache.get(key);
  if (hit && hit.at > Date.now() - 36e5) return hit.user;
  const data = await monday("query($e:[String]){ users(emails:$e){ id name email } }", { e: [email] });
  const user = (data.users || []).find((u) => String(u.email || "").toLowerCase() === key);
  if (!user) throw new AppError("no_monday_user", `No Monday.com user has the email ${email}.`, 403);
  userCache.set(key, { user, at: Date.now() });
  return user;
}

export function errorResponse(e) {
  if (e instanceof AppError) {
    const headers = e.code === "not_signed_in" ? { "set-cookie": clearCookie(SESSION_COOKIE) } : {};
    return json({ error: { code: e.code, message: e.message } }, e.status, headers);
  }
  console.error(e);
  return json({ error: { code: "internal", message: "Something went wrong on the server." } }, 500);
}
