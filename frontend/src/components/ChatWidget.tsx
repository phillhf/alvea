import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

/* ─── Chat-Widget ────────────────────────────────────── */
interface ChatMsg { id: string; user_id: string; user_name: string; message: string; created_at: string; }

function formatChatTime(raw: string) {
  const d = new Date(raw.replace(" ", "T") + "Z");
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function ChatWidget({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen]         = useState(false);
  const [messages, setMsgs]     = useState<ChatMsg[]>([]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [hasNew, setHasNew]     = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const lastIdRef               = useRef<string | null>(null);
  const openRef                 = useRef(false);
  const initialLoadRef          = useRef(true);

  useEffect(() => { openRef.current = open; }, [open]);

  async function load() {
    try {
      const { data } = await api.get<ChatMsg[]>("/chat");
      setMsgs(data);
      const newestId = data.length > 0 ? data[data.length - 1].id : null;
      if (initialLoadRef.current) {
        // Erster Load: Referenzpunkt setzen, kein Badge
        lastIdRef.current = newestId;
        initialLoadRef.current = false;
      } else if (!openRef.current && newestId && newestId !== lastIdRef.current) {
        // Neue Nachricht eingegangen, Fenster geschlossen
        setHasNew(true);
      }
      if (openRef.current) {
        lastIdRef.current = newestId;
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) {
      setHasNew(false);
      lastIdRef.current = messages.length > 0 ? messages[messages.length - 1].id : null;
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [open, messages]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    try {
      await api.post("/chat", { message: text });
      setInput("");
      await load();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch { /* ignore */ } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* Aufklapp-Button rechts unten */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl relative"
        style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 9999, backgroundColor: "var(--brand-600)" }}
        title="Stations-Chat"
      >
        {open ? "✕" : "💬"}
        {!open && hasNew && (
          <span className="absolute -top-1 -right-1 w-6 h-6 flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 drop-shadow-md">
              <rect x="0" y="0" width="24" height="24" rx="5" fill="#dc2626"/>
              <rect x="10" y="4" width="4" height="16" rx="2" fill="white"/>
              <rect x="4" y="10" width="16" height="4" rx="2" fill="white"/>
            </svg>
          </span>
        )}
      </button>

      {/* Chat-Fenster */}
      {open && (
        <div className="flex flex-col rounded-lg shadow-md overflow-hidden border border-[#E8E8E8]"
          style={{ position: "fixed", bottom: "6rem", right: "1.5rem", zIndex: 9999, width: "24rem", height: "420px", border: "1px solid rgba(0,0,0,0.08)" }}>

          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2 text-white shrink-0"
            style={{ backgroundColor: "var(--brand-600)" }}>
            <span className="text-lg">💬</span>
            <span className="font-semibold text-sm">Stations-Chat</span>
            <span className="ml-auto text-xs opacity-70">alle Stationen</span>
          </div>

          {/* Nachrichten */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-xs pt-8">Noch keine Nachrichten.</div>
            )}
            {messages.map((m, idx) => {
              const isMe = m.user_id === userId;
              const prev = idx > 0 ? messages[idx - 1] : null;
              const sameAuthor = prev?.user_id === m.user_id;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"} ${sameAuthor ? "mt-0.5" : "mt-2"}`}>
                  <div className={`max-w-[80%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!sameAuthor && (
                      <span className={`text-[10px] font-semibold mb-0.5 px-1 ${isMe ? "text-brand-600" : "text-slate-500"}`}>
                        {isMe ? "Du" : m.user_name}
                      </span>
                    )}
                    <div className={`px-3 py-1.5 rounded-xl text-sm break-words whitespace-pre-wrap ${
                      isMe ? "text-white rounded-br-sm" : "bg-white text-slate-800 rounded-bl-sm shadow-sm"
                    }`} style={isMe ? { backgroundColor: "var(--brand-600)" } : {}}>
                      {m.message}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-0.5 px-1">{formatChatTime(m.created_at)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Eingabe */}
          <div className="bg-white border-t border-slate-100 px-3 py-2 flex gap-2 items-center shrink-0">
            <input
              ref={inputRef}
              className="flex-1 text-sm outline-none bg-transparent placeholder-slate-400"
              placeholder="Nachricht…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: "var(--brand-600)" }}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
