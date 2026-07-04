"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GameType } from "../shared/protocol";

const GAMES: { id: GameType; name: string; icon: string; blurb: string }[] = [
  {
    id: "golf",
    name: "Golf",
    icon: "⛳",
    blurb: "Six cards, nine holes, lowest score wins.",
  },
  {
    id: "liars",
    name: "Liar's Dice",
    icon: "🎲",
    blurb: "Bid, bluff, and call liar. Last cup standing.",
  },
];

export default function Lobby() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [game, setGame] = useState<GameType>("golf");
  const [onesWild, setOnesWild] = useState(true);

  const go = (params: Record<string, string>) => {
    const q = new URLSearchParams({ name: name.trim() || "Player", ...params });
    router.push(
      params.code
        ? `/room/${params.code.toUpperCase()}?${q}`
        : `/room/new?${q}`
    );
  };

  return (
    <main className="shell" style={{ justifyContent: "center", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <h1 className="title" style={{ fontSize: 34 }}>
          Card Room
        </h1>
        <div className="mono">online tables · 2–6 players</div>
      </div>

      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <label className="mono" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          className="text-input"
          maxLength={12}
          placeholder="e.g. Stephen"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <div className="mono">Pick a game</div>
        <div style={{ display: "grid", gap: 8 }}>
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`game-option${game === g.id ? " selected" : ""}`}
              onClick={() => setGame(g.id)}
            >
              <span className="game-icon">{g.icon}</span>
              <span>
                <span style={{ fontWeight: 700 }}>{g.name}</span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--parchment-dim)",
                    fontWeight: 400,
                  }}
                >
                  {g.blurb}
                </span>
              </span>
            </button>
          ))}
        </div>

        {game === "liars" && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Ones are wild
              </div>
              <div style={{ fontSize: 12, color: "var(--parchment-dim)" }}>
                Ones count toward every face; you can&apos;t bid on ones.
              </div>
            </div>
            <button
              className="btn ghost"
              style={{ padding: "8px 14px" }}
              onClick={() => setOnesWild((w) => !w)}
            >
              {onesWild ? "On" : "Off"}
            </button>
          </div>
        )}

        <button
          className="btn bid"
          onClick={() => go({ game, wild: onesWild ? "1" : "0" })}
        >
          Create a table
        </button>
      </div>

      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <label className="mono" htmlFor="code">
          Join with a code
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="code"
            className="text-input"
            style={{
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
            maxLength={4}
            placeholder="ABCD"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            className="btn ghost"
            disabled={code.trim().length !== 4}
            onClick={() => go({ code: code.trim() })}
          >
            Join
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--parchment-dim)" }}>
          The game is whatever the table&apos;s host picked — the code is all
          you need.
        </div>
      </div>
    </main>
  );
}
