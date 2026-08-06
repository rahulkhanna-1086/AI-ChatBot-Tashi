import { requireChatGPTUser } from "./chatgpt-auth";
import { TashiApp } from "./tashi-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <TashiApp initialUser={{ id: user.userId, name: user.fullName ?? user.email.split("@")[0], email: user.email }} />;
}
