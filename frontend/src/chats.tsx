import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, ChevronRight, Clock3, ExternalLink, MessageCircle, Phone, Send, Sparkles, X } from "lucide-react";
import { api } from "./api";
import { useEstate } from "./context";
import { Avatar, Button, Empty, Form, Modal } from "./ui";
import { date, type ChatThread, type NotificationItem } from "./types";
import { tr } from "./localization";

function shortTime(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function NotificationBell({
  items,
  onRead,
  onReadAll,
  onOpenChat,
}: {
  items: NotificationItem[];
  onRead: (item: NotificationItem) => void;
  onReadAll: () => void;
  onOpenChat: (item?: NotificationItem) => void;
}) {
  const [open, setOpen] = useState(false), [peek, setPeek] = useState(false);
  const unread = items.filter((item) => !item.read_at).length;
  useEffect(() => {
    if (unread && !sessionStorage.getItem("beawar-notification-peek")) {
      sessionStorage.setItem("beawar-notification-peek", "1");
      setPeek(true);
    }
  }, [unread]);
  return <div className="notification-wrap">
    <button className="icon-btn notification-trigger" aria-label={tr("Notifications")} title={tr("Notifications")} onClick={() => { setOpen((v) => !v); setPeek(false); }}>
      <Bell size={19} />{unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {peek && unread > 0 && <div className="notification-peek" role="status">
      <button className="notification-close" aria-label={tr("Dismiss notification")} onClick={() => setPeek(false)}><X size={15} /></button>
      <Sparkles size={17} />
      <div><strong>{tr("You have new messages")}</strong><p>{tr("{v0} unread conversations are waiting for you.", { v0: unread })}</p><button onClick={() => { setPeek(false); onOpenChat(); }}>{tr("Open My Chat")}<ChevronRight size={14} /></button></div>
    </div>}
    {open && <div className="notification-popover" role="dialog" aria-label={tr("Notifications")}>
      <div className="notification-head"><div><strong>{tr("Notifications")}</strong><small>{unread ? tr("{v0} unread", { v0: unread }) : tr("All caught up")}</small></div>{unread > 0 && <button onClick={onReadAll}><CheckCheck size={14} />{tr("Mark all read")}</button>}</div>
      <div className="notification-list">
        {items.length ? items.slice(0, 12).map((item) => <button className={`notification-item ${item.read_at ? "read" : "unread"}`} key={item.id} onClick={() => { onRead(item); setOpen(false); onOpenChat(item); }}>
          <span className={`notification-dot ${item.kind}`}><MessageCircle size={14} /></span><span><strong>{tr(item.title)}</strong><p>{item.body}</p><small><Clock3 size={11} />{shortTime(item.created_at)} · {date(item.created_at)}</small></span><ChevronRight size={15} />
        </button>) : <p className="notification-empty">{tr("No notifications yet")}</p>}
      </div>
      {items.length > 0 && <button className="notification-footer" onClick={() => { setOpen(false); onOpenChat(); }}>{tr("View all conversations")}<ChevronRight size={15} /></button>}
    </div>}
  </div>;
}

export function MyChat({ focus }: { focus?: NotificationItem }) {
  const c = useEstate();
  const [threads, setThreads] = useState<ChatThread[]>([]), [selected, setSelected] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = async (quiet = false) => {
    if (!c.user) return;
    try { const r = await api<{ threads: ChatThread[] }>("/chats"); setThreads(r.threads); setError(""); if (!selected && r.threads.length) setSelected(r.threads[0].id); if (focus) { const target = `${focus.entity_type}:${focus.entity_id}`; if (r.threads.some((v) => v.id === target)) setSelected(target); } }
    catch (e) { setError((e as Error).message); }
    finally { if (!quiet) setLoading(false); }
  };
  useEffect(() => { void load(); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 15000); return () => clearInterval(timer); }, [c.user?.id, focus?.id]);
  const current = useMemo(() => threads.find((thread) => thread.id === selected) || null, [threads, selected]);
  useEffect(() => { if (!current || !c.user) return; const [entityType, entityId] = current.id.split(":"); void api("/notifications/read-thread", "POST", { entityType, entityId }).then(() => Promise.all([load(true), c.refresh()])).catch(() => {}); }, [current?.id]);
  if (!c.user) return <Empty icon={<MessageCircle size={28} />} title={tr("Sign in to open My Chat")} description={tr("Property replies and service conversations stay private to your account.")}><Button onClick={c.signIn}>{tr("Sign in")}</Button></Empty>;
  async function send(thread: ChatThread, form: HTMLFormElement) {
    const message = String(new FormData(form).get("message") || "").trim();
    const path = thread.type === "property" ? `/tickets/${thread.entity_id}/messages` : `/bookings/${thread.entity_id}/messages`;
    await api(path, "POST", { message });
    form.reset();
    await load(true);
    await c.refresh();
  }
  async function quickMessage(message: string) { if (current) await api(current.type === "property" ? `/tickets/${current.entity_id}/messages` : `/bookings/${current.entity_id}/messages`, "POST", { message }); await load(true); await c.refresh(); }
  return <section className="chat-workspace">
    <header className="page-header chat-heading"><div><span className="eyebrow">{tr("YOUR CONVERSATIONS")}</span><h1>{tr("My Chat")}</h1><p>{tr("Reply to property requests, service providers and visit messages from one place.")}</p></div><div className="chat-heading-icon"><MessageCircle size={23} /><strong>{threads.filter((v) => v.unread).length}</strong><small>{tr("unread")}</small></div></header>
    {error && <p className="error">{tr(error)}</p>}
    {loading ? <p className="muted">{tr("Loading conversations…")}</p> : !threads.length ? <Empty icon={<MessageCircle size={30} />} title={tr("No conversations yet")} description={tr("Replies to your property requests and service bookings will appear here.")} /> : <div className="chat-layout">
      <aside className="chat-thread-list" aria-label={tr("Conversations")}><div className="chat-list-title"><strong>{tr("Conversations")}</strong><span>{threads.length}</span></div>{threads.map((thread) => <button key={thread.id} className={`chat-thread-row ${current?.id === thread.id ? "active" : ""}`} onClick={() => setSelected(thread.id)}><Avatar name={thread.counterpart} /><span><strong>{thread.title}</strong><small>{thread.counterpart} · {thread.type === "property" ? tr("Property") : tr("Service")}</small><em>{thread.messages[thread.messages.length - 1]?.message || tr("No messages yet")}</em></span>{thread.unread && <b aria-label={tr("Unread")}>●</b>}</button>)}</aside>
      {current && <article className="chat-panel"><header className="chat-panel-head"><div><Avatar name={current.counterpart} /><div><strong>{current.counterpart}</strong><small>{current.title} · {tr(current.status)}</small></div></div><div className="chat-actions">{current.counterpart_mobile && <><a className="icon-btn" href={`tel:${current.counterpart_mobile.replace(/[^+0-9]/g, "")}`} aria-label={tr("Call") } title={tr("Call")}><Phone size={17} /></a><a className="icon-btn" href={`sms:${current.counterpart_mobile.replace(/[^+0-9]/g, "")}`} aria-label={tr("SMS")} title={tr("SMS")}><MessageCircle size={17} /></a></>}{current.property_id && <button className="icon-btn" onClick={() => c.openProperty(current.property_id!)} aria-label={tr("Open property")} title={tr("Open property")}><ExternalLink size={17} /></button>}</div></header>
        <div className="chat-quick-actions"><Button variant="outline" onClick={() => void quickMessage(tr("I would like to schedule a property visit. Please share the available time.") )}><Clock3 size={14} />{tr("Request a visit")}</Button>{current.counterpart_mobile && <a className="btn outline" href={`tel:${current.counterpart_mobile.replace(/[^+0-9]/g, "")}`}><Phone size={14} />{tr("Call")}</a>}</div>
        <div className="chat-messages">{current.messages.map((message) => <div className={`chat-bubble ${message.mine ? "mine" : ""}`} key={message.id}><small>{message.sender} · {shortTime(message.created_at)}</small><p>{message.message}</p></div>)}</div>
        <Form className="chat-compose" onSubmit={(form) => send(current, form)}><textarea name="message" rows={2} maxLength={2000} required placeholder={tr("Write a reply…")} /><Button type="submit"><Send size={15} />{tr("Reply")}</Button></Form>
      </article>}
    </div>}
  </section>;
}
