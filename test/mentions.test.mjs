import test from "node:test";
import assert from "node:assert/strict";
import { ME, ITEMS, upd, NOW } from "./fixtures.mjs";

// missedTags talks to Monday through fetch: answer it with canned responses and record the queries.
const calls = [];
let feedMode = "from";   // "from" = supports from_date, "nofrom" = rejects it, "broken" = feed fails
globalThis.fetch = async (url, init) => {
  const { query, variables } = JSON.parse(init.body);
  calls.push(query);
  const ok = (data) => new Response(JSON.stringify({ data }), { status: 200 });
  if (/activeOwn|items_page\(limit:500, query_params/.test(query)) return ok({ boards: [{ items_page: { cursor: null, items: [{ id: "1", updated_at: new Date(NOW).toISOString() }, { id: "2", updated_at: new Date(NOW - 1e6).toISOString() }] } }] });
  if (/items\(ids:\$ids, limit:25\)/.test(query)) return ok({ items: [{ id: "1", updates: [upd(101, 30, ["111", "Kaycee Inza-Cruz"], "can you send it today?", true)] }, { id: "2", updates: [] }] });
  if (/updates\(limit:100/.test(query)) {
    if (feedMode === "broken") return new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 });
    if (feedMode === "nofrom" && /from_date/.test(query)) return new Response(JSON.stringify({ errors: [{ message: 'Unknown argument "from_date" on field "updates"' }] }), { status: 200 });
    return ok({ updates: variables.page === 1 ? [{ ...upd(201, 20, ["222", "Olimpio Brunetto"], "Please confirm", true), item_id: "2" }, { ...upd(901, 2, ["222", "Olimpio Brunetto"], "no tag here"), item_id: "9" }] : [] });
  }
  if (/items\(ids:\$ids, limit:100\)/.test(query)) return ok({ items: ITEMS.filter((i) => variables.ids.includes(i.id)) });
  throw new Error("unexpected query " + query.slice(0, 60));
};
process.env.SESSION_SECRET = "x";
const { missedTags } = await import("../api/_mentions.js");
const user = { id: ME.id, name: ME.name, token: "t" };

test("combines tags on your own collabs with the account-wide feed", async () => {
  feedMode = "from"; calls.length = 0;
  const r = await missedTags({ ...user, id: ME.id }, NOW - 3 * 864e5, { fresh: true });
  assert.deepEqual(r.posts.map((p) => p.id).sort(), ["101", "201"]);       // the untagged post on item 9 is dropped
  assert.deepEqual(r.items.map((i) => i.id).sort(), ["1", "2"]);
  assert.equal(r.notes.feedFailed, false);
  assert.ok(calls.some((q) => /from_date:"2026-10-30"/.test(q)), "uses from_date a day early so the Manila boundary is covered");
});

test("falls back to paging without from_date when Monday rejects it", async () => {
  feedMode = "nofrom"; calls.length = 0;
  const r = await missedTags(user, NOW - 2 * 864e5, { fresh: true });
  assert.ok(r.posts.some((p) => p.id === "201"));
  assert.ok(calls.some((q) => /updates\(limit:100/.test(q) && !/from_date/.test(q)));
});

test("a failing feed still returns your own collabs, flagged", async () => {
  feedMode = "broken";
  const r = await missedTags(user, NOW - 2 * 864e5, { fresh: true });
  assert.equal(r.notes.feedFailed, true);
  assert.ok(r.posts.some((p) => p.id === "101"));
});
