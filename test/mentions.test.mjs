import test from "node:test";
import assert from "node:assert/strict";
import { ME, ITEMS, upd, NOW } from "./fixtures.mjs";

// The server reads Monday in short steps; answer fetch with canned responses and record the queries.
const calls = [];
let ownMode = "ok", feedMode = "from";   // feed: "from" supports from_date, "nofrom" rejects it, "broken" fails
globalThis.fetch = async (url, init) => {
  const { query, variables } = JSON.parse(init.body);
  calls.push(query);
  const ok = (data) => new Response(JSON.stringify({ data }), { status: 200 });
  const err = (m) => new Response(JSON.stringify({ errors: [{ message: m }] }), { status: 200 });
  if (/items_page\(limit:500, query_params/.test(query)) return ok({ boards: [{ items_page: { cursor: null, items: [
    { id: "1", updated_at: new Date(NOW - 5e6).toISOString() }, { id: "2", updated_at: new Date(NOW).toISOString() }, { id: "3", updated_at: new Date(NOW - 9e6).toISOString() }] } }] });
  if (/items\(ids:\$ids, limit:10\)/.test(query)) {
    if (ownMode === "broken") return err('Field "body" doesn\'t exist on type "Update"');
    return ok({ items: [{ id: "1", updates: [upd(101, 30, ["111", "Kaycee Inza-Cruz"], "can you send it today?", true)] }, { id: "2", updates: [] }] });
  }
  if (/updates\(limit:100/.test(query)) {
    if (feedMode === "broken") return err("boom");
    if (feedMode === "nofrom" && /from_date/.test(query)) return err('Unknown argument "from_date" on field "updates"');
    return ok({ updates: variables.page === 1 ? [{ ...upd(201, 20, ["222", "Olimpio Brunetto"], "Please confirm", true), item_id: "2" }, { ...upd(901, 2, ["222", "Olimpio Brunetto"], "no tag here"), item_id: "9" }] : [] });
  }
  if (/items\(ids:\$ids, limit:100\)/.test(query)) return ok({ items: ITEMS.filter((i) => variables.ids.includes(i.id)) });
  throw new Error("unexpected query " + query.slice(0, 60));
};
process.env.SESSION_SECRET = "x";
const { planOwn, ownChunk, feedPage, itemsFor, OWN_ITEMS } = await import("../api/_mentions.js");
const user = { id: ME.id, name: ME.name, token: "t" };

test("plan lists your active collabs, most recently touched first", async () => {
  assert.deepEqual(Array.from(await planOwn(user, { fresh: true })), ["2", "1", "3"]);
  assert.ok(OWN_ITEMS >= 100);
});

test("an own-collabs chunk returns flat posts; only tags carry their text", async () => {
  ownMode = "ok";
  const posts = await ownChunk(user, ["1", "2"]);
  assert.deepEqual(posts.map((p) => [p.id, p.itemId, p.tagsMe, p.text.length > 0]), [["101", "1", true, true]]);
});

test("one feed page: keeps untagged posts without their text and uses from_date a day early", async () => {
  feedMode = "from"; calls.length = 0;
  const r = await feedPage(user, NOW - 3 * 864e5, 1);
  assert.deepEqual(r.posts.map((p) => [p.id, p.itemId, p.tagsMe, p.text === ""]), [["201", "2", true, false], ["901", "9", false, true]]);
  assert.equal(r.more, false);
  assert.equal(r.useFrom, true);
  assert.ok(calls.some((q) => /from_date:"2026-10-30"/.test(q)));
});

test("the feed falls back to no date argument when Monday rejects it, and says so", async () => {
  feedMode = "nofrom"; calls.length = 0;
  const r = await feedPage(user, NOW - 2 * 864e5, 1);
  assert.equal(r.useFrom, false);
  assert.ok(r.posts.some((p) => p.id === "201"));
  assert.ok(calls.some((q) => /updates\(limit:100/.test(q) && !/from_date/.test(q)));
});

test("Monday's error text reaches the caller, so the page can show it", async () => {
  ownMode = "broken"; feedMode = "broken";
  await assert.rejects(ownChunk(user, ["1"]), (e) => e.code === "tool_error" && /body/.test(e.message));
  await assert.rejects(feedPage(user, NOW - 864e5, 1), (e) => e.code === "tool_error" && /boom/.test(e.message));
  ownMode = "ok"; feedMode = "from";
});

test("collab details come back for any board", async () => {
  const items = await itemsFor(user, ["1", "5"]);
  assert.deepEqual(items.map((i) => i.id).sort(), ["1", "5"]);
});
