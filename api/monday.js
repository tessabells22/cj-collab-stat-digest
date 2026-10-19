// Read-only Monday.com queries for the pages. The queries live server-side (api/_collabs.js),
// and every result is limited to collabs where the signed-in person is the CFS.
import { json, mondayUser, requireSession, errorResponse, AppError } from "./_lib.js";
import { listItems, updatesFor } from "./_collabs.js";

export async function POST(request) {
  try {
    const session = requireSession(request);
    const user = await mondayUser(session.email);
    let body;
    try { body = await request.json(); } catch { body = {}; }

    if (body.op === "list" || body.op === "kpi") {
      const items = await listItems(user.id, body.op);
      return json({ me: { id: user.id, name: user.name }, items });
    }

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
