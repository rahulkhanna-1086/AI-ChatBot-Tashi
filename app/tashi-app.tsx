"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type User = { id: string; name: string; email?: string; initials: string; color: string };
type Member = User & { online: boolean };
type Room = { id: string; name: string; description: string; icon: string; messageCount: number };
type Reaction = { emoji: string; count: number; active?: boolean };
type Message = { id: string; roomId: string; authorId: string | null; author: string; initials: string; color: string; body: string; ai?: boolean; createdAt: string; reactions: Reaction[]; replyTo?: { id: string; author: string; text: string } };

type WorkspacePayload = { user: User; rooms: Room[]; members: Member[]; error?: string };
type Props = { initialUser: { id: string; name: string; email: string } };

function renderBody(body: string) {
  const lines = body.split("\n");
  return lines.map((line, index) => {
    const parts = line.split(/(\*\*[^*]+\*\*|@Tashi)/gi);
    return <span key={index}>{parts.map((part, i) => part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part.toLowerCase() === "@tashi" ? <mark key={i}>{part}</mark> : part)}{index < lines.length - 1 && <br />}</span>;
  });
}

function formatTime(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TashiApp({ initialUser }: Props) {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [activeRoom, setActiveRoom] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState<Message | null>(null);
  const [thinking, setThinking] = useState(false);
  const [askMode, setAskMode] = useState(false);
  const [dark, setDark] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await response.json() as WorkspacePayload;
      if (!response.ok) throw new Error(payload.error ?? "Could not load workspace");
      setWorkspace(payload);
      setActiveRoom(current => current || payload.rooms[0]?.id || "");
      setConnected(true);
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not connect to Tashi");
    }
  }, []);

  const loadMessages = useCallback(async (roomId: string, silent = false) => {
    if (!roomId) return;
    try {
      const response = await fetch(`/api/messages?roomId=${encodeURIComponent(roomId)}&_=${Date.now()}`, { cache: "no-store", headers: { "cache-control": "no-cache" } });
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load messages");
      if (activeRoomRef.current === roomId) setMessages(payload.messages ?? []);
      setConnected(true);
      if (!silent) setError("");
    } catch (cause) {
      setConnected(false);
      if (!silent) setError(cause instanceof Error ? cause.message : "Could not load messages");
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { setMessages([]); void loadMessages(activeRoom); }, [activeRoom, loadMessages]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden && activeRoomRef.current) void loadMessages(activeRoomRef.current, true); }, 2000);
    const presenceTimer = window.setInterval(() => { if (!document.hidden) void loadWorkspace(); }, 15000);
    return () => { window.clearInterval(timer); window.clearInterval(presenceTimer); };
  }, [loadMessages, loadWorkspace]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, thinking]);

  const rooms = workspace?.rooms ?? [];
  const members = workspace?.members ?? [];
  const currentUser = workspace?.user ?? { id: initialUser.id, name: initialUser.name, email: initialUser.email, initials: initialUser.name.slice(0, 2).toUpperCase(), color: "blue" };
  const currentRoom = rooms.find(room => room.id === activeRoom) ?? rooms[0];
  const onlineCount = members.filter(member => member.online).length;
  const history = useMemo(() => messages.slice(-12).map(({ author, body, ai }) => ({ author, body, ai })), [messages]);

  async function react(messageId: string, emoji: string) {
    setMessages(items => items.map(message => message.id === messageId ? { ...message, reactions: toggleReaction(message.reactions, emoji) } : message));
    try {
      const response = await fetch("/api/reactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId, emoji }) });
      if (!response.ok) throw new Error("Reaction failed");
      await loadMessages(activeRoom, true);
    } catch { setError("That reaction could not be saved."); await loadMessages(activeRoom, true); }
  }

  async function askTashi(prompt: string, room: Room) {
    setThinking(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, room: room.name, roomId: room.id, history }) });
      const payload = await response.json() as { storedMessage?: Message; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Tashi request failed");
      if (payload.storedMessage) setMessages(items => [...items.filter(item => item.id !== payload.storedMessage?.id), payload.storedMessage as Message]);
      window.setTimeout(() => { void loadMessages(room.id, true); }, 1500);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tashi is temporarily unavailable"); }
    finally { setThinking(false); }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || thinking || !currentRoom) return;
    const shouldAskTashi = askMode || /(@tashi|ask tashi)/i.test(body);
    const replyToId = replying?.id;
    setDraft(""); setReplying(null); setAskMode(false); setError("");
    try {
      const response = await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: currentRoom.id, message: body, replyToId }) });
      const payload = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error ?? "Message could not be sent");
      setMessages(items => [...items.filter(item => item.id !== payload.message?.id), payload.message as Message]);
      if (shouldAskTashi) await askTashi(body.replace(/@tashi/ig, "").trim(), currentRoom);
    } catch (cause) { setDraft(body); setError(cause instanceof Error ? cause.message : "Message could not be sent"); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json() as { room?: Room; error?: string };
      if (!response.ok || !payload.room) throw new Error(payload.error ?? "Room could not be created");
      setWorkspace(current => current ? { ...current, rooms: [...current.rooms, payload.room as Room] } : current);
      setActiveRoom(payload.room.id); setNewRoomOpen(false); setMobileNav(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Room could not be created"); }
  }

  if (!workspace) return <main className="loading-screen"><div className="brand-mark large">T</div><h1>Opening your shared workspace</h1><p>{error || "Connecting rooms, people and conversation history…"}</p><button onClick={() => void loadWorkspace()}>Try again</button></main>;

  return (
    <main className={dark ? "app dark" : "app"}>
      <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open rooms">☰</button>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark">T</div><div><h1>Tashi</h1><p>Think together</p></div><button className="close-mobile" onClick={() => setMobileNav(false)}>×</button></div>
        <nav className="rooms" aria-label="Rooms"><div className="section-label"><span>Shared rooms</span><button onClick={() => setNewRoomOpen(true)} aria-label="Create room">＋</button></div>
          {rooms.map(room => <button key={room.id} className={room.id === activeRoom ? "room active" : "room"} onClick={() => { setActiveRoom(room.id); setMobileNav(false); }}><span className="room-icon">{room.icon}</span><span>{room.name}</span>{room.messageCount > 0 && <small>{room.messageCount}</small>}</button>)}
        </nav>
        <div className="sidebar-card"><div className="spark">✦</div><div><strong>Tashi is connected</strong><p>Mention @Tashi. Every reply is shared and remembered.</p></div></div>
        <div className="profile"><div className={`avatar ${currentUser.color}`}>{currentUser.initials}<span className="presence" /></div><div><strong>{currentUser.name}</strong><span>{connected ? "Live" : "Reconnecting…"}</span></div><button onClick={() => setDark(value => !value)} aria-label="Toggle theme">{dark ? "☀" : "◐"}</button></div>
      </aside>

      <section className="chat">
        <header className="chat-header"><div><div className="title-row"><span>{currentRoom?.icon ?? "#"}</span><h2>{currentRoom?.name ?? "Workspace"}</h2><i className={connected ? "connection live" : "connection"} /></div><p>{currentRoom?.description ?? "A shared space for clear thinking."}</p></div><div className="header-actions"><div className="faces">{members.slice(0, 3).map(member => <span key={member.id} className={`mini-avatar ${member.color}`}>{member.initials}</span>)}</div><button onClick={() => setMembersOpen(value => !value)}>{onlineCount} online</button><button className="icon-button" aria-label="Refresh messages" onClick={() => void loadMessages(activeRoom)}>↻</button></div></header>
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        <div className="conversation"><div className="day-divider"><span>Shared history</span></div>
          {messages.length === 0 && <div className="empty"><div className="brand-mark large">T</div><h3>Start something thoughtful</h3><p>Everyone invited to Tashi will see and can join this conversation.</p></div>}
          {messages.map(message => <article key={message.id} className={message.ai ? "message ai-message" : "message"}>
            <div className={`avatar ${message.color}`}>{message.initials}{message.ai && <span className="ai-dot">✦</span>}</div>
            <div className="message-content">{message.replyTo && <div className="reply-line"><strong>{message.replyTo.author}</strong> {message.replyTo.text}</div>}<div className="message-meta"><strong>{message.author}{message.authorId === currentUser.id ? " (you)" : ""}</strong>{message.ai && <span className="ai-label">AI teammate</span>}<time>{formatTime(message.createdAt)}</time></div><div className="message-body">{renderBody(message.body)}</div><div className="reactions">{message.reactions.map(reaction => <button key={reaction.emoji} className={reaction.active ? "active" : ""} onClick={() => void react(message.id, reaction.emoji)}>{reaction.emoji} <span>{reaction.count}</span></button>)}<button onClick={() => void react(message.id, "👍")}>＋</button></div></div>
            <div className="message-actions"><button onClick={() => setReplying(message)}>↩</button><button onClick={() => navigator.clipboard?.writeText(message.body)}>⧉</button></div>
          </article>)}
          {thinking && <article className="message ai-message"><div className="avatar tashi">T<span className="ai-dot">✦</span></div><div className="message-content"><div className="message-meta"><strong>Tashi</strong><span className="ai-label">thinking</span></div><div className="typing"><i /><i /><i /></div></div></article>}<div ref={bottomRef} />
        </div>
        <footer className="composer-wrap">{replying && <div className="replying"><span>Replying to <strong>{replying.author}</strong></span><button onClick={() => setReplying(null)}>×</button></div>}<form className={askMode ? "composer ask-mode" : "composer"} onSubmit={sendMessage}><button type="button" className="add-button" aria-label="Add attachment">＋</button><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={askMode ? "Ask Tashi anything…" : `Message #${currentRoom?.name.toLowerCase().replaceAll(" ", "-") ?? "room"}`} rows={1} /><button type="button" aria-pressed={askMode} className={askMode ? "ask-button active" : "ask-button"} onClick={() => setAskMode(value => !value)}>✦ {askMode ? "Asking Tashi" : "Ask Tashi"}</button><button type="submit" className="send-button" disabled={!draft.trim() || thinking}>↑</button></form><p className="hint">{connected ? "Messages are saved and shared live" : "Connection interrupted — Tashi will retry automatically"}</p></footer>
      </section>

      {membersOpen && <aside className="members-panel"><div className="panel-head"><h3>Workspace members</h3><button onClick={() => setMembersOpen(false)}>×</button></div>{members.map(member => <div className="member" key={member.id}><div className={`avatar ${member.color}`}>{member.initials}<span className={member.online ? "presence" : "presence away"} /></div><div><strong>{member.name}</strong><span>{member.online ? "Online now" : "Offline"}</span></div></div>)}</aside>}
      {newRoomOpen && <div className="modal-backdrop" onMouseDown={() => setNewRoomOpen(false)}><form className="modal" onSubmit={createRoom} onMouseDown={event => event.stopPropagation()}><div className="spark">#</div><h3>Create a shared room</h3><p>Everyone with access to Tashi can join and see its history.</p><label>Room name<input name="name" autoFocus maxLength={40} placeholder="e.g. Customer insights" /></label><div className="modal-actions"><button type="button" onClick={() => setNewRoomOpen(false)}>Cancel</button><button type="submit">Create room</button></div></form></div>}
    </main>
  );
}

function toggleReaction(reactions: Reaction[], emoji: string) {
  const next = [...reactions];
  const index = next.findIndex(reaction => reaction.emoji === emoji);
  if (index < 0) return [...next, { emoji, count: 1, active: true }];
  const current = next[index];
  next[index] = { ...current, active: !current.active, count: Math.max(0, current.count + (current.active ? -1 : 1)) };
  return next.filter(reaction => reaction.count > 0);
}
