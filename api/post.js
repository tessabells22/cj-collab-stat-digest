// "Post update": posts the same update on several collabs (optionally pinned), or the same reply under a
// chosen update on each collab, with the person's own Monday token.
// This is the app's only write to Monday. It only posts on active collabs where the person is the CFS.
import { json, requireSession, requireMonday, errorResponse, monday, AppError } from "./_lib.js";
import { activeItems } from "./_collabs.js";

const MAX_ITEMS = 50;
const MAX_BODY = 5000;
const AT_ONCE = 4;

const MAX_MENTIONS = 20;
const CREATE_Q = "mutation($item:ID!, $body:String!){ create_update(item_id:$item, body:$body){ id } }";
/* mentions_list makes Monday notify the people tagged; the <a> tags in the body make them show as real tags */
const CREATE_MENTIONS_Q = "mutation($item:ID!, $body:String!, $mentions:[UpdateMention]){ create_update(item_id:$item, body:$body, mentions_list:$mentions){ id } }";
/* replies: parent_id instead of item_id; a reply can't be pinned */
const REPLY_Q = "mutation($parent:ID!, $body:String!){ create_update(parent_id:$parent, body:$body){ id } }";
const REPLY_MENTIONS_Q = "mutation($parent:ID!, $body:String!, $mentions:[UpdateMention]){ create_update(parent_id:$parent, body:$body, mentions_list:$mentions){ id } }";
const ITEM_UPDATES_Q = "query($ids:[ID!]){ items(ids:$ids, limit:100){ id updates(limit:50){ id } } }";
const PIN_Q = "mutation($id:ID!, $item:ID){ pin_to_top(id:$id, item_id:$item){ id } }";

/* Plain text with **bold** and @Name tags → the HTML Monday stores for updates. mentions = [{id, name}]
   picked in the page; each "@Name" becomes the same link Monday's own editor writes for a tag. */
export function toHtml(text, mentions = [], origin = "") {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let html = esc(text.trim());
  const byName = new Map(mentions.map((m) => ["@" + esc(m.name), m]));
  if (byName.size) {
    const alt = [...byName.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    html = html.replace(new RegExp(alt, "g"), (k) => {
      const m = byName.get(k);
      return `<a class="user_mention_editor router" href="${origin}/users/${m.id}" data-mention-type="User" data-mention-id="${m.id}" target="_blank" rel="noopener noreferrer">${k}</a>`;
    });
  }
  return html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\r?\n/).join("<br>");
}

/* One collab: create the update (unless it was already created on an earlier try), then pin it. */
async function postOne(user, { id, updateId, parentId }, html, pin, mentions) {
  const out = { id, updateId: updateId || null, posted: !!updateId, pinned: false };
  const target = parentId ? { parent: parentId } : { item: id };
  const [plainQ, mentionsQ] = parentId ? [REPLY_Q, REPLY_MENTIONS_Q] : [CREATE_Q, CREATE_MENTIONS_Q];
  if (parentId) pin = false;
  try {
    if (!out.updateId) {
      let created;
      if (mentions.length) {
        const list = mentions.map((m) => ({ id: m.id, type: "User" }));
        try { created = (await monday(mentionsQ, { ...target, body: html, mentions: list }, user.token)).create_update; }
        catch (e) {
          /* an older API version without mentions_list: post with the tags in the body only */
          if (e.code !== "tool_error" || !/mention/i.test(e.message)) throw e;
          created = (await monday(plainQ, { ...target, body: html }, user.token)).create_update;
        }
      } else {
        created = (await monday(plainQ, { ...target, body: html }, user.token)).create_update;
      }
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
      .map((x) => ({ id: String(x && x.id || ""), updateId: x && x.updateId ? String(x.updateId) : null, parentId: x && x.parentId ? String(x.parentId) : null }))
      .filter((x) => /^\d{1,20}$/.test(x.id) && (!x.updateId || /^\d{1,20}$/.test(x.updateId)) && (!x.parentId || /^\d{1,20}$/.test(x.parentId)) && !seen.has(x.id) && seen.add(x.id));
    const reply = b.reply === true;
    if (reply && items.some((x) => !x.parentId)) throw new AppError("bad_request", "Pick an update to reply to on every collab.", 400);
    if (!reply) items.forEach((x) => { x.parentId = null; });
    if (!items.length || items.length > MAX_ITEMS) throw new AppError("bad_request", `Pick between 1 and ${MAX_ITEMS} collabs.`, 400);

    const seenM = new Set();
    const mentions = (Array.isArray(b.mentions) ? b.mentions : [])
      .map((m) => ({ id: String(m && m.id || ""), name: String(m && m.name || "").trim() }))
      .filter((m) => /^\d{1,20}$/.test(m.id) && m.name && m.name.length <= 100 && text.includes("@" + m.name) && !seenM.has(m.id) && seenM.add(m.id))
      .slice(0, MAX_MENTIONS);

    /* only active collabs where this person is the CFS: the same list the page showed */
    const active = await activeItems(user);
    const mine = new Set(active.map((it) => String(it.id)));
    let origin = "https://monday.com";
    try { if (active[0] && active[0].url) origin = new URL(active[0].url).origin; } catch {}
    const html = toHtml(text, mentions, origin);
    const pin = !reply && b.pin === true;
    const results = [];
    let allowed = items.filter((x) => mine.has(x.id) || !results.push({ id: x.id, posted: false, pinned: false, error: "Not one of your active collabs." }));
    /* a reply's parent must be an update on that same collab */
    if (reply && allowed.length) {
      const owned = new Map(((await monday(ITEM_UPDATES_Q, { ids: allowed.map((x) => x.id) }, user.token)).items || [])
        .map((it) => [String(it.id), new Set((it.updates || []).map((u) => String(u.id)))]));
      allowed = allowed.filter((x) => (owned.get(x.id) || new Set()).has(x.parentId) || !results.push({ id: x.id, posted: false, pinned: false, error: "That update isn't on this collab any more. Refresh and pick again." }));
    }
    for (let i = 0; i < allowed.length; i += AT_ONCE) {
      results.push(...(await Promise.all(allowed.slice(i, i + AT_ONCE).map((x) => postOne(user, x, html, pin, mentions)))));
    }
    return json({ results, pin, reply });
  } catch (e) {
    return errorResponse(e);
  }
}
