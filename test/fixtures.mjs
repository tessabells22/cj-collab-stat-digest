// Fake Monday data for the Catch up tests and the page preview. "Now" is fixed so results don't drift.
export const NOW = Date.parse("2026-11-03T02:00:00Z");           // Tue 10:00 in Manila
export const ME = { id: "67140875", name: "Tessa Olea" };
const h = (hours) => new Date(NOW - hours * 36e5).toISOString();
const mention = (id, name) => `<a class="user_mention_editor router" href="https://x.monday.com/users/${id}" data-mention-type="User" data-mention-id="${id}">@${name}</a>`;
export const upd = (id, hoursAgo, by, text, tag = false, replies = []) => ({
  id: String(id), body: `<p>${tag ? mention(ME.id, ME.name) + " " : ""}${text}</p>`, text_body: `${tag ? "@" + ME.name + " " : ""}${text}`,
  created_at: h(hoursAgo), creator: { id: by[0], name: by[1] }, replies,
});
const KAY = ["111", "Kaycee Inza-Cruz"], OLI = ["222", "Olimpio Brunetto"], ME_C = [ME.id, ME.name];
const col = (id, text) => ({ id, text });
export const item = (id, name, stage, sub, deadline, extra = {}) => ({
  id: String(id), name, url: `https://x.monday.com/boards/1/pulses/${id}`, state: "active", board: { id: "18409265319", name: "Production" },
  column_values: [col("color_mm26weve", stage), col("color_mm265k74", sub), col("date_mm3rpv64", deadline), col("board_relation_mm57zxnz", extra.creator || "Maya Chen")],
});
// dates relative to NOW (Manila date = 2026-11-03)
export const ITEMS = [
  item(1, "Scrambly_Halloween_UGC_01", "Production", "Video Production", "2026-11-01"),   // 2 days late
  item(2, "Brkaway_Gift_Guide_02", "Production", "Pending", "2026-11-03"),               // due today
  item(3, "Serum_Review_UGC_07", "Post-Production", "Editing", "2026-11-20"),            // far away
  item(4, "Old_Reel_Hair_03", "Approved", "", "2026-10-20"),                              // finished
  { ...item(5, "Random task on another board", "", "", ""), board: { id: "999", name: "Admin" } },
];
export const POSTS = [
  // item 1: late, urgent ask, chased by the same person
  { ...flat(upd(101, 30, KAY, "can you send the revised cut today? client is waiting", true), 1) },
  { ...flat(upd(102, 5, KAY, "following up on this, still need it", true), 1) },
  // item 2: due today, polite request, unanswered
  { ...flat(upd(201, 20, OLI, "Please confirm the shipping address with the creator", true), 2) },
  // item 3: far deadline, FYI, I already replied afterwards
  { ...flat(upd(301, 40, KAY, "thanks!", true), 3) },
  { ...flat(upd(302, 38, ME_C, "np"), 3) },
  // item 4: finished collab, question
  { ...flat(upd(401, 26, OLI, "Any chance you saved the raw files?", true), 4) },
  // item 5: other board, no deadline, someone else replied
  { ...flat(upd(501, 12, KAY, "fyi the invoice template changed", true), 5) },
  { ...flat(upd(502, 3, OLI, "ok noted"), 5) },
  // a post that doesn't tag me
  { ...flat(upd(601, 2, KAY, "unrelated chatter"), 2) },
];
function flat(u, itemId) {
  return { id: u.id, parentId: null, itemId: String(itemId), at: u.created_at, byId: u.creator.id, by: u.creator.name, text: u.text_body, tagsMe: /@Tessa Olea/.test(u.text_body) };
}
export const RAW = { me: ME, since: NOW - 3 * 864e5, now: NOW, posts: POSTS, items: ITEMS, notes: { feedFailed: false } };
