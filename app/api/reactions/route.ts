import { env } from "cloudflare:workers";
import { requireApiUser } from "../../../lib/workspace";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as { messageId?: unknown; emoji?: unknown };
  const messageId = typeof body.messageId === "string" ? body.messageId.slice(0, 100) : "";
  const emoji = typeof body.emoji === "string" ? body.emoji.slice(0, 16) : "";
  if (!messageId || !emoji) return Response.json({ error: "Message and reaction are required" }, { status: 400 });
  const existing = await env.DB.prepare("SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
    .bind(messageId, user.id, emoji).first();
  if (existing) await env.DB.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?").bind(messageId, user.id, emoji).run();
  else await env.DB.prepare("INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").bind(messageId, user.id, emoji).run();
  return Response.json({ active: !existing });
}
