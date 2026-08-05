"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Room = { id: string; name: string; icon: string; unread?: number };
type Reaction = { emoji: string; count: number; active?: boolean };
type Message = {
  id: string;
  roomId: string;
  author: string;
  initials: string;
  color: string;
  time: string;
  body: string;
  ai?: boolean;
  reactions?: Reaction[];
  replyTo?: { author: string; text: string };
};

const rooms: Room[] = [
  { id: "general", name: "General", icon: "#", unread: 3 },
  { id: "product", name: "Product ideas", icon: "✦" },
  { id: "build", name: "Build together", icon: "⌘" },
  { id: "random", name: "Good things", icon: "☀" },
];

const seedMessages: Message[] = [
  { id: "1", roomId: "general", author: "Maya", initials: "MK", color: "coral", time: "09:41", body: "Morning team! I pulled the customer notes into one place. There’s a really clear theme around making the first five minutes feel effortless.", reactions: [{ emoji: "✨", count: 4 }, { emoji: "🙌", count: 2 }] },
  { id: "2", roomId: "general", author: "You", initials: "RK", color: "blue", time: "09:44", body: "That’s exactly the feeling we should protect. @Tashi can you turn that into three principles we can design around?" },
  { id: "3", roomId: "general", author: "Tashi", initials: "T", color: "tashi", time: "09:44", ai: true, body: "Absolutely. I’d anchor the experience around:\n\n**1. Start with momentum** — give people one obvious, useful action immediately.\n\n**2. Reveal depth gradually** — keep advanced power available without making the first screen feel heavy.\n\n**3. Make progress visible** — every action should create a small, reassuring sense of movement.", reactions: [{ emoji: "💡", count: 5 }, { emoji: "❤️", count: 3 }] },
  { id: "4", roomId: "general", author: "Daniel", initials: "DO", color: "green", time: "09:48", body: "The second principle is the one. Powerful without feeling complicated.", replyTo: { author: "Tashi", text: "Reveal depth gradually…" } },
  { id: "5", roomId: "product", author: "Maya", initials: "MK", color: "coral", time: "Yesterday", body: "What if every new room began with a tiny shared intention?" },
  { id: "6", roomId: "build", author: "Tashi", initials: "T", color: "tashi", time: "Yesterday", ai: true, body: "The provider boundary is ready. Tashi can switch models without changing the conversation logic." },
];

function renderBody(body: string) {
  return body.split("\n").map((line, index) => {
    const parts = line.split(/(\*\*[^*]+\*\*|@Tashi)/g);
    return <span key={index}>{parts.map((part, i) => part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part === "@Tashi" ? <mark key={i}>@Tashi</mark> : part)}{index < body.split("\n").length - 1 && <br />}</span>;
  });
}

export function TashiApp() {
  const [activeRoom, setActiveRoom] = useState("general");
  const [messages, setMessages] = useState(seedMessages);
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState<Message | null>(null);
  const [thinking, setThinking] = useState(false);
  const [dark, setDark] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [allRooms, setAllRooms] = useState(rooms);
  const bottomRef = useRef<HTMLDivElement>(null);

  const currentRoom = allRooms.find(room => room.id === activeRoom) ?? allRooms[0];
  const visibleMessages = useMemo(() => messages.filter(message => message.roomId === activeRoom), [messages, activeRoom]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [visibleMessages.length, thinking]);

  function react(messageId: string, emoji: string) {
    setMessages(items => items.map(message => {
      if (message.id !== messageId) return message;
      const reactions = [...(message.reactions ?? [])];
      const index = reactions.findIndex(reaction => reaction.emoji === emoji);
      if (index >= 0) reactions[index] = { ...reactions[index], count: reactions[index].active ? reactions[index].count - 1 : reactions[index].count + 1, active: !reactions[index].active };
      else reactions.push({ emoji, count: 1, active: true });
      return { ...message, reactions };
    }));
  }

  async function askTashi(prompt: string) {
    setThinking(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, room: currentRoom.name, history: visibleMessages.slice(-8).map(({ author, body, ai }) => ({ author, body, ai })) }) });
      const payload = await response.json() as { message?: string };
      setMessages(items => [...items, { id: crypto.randomUUID(), roomId: activeRoom, author: "Tashi", initials: "T", color: "tashi", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), ai: true, body: payload.message ?? "I’m here. Let’s think it through together." }]);
    } catch {
      setMessages(items => [...items, { id: crypto.randomUUID(), roomId: activeRoom, author: "Tashi", initials: "T", color: "tashi", time: "now", ai: true, body: "I couldn’t reach my thinking service just now. Your message is safe—please try once more in a moment." }]);
    } finally { setThinking(false); }
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || thinking) return;
    const message: Message = { id: crypto.randomUUID(), roomId: activeRoom, author: "You", initials: "RK", color: "blue", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), body, replyTo: replying ? { author: replying.author, text: replying.body.slice(0, 72) } : undefined };
    setMessages(items => [...items, message]);
    setDraft(""); setReplying(null);
    if (/(@tashi|ask tashi)/i.test(body)) void askTashi(body.replace(/@tashi/ig, "").trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); }
  }

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const room = { id: crypto.randomUUID(), name, icon: "#" };
    setAllRooms(items => [...items, room]); setActiveRoom(room.id); setNewRoomOpen(false); setMobileNav(false);
  }

  return (
    <main className={dark ? "app dark" : "app"}>
      <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open rooms">☰</button>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark">T</div><div><h1>Tashi</h1><p>Think together</p></div><button className="close-mobile" onClick={() => setMobileNav(false)}>×</button></div>
        <nav className="rooms" aria-label="Rooms">
          <div className="section-label"><span>Rooms</span><button onClick={() => setNewRoomOpen(true)} aria-label="Create room">＋</button></div>
          {allRooms.map(room => <button key={room.id} className={room.id === activeRoom ? "room active" : "room"} onClick={() => { setActiveRoom(room.id); setMobileNav(false); }}><span className="room-icon">{room.icon}</span><span>{room.name}</span>{room.unread && room.id !== activeRoom ? <b>{room.unread}</b> : null}</button>)}
        </nav>
        <div className="sidebar-card"><div className="spark">✦</div><div><strong>Tashi is here</strong><p>Mention @Tashi in any conversation.</p></div></div>
        <div className="profile"><div className="avatar blue">RK<span className="presence" /></div><div><strong>Ryk</strong><span>Available</span></div><button onClick={() => setDark(value => !value)} aria-label="Toggle theme">{dark ? "☀" : "◐"}</button></div>
      </aside>

      <section className="chat">
        <header className="chat-header"><div><div className="title-row"><span>{currentRoom.icon}</span><h2>{currentRoom.name}</h2></div><p>A space for clear thinking and kind collaboration.</p></div><div className="header-actions"><div className="faces"><span className="mini-avatar coral">MK</span><span className="mini-avatar green">DO</span><span className="mini-avatar tashi">T</span></div><button onClick={() => setMembersOpen(value => !value)}>4 people</button><button className="icon-button" aria-label="Search">⌕</button></div></header>

        <div className="conversation">
          <div className="day-divider"><span>Today</span></div>
          {visibleMessages.length === 0 ? <div className="empty"><div className="brand-mark large">T</div><h3>Start something thoughtful</h3><p>Send the first message, or invite Tashi into the conversation.</p></div> : null}
          {visibleMessages.map(message => <article key={message.id} className={message.ai ? "message ai-message" : "message"}>
            <div className={`avatar ${message.color}`}>{message.initials}{message.ai && <span className="ai-dot">✦</span>}</div>
            <div className="message-content">{message.replyTo && <div className="reply-line"><strong>{message.replyTo.author}</strong> {message.replyTo.text}</div>}<div className="message-meta"><strong>{message.author}</strong>{message.ai && <span className="ai-label">AI teammate</span>}<time>{message.time}</time></div><div className="message-body">{renderBody(message.body)}</div>{message.reactions && <div className="reactions">{message.reactions.map(reaction => <button key={reaction.emoji} className={reaction.active ? "active" : ""} onClick={() => react(message.id, reaction.emoji)}>{reaction.emoji} <span>{reaction.count}</span></button>)}<button onClick={() => react(message.id, "👍")}>＋</button></div>}</div>
            <div className="message-actions"><button onClick={() => setReplying(message)}>↩</button><button onClick={() => navigator.clipboard?.writeText(message.body)}>⧉</button></div>
          </article>)}
          {thinking && <article className="message ai-message"><div className="avatar tashi">T<span className="ai-dot">✦</span></div><div className="message-content"><div className="message-meta"><strong>Tashi</strong><span className="ai-label">thinking</span></div><div className="typing"><i /><i /><i /></div></div></article>}
          <div ref={bottomRef} />
        </div>

        <footer className="composer-wrap">{replying && <div className="replying"><span>Replying to <strong>{replying.author}</strong></span><button onClick={() => setReplying(null)}>×</button></div>}<form className="composer" onSubmit={sendMessage}><button type="button" className="add-button" aria-label="Add attachment">＋</button><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={`Message #${currentRoom.name.toLowerCase().replaceAll(" ", "-")}`} rows={1} /><button type="button" className="ask-button" onClick={() => { setDraft(value => value.includes("@Tashi") ? value : `${value}${value ? " " : ""}@Tashi `); }}>✦ Ask Tashi</button><button type="submit" className="send-button" disabled={!draft.trim()}>↑</button></form><p className="hint"><strong>Enter</strong> to send · <strong>Shift + Enter</strong> for a new line</p></footer>
      </section>

      {membersOpen && <aside className="members-panel"><div className="panel-head"><h3>In this room</h3><button onClick={() => setMembersOpen(false)}>×</button></div>{[["Tashi", "AI teammate", "tashi", "T"], ["Ryk", "Available", "blue", "RK"], ["Maya", "Available", "coral", "MK"], ["Daniel", "In focus", "green", "DO"]].map(member => <div className="member" key={member[0]}><div className={`avatar ${member[2]}`}>{member[3]}</div><div><strong>{member[0]}</strong><span>{member[1]}</span></div></div>)}</aside>}
      {newRoomOpen && <div className="modal-backdrop" onMouseDown={() => setNewRoomOpen(false)}><form className="modal" onSubmit={createRoom} onMouseDown={event => event.stopPropagation()}><div className="spark">#</div><h3>Create a room</h3><p>Give your conversation a clear, welcoming name.</p><label>Room name<input name="name" autoFocus maxLength={40} placeholder="e.g. Customer insights" /></label><div className="modal-actions"><button type="button" onClick={() => setNewRoomOpen(false)}>Cancel</button><button type="submit">Create room</button></div></form></div>}
    </main>
  );
}
