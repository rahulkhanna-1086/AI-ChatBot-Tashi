import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser } from "../app/chatgpt-auth";

const colors = ["blue", "coral", "green", "plum", "amber"] as const;

export async function requireApiUser() {
  const identity = await getChatGPTUser();
  const cookieStore = await cookies();
  let guestId = cookieStore.get("tashi_guest_id")?.value;
  if (!identity && !guestId) {
    guestId = crypto.randomUUID();
    cookieStore.set("tashi_guest_id", guestId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  const userId = identity?.userId ?? `guest:${guestId}`;
  const email = identity?.email ?? "";
  const name = identity
    ? (identity.fullName ?? identity.email.split("@")[0]).trim().slice(0, 80)
    : `Guest ${guestId!.slice(0, 4).toUpperCase()}`;
  const color = colors[Math.abs(hash(userId)) % colors.length];
  await env.DB.prepare(`
    INSERT INTO users (id, username, email, avatar_color, last_seen_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, email = excluded.email,
      avatar_color = excluded.avatar_color, last_seen_at = CURRENT_TIMESTAMP
  `).bind(userId, name, email, color).run();
  return { id: userId, name, email, color };
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  return result;
}
