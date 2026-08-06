import { env } from "cloudflare:workers";
import { initials, requireApiUser } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

const defaults = [
  ["general", "General", "A shared home for the whole team", "#"],
  ["product", "Product ideas", "Shape ideas into useful products", "✦"],
  ["build", "Build together", "Plan, create and solve together", "⌘"],
  ["good-things", "Good things", "Celebrate progress and share energy", "☀"],
] as const;

export async function GET() {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM rooms").first<{ total: number }>();
  if (!count?.total) {
    const statements = defaults.map(([id, name, description]) => env.DB.prepare(
      "INSERT OR IGNORE INTO rooms (id, name, description, created_by) VALUES (?, ?, ?, ?)"
    ).bind(id, name, description, user.id));
    await env.DB.batch(statements);
  }

  const rooms = await env.DB.prepare(`
    SELECT r.id, r.name, r.description,
      CASE r.id WHEN 'general' THEN '#' WHEN 'product' THEN '✦' WHEN 'build' THEN '⌘'
        WHEN 'good-things' THEN '☀' ELSE '#' END AS icon,
      (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.deleted_at IS NULL) AS messageCount
    FROM rooms r ORDER BY r.created_at ASC
  `).all();
  const members = await env.DB.prepare(`
    SELECT id, username AS name, avatar_color AS color,
      CASE WHEN datetime(last_seen_at) >= datetime('now', '-35 seconds') THEN 1 ELSE 0 END AS online
    FROM users ORDER BY online DESC, username ASC LIMIT 50
  `).all<{ id: string; name: string; color: string; online: number }>();

  return Response.json({
    user: { ...user, initials: initials(user.name) },
    rooms: rooms.results,
    members: members.results.map(member => ({ ...member, initials: initials(member.name), online: Boolean(member.online) })),
  }, { headers: { "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json() as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return Response.json({ error: "Room name is required" }, { status: 400 });
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO rooms (id, name, description, created_by) VALUES (?, ?, ?, ?)")
    .bind(id, name, "A shared Tashi room", user.id).run();
  return Response.json({ room: { id, name, description: "A shared Tashi room", icon: "#", messageCount: 0 } }, { status: 201 });
}
