// Read-only Monday.com queries (the one write lives in api/post.js) for the pages, made with the signed-in person's own Monday token.
// The queries live server-side (api/_collabs.js), and every result is limited to collabs where that person is the CFS.
import { json, requireMonday, requireSession, errorResponse, AppError } from "./_lib.js";
import { activeItems, kpiItems, updatesFor, updatesMap } from "./_collabs.js";

export async function POST(request) {
  try {
    const session = requireSession(request);
    const user = requireMonday(request, session);
    let body;
    try { body = await request.json(); } catch { body = {}; }

    const fresh = body.fresh === true;
    const me = { id: user.id, name: user.name };

    /* Active collabs and their latest updates in one round trip. `have` maps item id → updated_at the
       browser already holds updates for; only items that changed since then are re-read. */
    if (body.op === "digest") {
      const items = await activeItems(user, { fresh });
      const have = body.have && typeof body.have === "object" ? body.have : {};
      const need = items.filter((it) => have[String(it.id)] !== it.updated_at).map((it) => String(it.id));
      return json({ me, items, updates: need.length ? await updatesMap(need, user) : {}, fetched: need });
    }

    if (body.op === "list") return json({ me, items: await activeItems(user, { fresh }) });
    if (body.op === "kpi") return json({ me, items: await kpiItems(user, { fresh }) });

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
