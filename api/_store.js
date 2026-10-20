// Optional token store for the scheduled Slack briefing. The 7:30 AM run has no browser and so no cookie,
// so it needs each recipient's Monday token saved server-side. Uses Upstash Redis over REST (Vercel
// Marketplace → Upstash sets KV_REST_API_URL and KV_REST_API_TOKEN). Tokens are sealed before they're stored.
import { seal, unseal } from "./_lib.js";

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const auth = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const storeEnabled = () => !!(url() && auth());
const key = (email) => `cd:mt:${String(email).toLowerCase()}`;

async function redis(cmd) {
  const r = await fetch(url(), { method: "POST", headers: { authorization: `Bearer ${auth()}`, "content-type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`token store: ${j.error || r.status}`);
  return j.result;
}

/* {email, token, id, name} */
export const saveToken = (t) => redis(["SET", key(t.email), seal(t)]);
export const dropToken = (email) => redis(["DEL", key(email)]);
export async function loadToken(email) {
  const t = unseal(await redis(["GET", key(email)]));
  return t && t.token && /^\d+$/.test(String(t.id)) ? { id: String(t.id), name: t.name, token: t.token } : null;
}
