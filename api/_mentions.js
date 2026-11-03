// Finds where someone tagged the signed-in person on Monday.com, for the Catch up page.
// Monday's API doesn't expose the notification inbox, so this reads updates and replies and looks for tags:
//   1. the latest updates on the person's own active collabs, and
//   2. the account-wide updates feed for the window (covers collabs they don't own and other boards).
// Read-only, with the person's own token.
// Each function below is one short request (the page calls them one after another and merges the results),
// so a slow Monday response can't run the whole call past the serverless time limit.
import { monday, AppError } from "./_lib.js";
import { activeItems, itemsByIds } from "./_collabs.js";

const POST = "id body text_body created_at creator{ id name }";
const ITEM_UPDATES_Q = `query($ids:[ID!]){ items(ids:$ids, limit:10){ id updates(limit:15){ ${POST} replies{ ${POST} } } } }`;
const feedQuery = (from) => `query($page:Int!){ updates(limit:100, page:$page${from ? `, from_date:"${from}"` : ""}){ ${POST} item_id replies{ ${POST} } } }`;
export const OWN_ITEMS = 150;   // most recently touched active collabs to scan
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
    const tagsMe = tagsUser(u, user);      // only the tag itself needs its text; the rest need who and when
    out.push({
      id: String(u.id), parentId: parentId || null, itemId: String(itemId || u.item_id || ""),
      at: u.created_at || "", byId: u.creator ? String(u.creator.id) : "", by: u.creator ? u.creator.name || "" : "",
      text: tagsMe ? oneLine(u.text_body).slice(0, MAX_TEXT) : "", tagsMe,
    });
  };
  for (const u of updates || []) {
    add(u, null);
    for (const r of u.replies || []) add(r, u.id);
  }
  return out;
}


/* 1. The collabs to scan: the person's most recently touched active collabs. */
export async function planOwn(user, { fresh = false } = {}) {
  const items = await activeItems(user, { fresh });
  return items.slice().sort((a, b) => time(b.updated_at) - time(a.updated_at)).slice(0, OWN_ITEMS).map((it) => String(it.id));
}

/* 2. Updates and replies on up to 40 of those collabs, in four parallel reads of 10. */
export async function ownChunk(user, ids) {
  const batches = [];
  for (let i = 0; i < ids.length; i += 10) batches.push(ids.slice(i, i + 10));
  const res = await Promise.all(batches.map((b) => monday(ITEM_UPDATES_Q, { ids: b }, user.token)));
  const posts = [];
  for (const r of res) for (const it of r.items || []) posts.push(...flatten(it.updates, it.id, user));
  return posts;
}

/* 3. One page (100) of the account-wide updates feed. useFrom=false reads newest-first and the page stops by date. */
export async function feedPage(user, sinceMs, page, useFrom = true) {
  sinceMs = Math.min(Date.now(), Math.max(Date.now() - MAX_WINDOW_DAYS * 864e5, sinceMs));
  const from = new Date(sinceMs - 864e5).toISOString().slice(0, 10);
  let list;
  try {
    list = (await monday(feedQuery(useFrom ? from : ""), { page }, user.token)).updates || [];
  } catch (e) {
    // Monday builds without the date arguments reject them; read newest-first without and stop by date instead
    if (useFrom && page === 1 && e.code === "tool_error" && /from_date|argument|unknown|field/i.test(e.message)) return feedPage(user, sinceMs, page, false);
    throw e;
  }
  const posts = [];
  for (const u of list) posts.push(...flatten([u], u.item_id, user));
  let more = list.length >= 100;
  if (more && !useFrom) {
    const first = time(list[0].created_at), last = time(list[list.length - 1].created_at);
    if (first >= last && last < sinceMs) more = false;     // newest-first and already past the window
  }
  return { posts, more, useFrom };
}

/* 4. The collabs the tags are on (any board). */
export const itemsFor = (user, ids) => itemsByIds(ids, user);
