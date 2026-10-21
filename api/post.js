// "Post update": posts the same update on several collabs, and pins it, with the person's own Monday token.
// This is the app's only write to Monday. It only posts on active collabs where the person is the CFS.
import { json, requireSession, requireMonday, errorResponse, monday, AppError } from "./_lib.js";
import { activeItems } from "./_collabs.js";

const MAX_ITEMS = 50;
const MAX_BODY = 5000;
const AT_ONCE = 4;

const CREATE_Q = "mutation($item:ID!, $body:String!){ create_update(item_id:$item, body:$body){ id } }";
const PIN_Q = "mutation($id:ID!, $item:ID){ pin_to_top(id:$id, item_id:$item){ id } }";

/* Plain text with **bold** → the HTML Monday stores for updates. */
export function toHtml(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return esc(text.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\r?\n/).join("<br>");
}

/* One collab: create the update (unless it was already created on an earlier try), then pin it. */
async function postOne(user, { id, updateId }, html, pin) {
  const out = { id, updateId: updateId || null, posted: !!updateId, pinned: false };
  try {
    if (!out.updateId) {
      const created = (await monday(CREATE_Q, { item: id, body: html }, user.token)).create_update;
      if (!created || !created.id) throw new AppError("tool_error", "Monday.com didn't return the new update.", 502);
      out.updateId = String(created.id);
      out.posted = true;
    }
    if (pin) {
      await monday(PIN_Q, { id: out.updateId, item: id }, user.token);
      out.pinned = true;
    }
  } catch (e) {
    if (e.code === "monday_token" || e.code === "monday_not_connected") throw e;
    out.error = e.code === "rate_limited" ? "Monday.com is busy. Retry in a minute." : (e.message || "Monday.com rejected it.");
  }
  return out;
}

export async function POST(request) {
  try {
    /* JSON only: a plain cross-site form can't send it, and the session cookie is SameSite=Lax */
    if (!/^application\/json/i.test(request.headers.get("content-type") || "")) throw new AppError("bad_request", "Send JSON.", 415);
    const session = requireSession(request);
    const user = requireMonday(request, session);
    let b;
    try { b = await request.json(); } catch { b = {}; }

    const text = String(b.text || "");
    if (!text.trim()) throw new AppError("bad_request", "Write the update first.", 400);
    if (text.length > MAX_BODY) throw new AppError("bad_request", `Keep the update under ${MAX_BODY} characters.`, 400);
    const seen = new Set();
    const items = (Array.isArray(b.items) ? b.items : [])
      .map((x) => ({ id: String(x && x.id || ""), updateId: x && x.updateId ? String(x.updateId) : null }))
      .filter((x) => /^\d{1,20}$/.test(x.id) && (!x.updateId || /^\d{1,20}$/.test(x.updateId)) && !seen.has(x.id) && seen.add(x.id));
    if (!items.length || items.length > MAX_ITEMS) throw new AppError("bad_request", `Pick between 1 and ${MAX_ITEMS} collabs.`, 400);

    /* only active collabs where this person is the CFS: the same list the page showed */
    const mine = new Set((await activeItems(user)).map((it) => String(it.id)));
    const html = toHtml(text);
    const pin = b.pin !== false;
    const results = [];
    const allowed = items.filter((x) => mine.has(x.id) || !results.push({ id: x.id, posted: false, pinned: false, error: "Not one of your active collabs." }));
    for (let i = 0; i < allowed.length; i += AT_ONCE) {
      results.push(...(await Promise.all(allowed.slice(i, i + AT_ONCE).map((x) => postOne(user, x, html, pin)))));
    }
    return json({ results, pin });
  } catch (e) {
    return errorResponse(e);
  }
}
