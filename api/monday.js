// Read-only Monday.com queries (the one write lives in api/post.js) for the pages, made with the signed-in person's own Monday token.
// The queries live server-side (api/_collabs.js), and every result is limited to collabs where that person is the CFS.
import { json, requireMonday, requireSession, errorResponse, AppError } from "./_lib.js";
import { activeItems, kpiItems, updatesFor, updatesMap, accountUsers } from "./_collabs.js";
import { planOwn, ownChunk, feedPage, itemsFor } from "./_mentions.js";
import { labsFor } from "./config.js";

export async function POST(request) {
  try {
    const session = requireSession(request);
    const user = requireMonday(request, session);
    let body;
    try { body = await request.json(); } catch { body = {}; }

    const fresh = body.fresh === true;
    const me = { id: user.id, name: user.name };

    /* Active collabs and their latest updates in one round trip. `have` maps item id → updated_at the
       browser already holds updates for; those items are skipped. The pages send an empty map, because a
       new update doesn't always change updated_at in Monday. */
    if (body.op === "digest") {
      const items = await activeItems(user, { fresh });
      const have = body.have && typeof body.have === "object" ? body.have : {};
      const need = items.filter((it) => have[String(it.id)] !== it.updated_at).map((it) => String(it.id));
      return json({ me, items, updates: need.length ? await updatesMap(need, user) : {}, fetched: need });
    }

    if (body.op === "list") return json({ me, items: await activeItems(user, { fresh }) });
    if (body.op === "users") return json({ users: await accountUsers(user) });
    if (body.op === "kpi") return json({ me, items: await kpiItems(user, { fresh }) });

    /* Catch up (Labs): the page reads @tags in short steps (plan → own collabs in chunks → feed pages → collab details)
       and merges them, so no single call runs long. Limited to the preview list while it's in development. */
    if (typeof body.op === "string" && body.op.startsWith("missed_")) {
      if (!labsFor(session, user)) throw new AppError("forbidden", "Catch up is still in development.", 403);
      const ids = (list, max) => {
        const out = (Array.isArray(list) ? list : []).map(String).filter((id) => /^\d{1,20}$/.test(id));
        if (!out.length || out.length > max) throw new AppError("bad_request", `Send between 1 and ${max} item ids.`, 400);
        return out;
      };
      if (body.op === "missed_plan") return json({ me, ids: await planOwn(user, { fresh }) });
      if (body.op === "missed_own") return json({ me, posts: await ownChunk(user, ids(body.ids, 40)) });
      if (body.op === "missed_feed") {
        const since = Number(body.since), page = Math.floor(Number(body.page));
        if (!Number.isFinite(since) || !(page >= 1 && page <= 30)) throw new AppError("bad_request", "Send since and page.", 400);
        return json({ me, ...(await feedPage(user, since, page, body.useFrom !== false)) });
      }
      if (body.op === "missed_items") return json({ me, items: await itemsFor(user, ids(body.ids, 100)) });
    }

    if (body.op === "updates") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((id) => /^\d{1,20}$/.test(id)) : [];
      if (!ids.length || ids.length > 100) throw new AppError("bad_request", "Send between 1 and 100 item ids.", 400);
      return json({ items: await updatesFor(ids, user) });
    }

    throw new AppError("bad_request", "Unknown operation.", 400);
  } catch (e) {
    return errorResponse(e);
  }
}
