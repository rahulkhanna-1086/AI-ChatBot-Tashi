import { createProvider, type ChatTurn } from "../../../../lib/ai/provider";
import { env } from "cloudflare:workers";
import { requireApiUser } from "../../../../lib/workspace";

type Payload = { prompt?: unknown; room?: unknown; roomId?: unknown; history?: unknown };

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json() as Payload;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const room = typeof body.room === "string" ? body.room.slice(0, 80) : "Conversation";
    const roomId = typeof body.roomId === "string" ? body.roomId.slice(0, 100) : "";
    if (!prompt || prompt.length > 4000) return Response.json({ error: "A message between 1 and 4,000 characters is required." }, { status: 400 });
    const history: ChatTurn[] = Array.isArray(body.history) ? body.history.slice(-12).flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const turn = item as Record<string, unknown>;
      if (typeof turn.author !== "string" || typeof turn.body !== "string") return [];
      return [{ author: turn.author.slice(0, 60), body: turn.body.slice(0, 4000), ai: turn.ai === true }];
    }) : [];
    const provider = createProvider();
    const message = await provider.generate({ prompt, room, history });
    if (roomId) {
      const roomExists = await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(roomId).first();
      if (!roomExists) return Response.json({ error: "Room not found" }, { status: 404 });
      const id = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO messages (id, room_id, author_id, author_name, body, kind)
        VALUES (?, ?, NULL, 'Tashi', ?, 'ai')
      `).bind(id, roomId, message).run();
      return Response.json({ message, provider: provider.name, storedMessage: {
        id, roomId, authorId: null, author: "Tashi", initials: "T", color: "tashi", body, ai: true,
        createdAt: new Date().toISOString(), reactions: [],
      } });
    }
    return Response.json({ message, provider: provider.name });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown provider error";
    return Response.json({ error: "Tashi is temporarily unavailable.", detail }, { status: 503 });
  }
}
