import { getChatGPTUser } from "./chatgpt-auth";
import { TashiApp } from "./tashi-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <TashiApp initialUser={user
    ? { id: user.userId, name: user.fullName ?? user.email.split("@")[0], email: user.email }
    : { id: "", name: "Guest", email: "" }} />;
}
