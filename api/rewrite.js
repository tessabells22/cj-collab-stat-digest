// "Rewrite with Claude": turns the template draft into a warm message for the creator.
// Only people signed in with a company Google account can call it, so the API key isn't open to the internet.
import Anthropic from "@anthropic-ai/sdk";
import { json, requireSession, errorResponse, aiEnabled } from "./_lib.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const client = aiEnabled() ? new Anthropic() : null;

const SYSTEM =
  "You help a Creative Fulfillment Specialist at a UGC video agency message a creator on Brkaway (the creator platform). " +
  "Write one short, warm, professional message to the creator. Use the creator's first name, a couple of friendly emojis, simple sentences, no em dashes. " +
  "Base it on the status and the latest internal post you're given, but never reveal internal team names, QA notes about colleagues, or anything the creator should not see. " +
  "If the latest post asks for changes from the creator, list them as short bullet points (●). Reply with only the message text.";

const clip = (v, n) => String(v ?? "").slice(0, n);

export async function POST(request) {
  if (!client) return json({ error: { code: "ai_disabled", message: "Claude isn't set up on this deployment." } }, 404);
  try {
    requireSession(request);
    let b;
    try { b = await request.json(); } catch { b = {}; }
    const prompt =
      `Collab: ${clip(b.name, 200)}\nCreator: ${clip(b.creator, 120) || "unknown"}\n` +
      `Stage: ${clip(b.stage, 80)}${b.subStage ? ` (${clip(b.subStage, 80)})` : ""}\n` +
      `Deadline: ${clip(b.deadline, 40) || "none"} ${clip(b.delays, 80)}\n` +
      `Latest internal post (${clip(b.latestAt, 40) || "none"}): ${clip(b.latestText, 1500) || "none"}\n\n` +
      `Current draft:\n${clip(b.draft, 4000)}`;

    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "refusal") {
      return json({ error: { code: "refused", message: "Claude declined this one. The template still works." } }, 422);
    }
    const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    if (!text) return json({ error: { code: "empty", message: "Claude returned nothing. The template still works." } }, 502);
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: { code: "rate_limited", message: "Too many requests. Try again in a minute." } }, 429);
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic API error", e.status, e.message);
      return json({ error: { code: "ai_error", message: "Claude couldn't write this one. The template still works." } }, 502);
    }
    return errorResponse(e);
  }
}
