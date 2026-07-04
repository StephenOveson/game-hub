"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGameSocket } from "../../../hooks/useGameSocket";
import { LiarsGameView } from "../../../components/LiarsGameView";
import { GolfGameView } from "../../../components/GolfGameView";
import type {
  ClientMessage,
  GameType,
  StateMessage,
} from "../../../shared/protocol";

const GAME_LABELS: Record<GameType, string> = {
  liars: "Liar's Dice",
  golf: "Golf",
};

export default function Room({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const search = useSearchParams();
  const name = search.get("name") ?? "Player";

  const joinMessage = useMemo<ClientMessage>(() => {
    if (code === "new") {
      return {
        type: "create_room",
        game: (search.get("game") === "golf" ? "golf" : "liars") as GameType,
        name,
        onesWild: search.get("wild") !== "0",
      };
    }
    return { type: "join_room", code, name };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { state, status, error, clearError, sendMessage } =
    useGameSocket(joinMessage);

  // Once a created room has a real code, put it in the URL for sharing
  useEffect(() => {
    if (code === "new" && state?.code) {
      window.history.replaceState(null, "", `/room/${state.code}?name=${encodeURIComponent(name)}`);
    }
  }, [code, state?.code, name]);

  if (!state) {
    return (
      <main className="shell" style={{ justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="title" style={{ fontSize: 24 }}>
            {status === "connecting" ? "Finding the table…" : "Reconnecting…"}
          </div>
          {error && <ErrorBar message={error} onDismiss={clearError} />}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: "1px solid rgba(233,220,195,0.16)",
          paddingBottom: 8,
        }}
      >
        <div className="title" style={{ fontSize: 21 }}>
          {GAME_LABELS[state.game]}
        </div>
        <div className="mono">
          {state.phase === "lobby"
            ? "table"
            : state.game === "liars"
              ? `round ${state.round}`
              : `hole ${state.hole} / 9`}{" "}
          · {state.code}
        </div>
      </header>

      {state.phase === "lobby" ? (
        <LobbyView
          state={state}
          onStart={() => sendMessage({ type: "start_game" })}
        />
      ) : state.game === "liars" ? (
        <LiarsGameView state={state} sendMessage={sendMessage} />
      ) : (
        <GolfGameView state={state} sendMessage={sendMessage} />
      )}

      {error && <ErrorBar message={error} onDismiss={clearError} />}
      {status !== "open" && (
        <div className="mono" style={{ textAlign: "center" }}>
          connection lost — retrying…
        </div>
      )}
    </main>
  );
}

function LobbyView({
  state,
  onStart,
}: {
  state: StateMessage;
  onStart: () => void;
}) {
  const isHost = state.you.id === state.hostId;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${state.code}`
      : "";
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="panel"
      style={{
        display: "grid",
        gap: 12,
        marginTop: "auto",
        marginBottom: "auto",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div className="mono">room code</div>
        <div className="title" style={{ fontSize: 42, letterSpacing: "0.15em" }}>
          {state.code}
        </div>
        <div style={{ fontSize: 13, color: "var(--parchment-dim)" }}>
          {GAME_LABELS[state.game]} · friends join from the home page with
          this code
          {state.game === "liars" && state.onesWild ? " · ones are wild" : ""}
        </div>
      </div>
      <div className="strip" style={{ justifyContent: "center" }}>
        {state.players.map((p) => (
          <div key={p.id} className="seat-chip">
            <div className="seat-name">
              {p.name}
              {p.id === state.you.id ? " (you)" : ""}
              {p.id === state.hostId ? " ★" : ""}
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? "Link copied" : "Copy invite link"}
      </button>
      {isHost ? (
        <button
          className="btn bid"
          disabled={state.players.length < 2}
          onClick={onStart}
        >
          {state.players.length < 2
            ? "Waiting for players…"
            : `Start (${state.players.length} players)`}
        </button>
      ) : (
        <div className="mono" style={{ textAlign: "center" }}>
          waiting for the host to start…
        </div>
      )}
    </div>
  );
}

function ErrorBar({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="panel"
      style={{
        borderColor: "var(--crimson)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
      role="alert"
    >
      <span style={{ fontSize: 13.5 }}>{message}</span>
      <button
        className="btn ghost"
        style={{ padding: "6px 12px" }}
        onClick={onDismiss}
      >
        OK
      </button>
    </div>
  );
}
