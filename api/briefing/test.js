// "Send me a test briefing": sends the signed-in person's briefing to their own Slack right now,
// read with the Monday token on this browser. If they're on the list and the token store is set up,
// it also re-saves the token for the 7:30 AM run (covers people added to BRIEFING_EMAILS after connecting).
import { json, requireSession, requireMonday, errorResponse } from "../_lib.js";
import { sendBriefing, recipients } from "../_briefing.js";
import { storeEnabled, saveToken } from "../_store.js";

const COPY = {
  slack_disabled: "The Slack briefing isn't set up yet.",
  slack_users_not_found: "Slack couldn't find an account with your Google email. Check that your Slack profile uses the same address.",
  slack_invalid_auth: "The Slack bot token isn't valid. Ask Tessa to update SLACK_BOT_TOKEN.",
  slack_not_authed: "The Slack bot token isn't valid. Ask Tessa to update SLACK_BOT_TOKEN.",
  slack_missing_scope: "The Slack app is missing a permission (chat:write, users:read, users:read.email).",
};

export async function POST(request) {
  try {
    const session = requireSession(request);
    const m = requireMonday(request, session);
    const out = await sendBriefing(session.email, m);
    if (storeEnabled() && recipients().includes(session.email.toLowerCase())) {
      try { await saveToken({ email: session.email.toLowerCase(), ...m }); } catch (e) { console.error(e.message); }
    }
    return json({ ok: true, ...out });
  } catch (e) {
    if (COPY[e.code]) return json({ error: { code: e.code, message: COPY[e.code] } }, 400);
    return errorResponse(e);
  }
}
