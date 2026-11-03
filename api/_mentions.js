// Finds where someone tagged the signed-in person on Monday.com, for the Catch up page.
// Monday's API doesn't expose the notification inbox, so this reads updates and replies and looks for tags:
//   1. the latest updates on the person's own active collabs, and
//   2. the account-wide updates feed for the window (covers collabs they don't own and other boards).
// Read-only, with the person's own token.
import { monday, AppError } from "./_lib.js";
import { activeItems, itemsByIds } from "./_collabs.js";

const POST = "id body text_body created_at creator{ id name }";
const ITEM_UPDATES_Q = `query($ids:[ID!]){ items(ids:$ids, limit:10){ id updates(limit:20){ ${POST} replies{ ${POST} } } } }`;
const feedQuery = (from) => `query($page:Int!){ updates(limit:100, page:$page${from ? `, from_date:"${from}"` : ""}){ ${POST} item_id replies{ ${POST} } } }`;
const OWN_ITEMS = 150;     // most recently touched active collabs to scan
const FEED_PAGES = 6;      // 100 updates a page
const BUDGET_MS = 40_000;  // stop reading more once this much time has gone, and return what was found
const MAX_WINDOW_DAYS = 31;
const MAX_TEXT = 500;

const norm = (s) => String(s || "").trim().toLowerCase();
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const time = (s) => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.getTime() : 0; };

/* Monday writes a tag as <a ... data-mention-type="User" data-mention-id="123" href=".../users/123">@Name</a>.
   Older or pasted text may only have "@Name", so the plain text is checked too. */
export function tagsUser(post, user) {
  const body = String(post.body || "");
  for (const m of body.matchAll(/data-mention-id="(\d+)"/g)) if (m[1] === String(user.id)) return true;
  for (const m of body.matchAll(/\/users\/(\d+)(?!\d)/g)) if (m[1] === String(user.id)) return true;
  const name = norm(user.name);
  if (!name) return false;
  const text = norm(post.text_body);
  const at = "@" + name;
  for (let i = text.indexOf(at); i >= 0; i = text.indexOf(at, i + 1)) {
    const next = text[i + at.length];
    if (!next || !/[\p{L}\p{N}]/u.test(next)) return true;   // not when the name is only the start of a longer one
  }
  return false;
}

/* updates (with replies) → flat posts. A reply carries its parent's id. */
export function flatten(updates, itemId, user) {
  const out = [];
  const add = (u, parentId) => {
    if (!u || !u.id) return;
    out.push({
      id: String(u.id), parentId: parentId || null, itemId: String(itemId || u.item_id || ""),
      at: u.created_at || "", byId: u.creator ? String(u.creator.id) : "", by: u.creator ? u.creator.name || "" : "",
      text: oneLine(u.text_body).slice(0, MAX_TEXT), tagsMe: tagsUser(u, user),
    });
  };
  for (const u of updates || []) {
    add(u, null);
    for (const r of u.replies || []) add(r, u.id);
  }
  return out;
}

async function ownPosts(user, fresh, started, notes) {
  const items = (await activeItems(user, { fresh })).slice()
    .sort((a, b) => time(b.updated_at) - time(a.updated_at)).slice(0, OWN_ITEMS).map((it) => String(it.id));
  const batches = [];
  for (let i = 0; i < items.length; i += 10) batches.push(items.slice(i, i + 10));
  const posts = [];
  for (let i = 0; i < batches.length; i += 4) {
    if (Date.now() - started > BUDGET_MS) { notes.truncated = true; break; }
    const res = await Promise.all(batches.slice(i, i + 4).map((b) => monday(ITEM_UPDATES_Q, { ids: b }, user.token)));
    for (const r of res) for (const it of r.items || []) posts.push(...flatten(it.updates, it.id, user));
  }
  return posts;
}

async function feedPosts(user, sinceMs, started, notes) {
  const from = new Date(sinceMs - 864e5).toISOString().slice(0, 10);
  let useFrom = true;
  const posts = [];
  for (let page = 1; page <= FEED_PAGES; page++) {
    if (Date.now() - started > BUDGET_MS) { notes.truncated = true; break; }
    let list;
    try {
      list = (await monday(feedQuery(useFrom ? from : ""), { page }, user.token)).updates || [];
    } catch (e) {
      // Monday builds without the date arguments reject them; read newest-first without and stop by date instead
      if (useFrom && page === 1 && e.code === "tool_error" && /from_date|argument|unknown|field/i.test(e.message)) { useFrom = false; page--; continue; }
      throw e;
    }
    for (const u of list) posts.push(...flatten([u], u.item_id, user));
    if (list.length < 100) break;
    const first = time(list[0].created_at), last = time(list[list.length - 1].created_at);
    if (!useFrom && first >= last && last < sinceMs) break;    // newest-first and past the window
  }
  return posts;
}

const memo = new Map();
/* Tags of this person since sinceMs, with the posts around them and the collab each one is on. */
export async function missedTags(user, sinceMs, { fresh = false } = {}) {
  const now = Date.now();
  sinceMs = Math.min(now, Math.max(now - MAX_WINDOW_DAYS * 864e5, sinceMs));
  const key = `${user.id}:${Math.floor(sinceMs / 6e4)}`;
  const hit = memo.get(key);
  if (!fresh && hit && now - hit.at < 45_000) return hit.value;

  const notes = { ownFailed: "", feedFailed: "", truncated: false };
  const fatal = (e) => e instanceof AppError && ["monday_token", "monday_not_connected", "rate_limited"].includes(e.code);
  const label = (what, e) => `${what}: ${e && e.message ? e.message : e}`;
  const t0 = Date.now();
  const [own, feed] = await Promise.all([
    ownPosts(user, fresh, t0, notes).catch((e) => { if (fatal(e)) throw e; console.warn("catch-up: own collabs failed:", e.message); notes.ownFailed = label("your collabs' updates", e); return null; }),
    feedPosts(user, sinceMs, t0, notes).catch((e) => { if (fatal(e)) throw e; console.warn("catch-up: updates feed failed:", e.message); notes.feedFailed = label("the account updates feed", e); return null; }),
  ]);
  console.log(`catch-up: ${Date.now() - t0}ms own=${own ? own.length : "failed"} feed=${feed ? feed.length : "failed"}`);
  if (!own && !feed) throw new AppError("tool_error", `Monday.com rejected both reads. ${notes.ownFailed}; ${notes.feedFailed}`, 502);
  const byId = new Map();
  for (const p of [...(own || []), ...(feed || [])]) if (p.itemId && !byId.has(p.id)) byId.set(p.id, p);
  const all = [...byId.values()];

  const relevant = new Set(all.filter((p) => p.tagsMe && p.byId !== String(user.id) && time(p.at) >= sinceMs).map((p) => p.itemId));
  const posts = all.filter((p) => relevant.has(p.itemId));
  const items = relevant.size ? await itemsByIds([...relevant], user).catch((e) => { throw new AppError(e.code || "tool_error", `collab details: ${e.message}`, e.status || 502); }) : [];
  const value = { since: sinceMs, now, posts, items, notes };
  memo.set(key, { at: now, value });
  if (memo.size > 50) memo.delete(memo.keys().next().value);
  return value;
}
