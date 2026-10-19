// "Send me a test briefing": sends the signed-in person's briefing to their own Slack right now.
import { json, requireSession, errorResponse } from "../_lib.js";
import { sendBriefing } from "../_briefing.js";

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
    return json({ ok: true, ...(await sendBriefing(session.email)) });
  } catch (e) {
    if (COPY[e.code]) return json({ error: { code: e.code, message: COPY[e.code] } }, 400);
    return errorResponse(e);
  }
}
