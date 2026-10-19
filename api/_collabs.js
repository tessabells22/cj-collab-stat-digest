// Monday.com reads shared by the API routes and the morning briefing.
import { monday, AppError } from "./_lib.js";

const BOARD = process.env.MONDAY_BOARD_ID || "18409265319";
const COL = {
  stage: "color_mm26weve", deadline: "date_mm3rpv64", delays: "formula_mm5exx7", creator: "board_relation_mm57zxnz",
  cfs: "multiple_person_mm2677g0", days: "formula_mm26np49", stageStart: "date_mm26qbn7",
};
const SUB_IDS = ["color_mm26m684", "color_mm265k74", "color_mm266ame", "color_mm26y3mc", "color_mm57fna8", "color_mm26qtzn"];
const COL_IDS = JSON.stringify([...Object.values(COL), ...SUB_IDS]);
const ITEM_FIELDS = `id name url created_at updated_at column_values(ids:${COL_IDS}){ id text ... on BoardRelationValue { display_value } ... on FormulaValue { display_value } }`;
const MAX_PAGES = 6;

// compare_value is a custom scalar in Monday's schema, so the person id is written into the query
// (it's a numeric Monday user id, checked below) instead of passed as a typed variable.
// Stage label keys: 0 = Canceled, 14 = Completed. The digest skips both; the KPI page keeps Completed.
const DIGEST_EXCLUDE = [0, 14];
const KPI_EXCLUDE = [0];
const listQuery = (userId, exclude) => `query($board:[ID!]){ boards(ids:$board){ items_page(limit:500, query_params:{rules:[
  {column_id:"${COL.cfs}", compare_value:["person-${userId}"], operator:any_of},
  {column_id:"${COL.stage}", compare_value:${JSON.stringify(exclude)}, operator:not_any_of}]}){ cursor items{ ${ITEM_FIELDS} } } } }`;
const NEXT_Q = `query($cursor:String!){ next_items_page(limit:500, cursor:$cursor){ cursor items{ ${ITEM_FIELDS} } } }`;
const UPD_Q = `query($ids:[ID!]){ items(ids:$ids, limit:100){ id updated_at
  column_values(ids:["${COL.cfs}"]){ ... on PeopleValue { persons_and_teams { id kind } } }
  updates(limit:6){ text_body created_at creator{ name } replies{ text_body created_at creator{ name } } } } }`;

export const isCfs = (item, userId) =>
  (item.column_values || []).some((c) => (c.persons_and_teams || []).some((p) => p.kind === "person" && String(p.id) === String(userId)));


/* All of a person's collabs as CFS. kind "digest" skips Canceled and Completed; "kpi" keeps Completed. */
export async function listItems(userId, kind = "digest") {
  if (!/^\d+$/.test(String(userId))) throw new AppError("tool_error", "Monday.com returned an unexpected user id.", 502);
  const data = await monday(listQuery(userId, kind === "kpi" ? KPI_EXCLUDE : DIGEST_EXCLUDE), { board: [BOARD] });
  const page = ((data.boards || [])[0] || {}).items_page || {};
  const items = [...(page.items || [])];
  let cursor = page.cursor;
  for (let i = 1; cursor && i < MAX_PAGES; i++) {
    const next = (await monday(NEXT_Q, { cursor })).next_items_page || {};
    items.push(...(next.items || []));
    cursor = next.cursor;
  }
  return items;
}

/* Latest updates for up to 100 items, keeping only items where userId is the CFS. */
export async function updatesFor(ids, userId) {
  const data = await monday(UPD_Q, { ids });
  return (data.items || []).filter((it) => isCfs(it, userId)).map(({ column_values, ...it }) => it);
}
