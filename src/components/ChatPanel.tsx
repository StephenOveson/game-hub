"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatEntry, ClientMessage, EmoteId } from "../shared/protocol";
import { EMOTES, QUICK_EMOTES } from "../shared/protocol";

const TOAST_MS = 4000;

export function ChatPanel({
  chat,
  youId,
  sendMessage,
}: {
  chat: ChatEntry[];
  youId: string;
  sendMessage: (m: ClientMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [readCount, setReadCount] = useState(0);
  const [, setTick] = useState(0); // re-render to expire toasts
  const logRef = useRef<HTMLDivElement>(null);

  const unread = open ? 0 : Math.max(0, chat.length - readCount);

  // mark read + autoscroll while open
  useEffect(() => {
    if (open) {
      setReadCount(chat.length);
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [open, chat.length]);

  // tick to expire toasts while closed
  useEffect(() => {
    if (open) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const sendEmote = (emote: EmoteId) => sendMessage({ type: "emote", emote });

  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage({ type: "chat", text });
    setDraft("");
  };

  const now = Date.now();
  const toasts = open
    ? []
    : chat.filter((e) => now - e.ts < TOAST_MS && e.playerId !== youId).slice(-3);

  return (
    <>
      {/* floating cluster: toasts + quick emotes + toggle */}
      {!open && (
        <div className="chat-cluster">
          <div className="chat-toasts">
            {toasts.map((e) => (
              <div key={e.id} className="chat-toast">
                <b>{e.name}</b>{" "}
                {e.kind === "emote" ? (
                  <>
                    {EMOTES[e.emote!].icon} {EMOTES[e.emote!].label}
                  </>
                ) : (
                  e.text
                )}
              </div>
            ))}
          </div>
          {QUICK_EMOTES.map((id) => (
            <button
              key={id}
              className="chat-fab quick"
              title={EMOTES[id].label}
              onClick={() => sendEmote(id)}
            >
              {EMOTES[id].icon}
            </button>
          ))}
          <button
            className="chat-fab main"
            onClick={() => setOpen(true)}
            aria-label="Open chat"
          >
            💬
            {unread > 0 && <span className="chat-badge">{unread}</span>}
          </button>
        </div>
      )}

      {/* drawer */}
      {open && (
        <div className="chat-drawer">
          <div className="chat-drawer-head">
            <span className="mono">table chat</span>
            <button
              className="btn ghost"
              style={{ padding: "4px 12px" }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="chat-emote-row">
            {(Object.keys(EMOTES) as EmoteId[]).map((id) => (
              <button
                key={id}
                className="chat-emote-btn"
                onClick={() => sendEmote(id)}
              >
                <span style={{ fontSize: 20 }}>{EMOTES[id].icon}</span>
                <span className="mono" style={{ fontSize: 8.5 }}>
                  {EMOTES[id].label}
                </span>
              </button>
            ))}
          </div>
          <div className="chat-log" ref={logRef}>
            {chat.length === 0 && (
              <div
                className="mono"
                style={{ textAlign: "center", padding: "16px 0" }}
              >
                say something…
              </div>
            )}
            {chat.map((e) => (
              <div
                key={e.id}
                className={`chat-line${e.playerId === youId ? " mine" : ""}`}
              >
                <span className="chat-name">{e.name}</span>
                {e.kind === "emote" ? (
                  <span className="chat-emote-msg">
                    {EMOTES[e.emote!].icon} {EMOTES[e.emote!].label}
                  </span>
                ) : (
                  <span>{e.text}</span>
                )}
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="text-input"
              style={{ flex: 1, padding: "10px 12px" }}
              maxLength={200}
              placeholder="Message the table"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendText();
              }}
            />
            <button
              className="btn bid"
              style={{ padding: "10px 16px" }}
              disabled={!draft.trim()}
              onClick={sendText}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
