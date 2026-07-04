"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatEntry,
  ClientMessage,
  ServerMessage,
  StateMessage,
} from "../shared/protocol";

type Status = "connecting" | "open" | "closed";

interface Seat {
  playerId: string;
  token: string;
}

function seatKey(code: string) {
  return `liars-dice:seat:${code.toUpperCase()}`;
}

export function loadSeat(code: string): Seat | null {
  try {
    const raw = sessionStorage.getItem(seatKey(code));
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}

function saveSeat(code: string, seat: Seat) {
  try {
    sessionStorage.setItem(seatKey(code), JSON.stringify(seat));
  } catch {
    /* private mode etc — reconnection just won't survive a refresh */
  }
}

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

/**
 * Manages one socket per mounted component. `join` is called automatically
 * on every (re)connect so a dropped connection reclaims its seat.
 */
export function useGameSocket(joinMessage: ClientMessage | null) {
  const [state, setState] = useState<StateMessage | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joinRef = useRef(joinMessage);
  joinRef.current = joinMessage;
  const retryRef = useRef(0);
  const closedByUs = useRef(false);

  useEffect(() => {
    if (!joinMessage) return;
    closedByUs.current = false;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus("open");
        const join = joinRef.current;
        if (!join) return;
        // On reconnect, upgrade a plain join into a seat reclaim
        if (join.type === "join_room") {
          const seat = loadSeat(join.code);
          ws.send(JSON.stringify(seat ? { ...join, ...seat } : join));
        } else {
          ws.send(JSON.stringify(join));
        }
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.type === "state") {
          setState(msg);
        } else if (msg.type === "chat") {
          setChat((prev) => [...prev.slice(-99), msg.entry]);
        } else if (msg.type === "chat_history") {
          // Authoritative on (re)join — replaces any stale local log
          setChat(msg.entries);
        } else if (msg.type === "joined") {
          saveSeat(msg.code, { playerId: msg.playerId, token: msg.token });
          // After creating a room we switch future reconnects to join_room
          if (joinRef.current?.type === "create_room") {
            joinRef.current = {
              type: "join_room",
              code: msg.code,
              name: joinRef.current.name,
            };
          }
        } else if (msg.type === "error") {
          setError(msg.message);
        }
      };

      ws.onclose = () => {
        setStatus("closed");
        if (closedByUs.current) return;
        const delay = Math.min(500 * 2 ** retryRef.current, 8000);
        retryRef.current++;
        setTimeout(() => {
          if (!closedByUs.current) connect();
        }, delay);
      };
    }

    connect();
    return () => {
      closedByUs.current = true;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinMessage === null]); // connect once a join message exists

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { state, chat, status, error, clearError, sendMessage };
}
