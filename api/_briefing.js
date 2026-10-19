// Morning briefing: each person's Needs you / Due today / Late counts and top items, sent as a Slack DM.
// The grouping rules are the browser's own public/collabs.js, run here in a sandbox, so Slack and the
// digest always agree. vercel.json bundles that file with the functions that use this module.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { mondayUser, allowedDomain, AppError } from "./_lib.js";
import { listItems, updatesFor } from "./_collabs.js";

export const slackEnabled = () => !!process.env.SLACK_BOT_TOKEN;
const appUrl = () => (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/$/, "");

let rules;
function loadRules() {
  if (rules) return rules;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = [path.join(process.cwd(), "public", "collabs.js"), path.join(here, "..", "public", "collabs.js")].find((f) => fs.existsSync(f));
  if (!file) throw new AppError("internal", "public/collabs.js wasn't bundled with the function.", 500);
  const src = fs.readFileSync(file, "utf8");
  rules = vm.runInContext(`${src}\n;({ GROUPS, COL, SUB, cv, finishedByColumns, buildRow, dueDate })`, vm.createContext({}));
  return rules;
}

export async function buildBriefing(email) {
  const R = loadRules();
  const user = await mondayUser(email);
  const items = (await listItems(user.id, "digest")).map((it) => ({ ...it, id: String(it.id) }));
  const active = items.filter((it) => { const s = R.cv(it, R.COL.stage); return !R.finishedByColumns(s, R.SUB[s] ? R.cv(it, R.SUB[s]) : ""); });
  const updates = new Map();
  for (let i = 0; i < active.length; i += 50) {
    (await updatesFor(active.slice(i, i + 50).map((x) => x.id), user.id)).forEach((x) => updates.set(String(x.id), x.updates || []));
  }
  const groups = Object.fromEntries(R.GROUPS.map((g) => [g.key, []]));
  active.forEach((it) => { const row = R.buildRow(it, updates.get(it.id), { id: user.id, name: user.name }); if (row) groups[row.group].push(row); });
  /* the three most urgent, in the digest's own order */
  const order = Object.fromEntries(R.GROUPS.map((g, i) => [g.key, i]));
  const due = (it) => { const d = R.dueDate(it.deadline); return d ? d.getTime() : Infinity; };
  const top = [...groups.needsYou, ...groups.dueToday, ...groups.late]
    .sort((a, b) => (order[a.group] - order[b.group]) || (b.mentionsMe - a.mentionsMe) || ((b.daysLate || 0) - (a.daysLate || 0)) || (due(a) - due(b)))
    .slice(0, 3);
  return { user, groups, top, active: Object.values(groups).flat().length };
}

const slackText = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function briefingBlocks(b) {
  const first = String(b.user.name || "").split(" ")[0] || "there";
  const n = (k) => b.groups[k].length;
  const counts = `*${n("needsYou")}* needs you  ·  *${n("dueToday")}* due today  ·  *${n("late")}* late`;
  const meta = `${b.active} active · ${n("waiting")} waiting on client · ${n("stuck")} stuck 5d+ · ${n("changed")} changed in 24h`;
  const url = appUrl();
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `Good morning, ${first}` } },
    { type: "section", text: { type: "mrkdwn", text: counts } },
    { type: "context", elements: [{ type: "mrkdwn", text: meta }] },
  ];
  if (b.top.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Next up*\n" + b.top.map((it) =>
      `• ${it.url ? `<${it.url}|${slackText(it.name)}>` : slackText(it.name)}\n      ${slackText(it.reason || "")}`).join("\n") } });
  } else {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "Nothing needs you, nothing due today and nothing late." } });
  }
  if (url) blocks.push({ type: "actions", elements: [{ type: "button", style: "primary", text: { type: "plain_text", text: "Open my collabs" }, url: `${url}/digest` }] });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Collab Digest · read-only, nothing is changed in Monday.com" }] });
  return { text: `Good morning, ${first}: ${n("needsYou")} needs you, ${n("dueToday")} due today, ${n("late")} late.`, blocks };
}

async function slack(method, { query, body } = {}) {
  const url = new URL(`https://slack.com/api/${method}`);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, ...(body ? { "content-type": "application/json; charset=utf-8" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new AppError(`slack_${j.error || r.status}`, `Slack ${method} failed: ${j.error || r.status}`, 502);
  return j;
}

/* Builds and sends one person's briefing. Returns the counts for logging. */
export async function sendBriefing(email) {
  if (!slackEnabled()) throw new AppError("slack_disabled", "SLACK_BOT_TOKEN isn't set.", 500);
  const domain = allowedDomain();
  if (!domain || !String(email).toLowerCase().endsWith("@" + domain)) throw new AppError("bad_recipient", `${email} isn't a company address.`, 400);
  const b = await buildBriefing(email);
  const { user } = await slack("users.lookupByEmail", { query: { email } });
  await slack("chat.postMessage", { body: { channel: user.id, unfurl_links: false, ...briefingBlocks(b) } });
  return { email, needsYou: b.groups.needsYou.length, dueToday: b.groups.dueToday.length, late: b.groups.late.length };
}

export const recipients = () => (process.env.BRIEFING_EMAILS || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
