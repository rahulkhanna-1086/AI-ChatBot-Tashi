import { createProvider, type ChatTurn } from "../../../../lib/ai/provider";

type Payload = { prompt?: unknown; room?: unknown; history?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as Payload;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const room = typeof body.room === "string" ? body.room.slice(0, 80) : "Conversation";
    if (!prompt || prompt.length > 4000) return Response.json({ error: "A message between 1 and 4,000 characters is required." }, { status: 400 });
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-12).flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const turn = item as Record<string, unknown>;
      if (typeof turn.author !== "string" || typeof turn.body !== "string") return [];
      return [{ author: turn.author.slice(0, 60), body: turn.body.slice(0, 4000), ai: turn.ai === true }];
    }) : [];
    const provider = createProvider();
    const message = await provider.generate({ prompt, room, history });
    return Response.json({ message, provider: provider.name });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown provider error";
    return Response.json({ error: "Tashi is temporarily unavailable.", detail }, { status: 503 });
  }
}
