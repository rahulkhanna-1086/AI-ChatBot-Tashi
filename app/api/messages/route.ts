import { env } from "cloudflare:workers";
import { initials, requireApiUser } from "../../../lib/workspace";

type MessageRow = { id: string; roomId: string; authorId: string | null; author: string; color: string | null; body: string; kind: "user" | "ai" | "system"; replyToId: string | null; replyAuthor: string | null; replyBody: string | null; createdAt: string };

function shape(row: MessageRow, reactions: Array<{ messageId: string; emoji: string; count: number; active: number }> = []) {
  return {
    id: row.id, roomId: row.roomId, authorId: row.authorId, author: row.author,
    initials: row.kind === "ai" ? "T" : initials(row.author), color: row.kind === "ai" ? "tashi" : (row.color ?? "blue"),
    body: row.body, ai: row.kind === "ai", createdAt: row.createdAt,
    replyTo: row.replyToId ? { id: row.replyToId, author: row.replyAuthor ?? "Message", text: (row.replyBody ?? "").slice(0, 100) } : undefined,
    reactions: reactions.filter(item => item.messageId === row.id).map(item => ({ emoji: item.emoji, count: item.count, active: Boolean(item.active) })),
  };
}

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const roomId = new URL(request.url).searchParams.get("roomId")?.slice(0, 100) ?? "";
  if (!roomId) return Response.json({ error: "roomId is required" }, { status: 400 });
  const rows = await env.DB.prepare(`
    SELECT m.id, m.room_id AS roomId, m.author_id AS authorId, m.author_name AS author,
      u.avatar_color AS color, m.body, m.kind, m.reply_to_id AS replyToId,
      parent.author_name AS replyAuthor, parent.body AS replyBody, m.created_at AS createdAt
    FROM messages m LEFT JOIN users u ON u.id = m.author_id
      LEFT JOIN messages parent ON parent.id = m.reply_to_id
    WHERE m.room_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at ASC LIMIT 200
  `).bind(roomId).all<MessageRow>();
  const reactionRows = await env.DB.prepare(`
    SELECT message_id AS messageId, emoji, COUNT(*) AS count,
      MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS active
    FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE room_id = ?)
    GROUP BY message_id, emoji
  `).bind(user.id, roomId).all<{ messageId: string; emoji: string; count: number; active: number }>();
  return Response.json({ messages: rows.results.map(row => shape(row, reactionRows.results)) });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as { roomId?: unknown; message?: unknown; replyToId?: unknown };
  const roomId = typeof body.roomId === "string" ? body.roomId.slice(0, 100) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
  const replyToId = typeof body.replyToId === "string" ? body.replyToId.slice(0, 100) : null;
  if (!roomId || !message) return Response.json({ error: "Room and message are required" }, { status: 400 });
  const room = await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(roomId).first();
  if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (id, room_id, author_id, author_name, body, kind, reply_to_id)
    VALUES (?, ?, ?, ?, ?, 'user', ?)
  `).bind(id, roomId, user.id, user.name, message, replyToId).run();
  const created = await env.DB.prepare(`
    SELECT m.id, m.room_id AS roomId, m.author_id AS authorId, m.author_name AS author,
      u.avatar_color AS color, m.body, m.kind, m.reply_to_id AS replyToId,
      parent.author_name AS replyAuthor, parent.body AS replyBody, m.created_at AS createdAt
    FROM messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN messages parent ON parent.id = m.reply_to_id WHERE m.id = ?
  `).bind(id).first<MessageRow>();
  return Response.json({ message: created ? shape(created) : null }, { status: 201 });
}
