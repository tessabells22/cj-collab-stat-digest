// Read-only Monday.com queries for the pages. The queries live server-side (api/_collabs.js),
// and every result is limited to collabs where the signed-in person is the CFS.
import { json, sessionUser, requireSession, errorResponse, AppError } from "./_lib.js";
import { activeItems, kpiItems, updatesFor, updatesMap } from "./_collabs.js";

export async function POST(request) {
  try {
    const session = requireSession(request);
    const user = await sessionUser(session);
    let body;
    try { body = await request.json(); } catch { body = {}; }

    const fresh = body.fresh === true;
    const me = { id: user.id, name: user.name };

    /* Active collabs and their latest updates in one round trip. `have` maps item id → updated_at the
       browser already holds updates for; only items that changed since then are re-read. */
    if (body.op === "digest") {
      const items = await activeItems(user.id, { fresh });
      const have = body.have && typeof body.have === "object" ? body.have : {};
      const need = items.filter((it) => have[String(it.id)] !== it.updated_at).map((it) => String(it.id));
      return json({ me, items, updates: need.length ? await updatesMap(need, user.id) : {}, fetched: need });
    }

    if (body.op === "list") return json({ me, items: await activeItems(user.id, { fresh }) });
    if (body.op === "kpi") return json({ me, items: await kpiItems(user.id, { fresh }) });

    if (body.op === "updates") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((id) => /^\d{1,20}$/.test(id)) : [];
      if (!ids.length || ids.length > 100) throw new AppError("bad_request", "Send between 1 and 100 item ids.", 400);
      return json({ items: await updatesFor(ids, user.id) });
    }

    throw new AppError("bad_request", "Unknown operation.", 400);
  } catch (e) {
    return errorResponse(e);
  }
}
