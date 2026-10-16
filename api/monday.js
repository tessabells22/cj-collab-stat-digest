// Read-only Monday.com queries for the digest. The queries live here, not in the browser,
// so this route can't be used as a general Monday.com proxy.
import { json, monday, requireToken, errorResponse, whoAmI, MondayError } from "./_lib.js";

const BOARD = process.env.MONDAY_BOARD_ID || "18409265319";
const COL = {
  stage: "color_mm26weve", deadline: "date_mm3rpv64", delays: "formula_mm5exx7", creator: "board_relation_mm57zxnz",
  cfs: "multiple_person_mm2677g0", days: "formula_mm26np49", stageStart: "date_mm26qbn7",
};
const SUB_IDS = ["color_mm26m684", "color_mm265k74", "color_mm266ame", "color_mm26y3mc", "color_mm57fna8", "color_mm26qtzn"];
const COL_IDS = JSON.stringify([...Object.values(COL), ...SUB_IDS]);
const ITEM_FIELDS = `id name url updated_at column_values(ids:${COL_IDS}){ id text ... on BoardRelationValue { display_value } ... on FormulaValue { display_value } }`;
const MAX_PAGES = 6;

const LIST_Q = `query($board:[ID!]){ me{ id name } boards(ids:$board){ items_page(limit:500, query_params:{rules:[
  {column_id:"${COL.cfs}", compare_value:["assigned_to_me"], operator:any_of},
  {column_id:"${COL.stage}", compare_value:[0,14], operator:not_any_of}]}){ cursor items{ ${ITEM_FIELDS} } } } }`;
const NEXT_Q = `query($cursor:String!){ next_items_page(limit:500, cursor:$cursor){ cursor items{ ${ITEM_FIELDS} } } }`;
const UPD_Q = `query($ids:[ID!]){ items(ids:$ids, limit:100){ id updated_at updates(limit:6){ text_body created_at creator{ name } replies{ text_body created_at creator{ name } } } } }`;

export async function POST(request) {
  try {
    const token = requireToken(request);
    let body;
    try { body = await request.json(); } catch { body = {}; }

    if (body.op === "list") {
      const [, data] = await Promise.all([whoAmI(token), monday(token, LIST_Q, { board: [BOARD] })]);
      const page = ((data.boards || [])[0] || {}).items_page || {};
      const items = [...(page.items || [])];
      let cursor = page.cursor;
      for (let i = 1; cursor && i < MAX_PAGES; i++) {
        const next = (await monday(token, NEXT_Q, { cursor })).next_items_page || {};
        items.push(...(next.items || []));
        cursor = next.cursor;
      }
      return json({ me: data.me, items });
    }

    if (body.op === "updates") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((id) => /^\d{1,20}$/.test(id)) : [];
      if (!ids.length || ids.length > 100) throw new MondayError("bad_request", "Send between 1 and 100 item ids.", 400);
      const data = await monday(token, UPD_Q, { ids });
      return json({ items: data.items || [] });
    }

    throw new MondayError("bad_request", "Unknown operation.", 400);
  } catch (e) {
    return errorResponse(e);
  }
}
