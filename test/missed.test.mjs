import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { RAW, NOW, ME, upd } from "./fixtures.mjs";
import { tagsUser, flatten } from "../api/_mentions.js";

// public/collabs.js and public/missed.js are classic browser scripts: run them in one context with a fixed clock.
function load() {
  const FixedDate = class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } };
  const ctx = vm.createContext({ Date: FixedDate, Intl, console, window: {}, localStorage: { getItem() { return null; } } });
  const src = ["../public/collabs.js", "../public/missed.js"].map((f) => fs.readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  vm.runInContext(src + "\nthis.buildMissed=buildMissed;this.MISSED_TIERS=MISSED_TIERS;", ctx);
  return ctx;
}

test("tagsUser matches Monday's mention link and plain @Name, but not other people", () => {
  assert.equal(tagsUser({ body: `<a data-mention-type="User" data-mention-id="67140875">@Tessa Olea</a> hi` }, ME), true);
  assert.equal(tagsUser({ body: `<a href="https://x.monday.com/users/67140875">x</a>` }, ME), true);
  assert.equal(tagsUser({ body: "", text_body: "hey @Tessa Olea, can you check" }, ME), true);
  assert.equal(tagsUser({ body: "", text_body: "hey @Tessa Oleander" }, ME), false);
  assert.equal(tagsUser({ body: `<a data-mention-id="671408750">x</a>`, text_body: "" }, ME), false);
  assert.equal(tagsUser({ body: "", text_body: "tessa olea said hi" }, ME), false);
});

test("flatten keeps replies with their parent and the item id", () => {
  const reply = upd(12, 1, ["9", "Sam"], "ok", true);
  const posts = flatten([upd(11, 2, ["8", "Lia"], "top", false, [reply])], 77, ME);
  assert.deepEqual(posts.map((p) => [p.id, p.parentId, p.itemId, p.tagsMe]), [["11", null, "77", false], ["12", "11", "77", true]]);
});

test("sorts by urgency and explains why", () => {
  const { buildMissed } = load();
  const { entries, counts } = buildMissed(RAW, {});
  assert.deepEqual(Array.from(entries, (e) => e.name), ["Scrambly_Halloween_UGC_01", "Brkaway_Gift_Guide_02", "Random task on another board", "Old_Reel_Hair_03", "Serum_Review_UGC_07"]);
  assert.equal(entries[0].name, "Scrambly_Halloween_UGC_01");
  assert.equal(entries[0].tier, "now");
  assert.ok(entries[0].reasons.some((r) => /2 days late/.test(r)));
  assert.ok(entries[0].reasons.some((r) => /Sounds urgent/.test(r)));
  assert.ok(entries[0].reasons.some((r) => /Kaycee followed up/.test(r)));
  assert.equal(entries[1].name, "Brkaway_Gift_Guide_02");
  assert.equal(entries[1].tier, "today");
  assert.ok(entries[1].reasons.includes("Due today"));
  assert.equal(entries.find((e) => e.name === "Serum_Review_UGC_07").tier, "done");
  assert.equal(entries.find((e) => e.name === "Serum_Review_UGC_07").tags[0].resolved, "You replied");
  assert.equal(entries.find((e) => e.name === "Old_Reel_Hair_03").tier, "later");
  assert.ok(entries.find((e) => e.name === "Old_Reel_Hair_03").reasons.includes("Collab already finished"));
  assert.deepEqual({ ...counts }, { now: 1, today: 1, later: 2, done: 1 });
  // scores are strictly ordered within the open entries
  const open = entries.filter((e) => e.tier !== "done").map((e) => e.score);
  assert.deepEqual(Array.from(open), [...open].sort((a, b) => b - a));
});

test("a tag marked done moves to handled; a newer tag on the same collab brings it back", () => {
  const { buildMissed } = load();
  const done = { 201: NOW };
  assert.equal(buildMissed(RAW, done).entries.find((e) => e.name === "Brkaway_Gift_Guide_02").tier, "done");
  const newer = { id: "202", parentId: null, itemId: "2", at: new Date(NOW - 36e5).toISOString(), byId: "222", by: "Olimpio Brunetto", text: "@Tessa Olea any update?", tagsMe: true };
  const e = buildMissed({ ...RAW, posts: [...RAW.posts, newer] }, done).entries.find((x) => x.name === "Brkaway_Gift_Guide_02");
  assert.notEqual(e.tier, "done");
  assert.equal(e.open.length, 1);
});

test("tags older than the window or from me are ignored", () => {
  const { buildMissed } = load();
  const narrow = { ...RAW, since: NOW - 6 * 36e5 };           // last 6 hours: only the follow-up on item 1 and the 3h-old OK
  const names = Array.from(buildMissed(narrow, {}).entries, (e) => e.name);
  assert.deepEqual(names, ["Scrambly_Halloween_UGC_01"]);
  const mine = { ...RAW, posts: RAW.posts.map((p) => (p.id === "101" ? { ...p, byId: ME.id, by: ME.name } : p)) };
  assert.equal(buildMissed(mine, {}).entries.find((e) => e.name === "Scrambly_Halloween_UGC_01").tags.length, 1);
});
