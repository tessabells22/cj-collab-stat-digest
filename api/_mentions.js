// Finds where someone tagged the signed-in person on Monday.com, for the Catch up page.
// Monday's API doesn't expose the notification inbox, so this reads updates and replies and looks for tags:
//   1. the latest updates on the person's own active collabs, and
//   2. the account-wide updates feed for the window (covers collabs they don't own and other boards).
// Read-only, with the person's own token.
import { monday, AppError } from "./_lib.js";
import { activeItems, itemsByIds } from "./_collabs.js";

const POST = "id body text_body created_at creator{ id name }";
const ITEM_UPDATES_Q = `query($ids:[ID!]){ items(ids:$ids, limit:25){ id updates(limit:25){ ${POST} replies{ ${POST} } } } }`;
const feedQuery = (from) => `query($page:Int!){ updates(limit:100, page:$page${from ? `, from_date:"${from}"` : ""}){ ${POST} item_id replies{ ${POST} } } }`;
const OWN_ITEMS = 250;     // most recently touched active collabs to scan
const FEED_PAGES = 12;     // 100 updates a page
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

async function ownPosts(user, fresh) {
  const items = (await activeItems(user, { fresh })).slice()
    .sort((a, b) => time(b.updated_at) - time(a.updated_at)).slice(0, OWN_ITEMS).map((it) => String(it.id));
  const batches = [];
  for (let i = 0; i < items.length; i += 25) batches.push(items.slice(i, i + 25));
  const posts = [];
  for (let i = 0; i < batches.length; i += 4) {
    const res = await Promise.all(batches.slice(i, i + 4).map((b) => monday(ITEM_UPDATES_Q, { ids: b }, user.token)));
    for (const r of res) for (const it of r.items || []) posts.push(...flatten(it.updates, it.id, user));
  }
  return posts;
}

async function feedPosts(user, sinceMs) {
  const from = new Date(sinceMs - 864e5).toISOString().slice(0, 10);
  let useFrom = true;
  const posts = [];
  for (let page = 1; page <= FEED_PAGES; page++) {
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

  const notes = { feedFailed: false };
  const [own, feed] = await Promise.all([
    ownPosts(user, fresh),
    feedPosts(user, sinceMs).catch((e) => {
      if (e instanceof AppError && ["monday_token", "monday_not_connected", "rate_limited"].includes(e.code)) throw e;
      console.warn("account updates feed failed:", e.message);
      notes.feedFailed = true;
      return [];
    }),
  ]);
  const byId = new Map();
  for (const p of [...own, ...feed]) if (p.itemId && !byId.has(p.id)) byId.set(p.id, p);
  const all = [...byId.values()];

  const relevant = new Set(all.filter((p) => p.tagsMe && p.byId !== String(user.id) && time(p.at) >= sinceMs).map((p) => p.itemId));
  const posts = all.filter((p) => relevant.has(p.itemId));
  const items = relevant.size ? await itemsByIds([...relevant], user) : [];
  const value = { since: sinceMs, now, posts, items, notes };
  memo.set(key, { at: now, value });
  if (memo.size > 50) memo.delete(memo.keys().next().value);
  return value;
}
