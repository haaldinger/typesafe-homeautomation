// Optional LLM pairing via a local Ollama server: split compound requests into
// atomic commands, and generate conversational replies. Degrades to simple
// heuristics whenever Ollama is unreachable, so the demo always runs.

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

export interface SplitResult {
  commands: string[];
  usedLlm: boolean;
}
export interface ReplyResult {
  reply: string;
  usedLlm: boolean;
}

/** Whether LLM pairing is configured at all (used for the health endpoint). */
export function llmEnabled(): boolean {
  return (process.env.LLM_PROVIDER ?? "ollama") !== "none";
}

async function chat(system: string, user: string, json: boolean): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      ...(json ? { format: "json" } : {}),
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/** Split a compound request into atomic single-action requests. */
export async function splitRequest(request: string): Promise<SplitResult> {
  if (llmEnabled()) {
    try {
      const content = await chat(
        'You split a smart-home request into atomic commands. Return ONLY JSON of the form {"commands": ["...", "..."]} where each command is one self-contained instruction. Preserve the user\'s wording and any room or device names. Do not add commentary.',
        request,
        true,
      );
      const parsed = JSON.parse(content) as { commands?: unknown };
      if (Array.isArray(parsed.commands)) {
        const cmds = parsed.commands.filter(
          (c): c is string => typeof c === "string" && c.trim().length > 0,
        );
        if (cmds.length > 0) return { commands: cmds, usedLlm: true };
      }
    } catch {
      // fall through to heuristic
    }
  }
  return { commands: heuristicSplit(request), usedLlm: false };
}

/** Naive splitter used when Ollama is unavailable. */
export function heuristicSplit(request: string): string[] {
  const parts = request
    .split(/\b(?:,\s*and\s+|\s+and\s+|,\s+|;\s+|\s+then\s+)\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 2);
  return parts.length > 1 ? parts : [request];
}

const CANNED_REPLY =
  "I'm Aura, your home assistant. I can control your lights, locks, blinds, fans, thermostats, and media — just tell me what you'd like.";

/** Freeform conversational reply for requests the home can't act on. */
export async function conversationalReply(request: string): Promise<ReplyResult> {
  if (llmEnabled()) {
    try {
      const reply = await chat(
        "You are Aura, a friendly smart-home assistant. Answer briefly and warmly in one or two sentences. If asked to do something the home cannot do, say so politely.",
        request,
        false,
      );
      const trimmed = reply.trim();
      if (trimmed) return { reply: trimmed, usedLlm: true };
    } catch {
      // fall through
    }
  }
  return { reply: CANNED_REPLY, usedLlm: false };
}
