// Monday.com reads shared by the API routes and the morning briefing. Every read uses the person's own
// token, passed in as user = {id, token}; id is the Monday user the token belongs to.
import { monday, AppError } from "./_lib.js";

const BOARD = process.env.MONDAY_BOARD_ID || "18409265319";
const COL = {
  stage: "color_mm26weve", deadline: "date_mm3rpv64", delays: "formula_mm5exx7", creator: "board_relation_mm57zxnz",
  cfs: "multiple_person_mm2677g0", days: "formula_mm26np49", stageStart: "date_mm26qbn7", pm: "multiple_person_mm26f5rp",
};
const SUB_IDS = ["color_mm26m684", "color_mm265k74", "color_mm266ame", "color_mm26y3mc", "color_mm57fna8", "color_mm26qtzn"];
const COL_IDS = JSON.stringify([...Object.values(COL), ...SUB_IDS]);
const ITEM_FIELDS = `id name url created_at updated_at column_values(ids:${COL_IDS}){ id text ... on BoardRelationValue { display_value } ... on FormulaValue { display_value } }`;
const MAX_PAGES = 6;

// compare_value is a custom scalar in Monday's schema, so the person id is written into the query
// (it's a numeric Monday user id, checked below) instead of passed as a typed variable.
// Stage label keys: 0 = Canceled, 13 = Approved, 14 = Completed.
const HISTORY_DAYS = 180;
const ruleCfs = (userId) => `{column_id:"${COL.cfs}", compare_value:["person-${userId}"], operator:any_of}`;
const ACTIVE_RULES = (userId) => `${ruleCfs(userId)}, {column_id:"${COL.stage}", compare_value:[0,14], operator:not_any_of}`;
const HISTORY_RULES = (userId, from) => `${ruleCfs(userId)}, {column_id:"${COL.stage}", compare_value:[13,14], operator:any_of}` +
  (from ? `, {column_id:"${COL.stageStart}", compare_value:["${from}","2099-12-31"], operator:between}` : "");
const pageQuery = (rules) => `query($board:[ID!]){ boards(ids:$board){ items_page(limit:500, query_params:{rules:[${rules}]}){ cursor items{ ${ITEM_FIELDS} } } } }`;
const NEXT_Q = `query($cursor:String!){ next_items_page(limit:500, cursor:$cursor){ cursor items{ ${ITEM_FIELDS} } } }`;
const UPD_Q = `query($ids:[ID!]){ items(ids:$ids, limit:100){ id updated_at
  column_values(ids:["${COL.cfs}"]){ ... on PeopleValue { persons_and_teams { id kind } } }
  updates(limit:6){ text_body created_at creator{ name } replies{ text_body created_at creator{ name } } } } }`;

export const isCfs = (item, userId) =>
  (item.column_values || []).some((c) => (c.persons_and_teams || []).some((p) => p.kind === "person" && String(p.id) === String(userId)));

const checkId = (userId) => { if (!/^\d+$/.test(String(userId))) throw new AppError("tool_error", "Monday.com returned an unexpected user id.", 502); };

async function pageAll(rules, token) {
  const data = await monday(pageQuery(rules), { board: [BOARD] }, token);
  const page = ((data.boards || [])[0] || {}).items_page || {};
  const items = [...(page.items || [])];
  let cursor = page.cursor;
  for (let i = 1; cursor && i < MAX_PAGES; i++) {
    const next = (await monday(NEXT_Q, { cursor }, token)).next_items_page || {};
    items.push(...(next.items || []));
    cursor = next.cursor;
  }
  return items;
}

/* Short per-instance cache so moving between pages doesn't re-read Monday each time. Refresh bypasses it. */
const memo = new Map();
const MEMO_MS = 45_000;
async function cached(key, fresh, load) {
  const hit = memo.get(key);
  if (!fresh && hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const value = await load();
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return value;
}

/* Active collabs (everything but Canceled and Completed). */
export function activeItems(user, { fresh = false } = {}) {
  checkId(user.id);
  return cached(`active:${user.id}`, fresh, () => pageAll(ACTIVE_RULES(user.id), user.token));
}

/* Active collabs plus Approved/Completed ones that finished in the last 180 days, for KPIs and Creators.
   If Monday rejects the date filter, fall back to the full history rather than failing the page. */
export function kpiItems(user, { fresh = false } = {}) {
  checkId(user.id);
  return cached(`kpi:${user.id}`, fresh, async () => {
    const from = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString().slice(0, 10);
    const history = pageAll(HISTORY_RULES(user.id, from), user.token).catch((e) => {
      if (e.code !== "tool_error") throw e;
      console.warn("history date filter rejected, reading full history:", e.message);
      return pageAll(HISTORY_RULES(user.id, null), user.token);
    });
    const [active, done] = await Promise.all([activeItems(user, { fresh }), history]);
    const seen = new Set(active.map((it) => String(it.id)));
    return [...active, ...done.filter((it) => !seen.has(String(it.id)))];
  });
}

/* Latest updates for up to 100 items, keeping only items where the user is the CFS. */
export async function updatesFor(ids, user) {
  const data = await monday(UPD_Q, { ids }, user.token);
  return (data.items || []).filter((it) => isCfs(it, user.id)).map(({ column_values, ...it }) => it);
}

/* Updates for many items: batches of 50, up to six at once. Returns {id: updates[]}. */
export async function updatesMap(ids, user) {
  const batches = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const out = {};
  for (let i = 0; i < batches.length; i += 6) {
    const results = await Promise.all(batches.slice(i, i + 6).map((b) => updatesFor(b, user)));
    results.flat().forEach((x) => { out[String(x.id)] = x.updates || []; });
  }
  return out;
}
