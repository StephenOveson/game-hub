"use client";

import { useEffect, useState } from "react";
import { Die } from "./Die";
import type { ClientMessage, LiarsState } from "../shared/protocol";

const FACE_GLYPHS = "⚀⚁⚂⚃⚄⚅";

export function LiarsGameView({
  state,
  sendMessage,
}: {
  state: LiarsState;
  sendMessage: (m: ClientMessage) => void;
}) {
  return (
    <>
      <div className="strip">
        {state.players.map((p) => (
          <div
            key={p.id}
            className={[
              "seat-chip",
              p.id === state.turnId ? "turn" : "",
              !p.alive ? "dead" : "",
              !p.connected ? "offline" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="seat-name">
              {p.name}
              {p.id === state.you.id ? " (you)" : ""}
            </div>
            <div className="seat-dice">
              {p.alive ? "⚄".repeat(p.diceCount) : "✕"}
              {!p.connected && p.alive ? " ⌛" : ""}
            </div>
          </div>
        ))}
      </div>
      <TableView state={state} sendMessage={sendMessage} />
      {(state.phase === "reveal" || state.phase === "over") &&
        state.reveal && <RevealSheet state={state} sendMessage={sendMessage} />}
    </>
  );
}

function TableView({
  state,
  sendMessage,
}: {
  state: LiarsState;
  sendMessage: (m: ClientMessage) => void;
}) {
  const myTurn = state.turnId === state.you.id && state.phase === "playing";
  const totalDice = state.players
    .filter((p) => p.alive)
    .reduce((s, p) => s + p.diceCount, 0);
  const minFace = state.onesWild ? 2 : 1;

  const minLegal = () => {
    if (!state.bid) return { qty: 1, face: minFace };
    if (state.bid.face < 6)
      return { qty: state.bid.qty, face: state.bid.face + 1 };
    return { qty: state.bid.qty + 1, face: minFace };
  };
  const [proposal, setProposal] = useState(minLegal);

  const bidKey = state.bid ? `${state.bid.qty}-${state.bid.face}` : "none";
  useEffect(() => {
    setProposal(minLegal());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidKey, state.round]);

  const isLegal = (q: number, f: number) => {
    if (q < 1 || f < minFace || f > 6 || q > totalDice) return false;
    if (!state.bid) return true;
    return q > state.bid.qty || (q === state.bid.qty && f > state.bid.face);
  };

  const turnPlayer = state.players.find((p) => p.id === state.turnId);

  return (
    <>
      <div style={{ display: "grid", gap: 6 }}>
        <div className="plaque">
          <div className="mono">current bid</div>
          <div className="plaque-bid">
            {state.bid ? (
              <>
                {state.bid.qty} × <Die value={state.bid.face} size={30} />
              </>
            ) : (
              "—"
            )}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--parchment-dim)",
              marginTop: 4,
            }}
          >
            {state.bid
              ? `bid by ${
                  state.players.find((p) => p.id === state.bid!.by)?.name
                }`
              : "no bid yet"}
          </div>
        </div>
        <div className="mono" style={{ textAlign: "center" }}>
          {totalDice} dice on the table
          {state.onesWild ? " · ones are wild" : ""}
        </div>
        <div style={{ textAlign: "center", fontSize: 14, minHeight: 20 }}>
          {myTurn
            ? state.bid
              ? "Your turn — raise or call liar."
              : "Your turn — open the bidding."
            : turnPlayer
              ? `Waiting on ${turnPlayer.name}${
                  !turnPlayer.connected ? " (reconnecting…)" : ""
                }`
              : ""}
        </div>
      </div>

      <div
        className="panel"
        style={{ marginTop: "auto", display: "grid", gap: 12 }}
      >
        <div className="mono" style={{ textAlign: "center" }}>
          your dice
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {state.you.dice.map((v, i) => (
            <Die key={i} value={v} wild={state.onesWild && v === 1} />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div className="mono">quantity</div>
            <div className="stepper-row">
              <button
                className="step-btn"
                disabled={!myTurn || proposal.qty <= 1}
                onClick={() => setProposal((p) => ({ ...p, qty: p.qty - 1 }))}
              >
                −
              </button>
              <div className="qty-val">{proposal.qty}</div>
              <button
                className="step-btn"
                disabled={!myTurn || proposal.qty >= totalDice}
                onClick={() => setProposal((p) => ({ ...p, qty: p.qty + 1 }))}
              >
                +
              </button>
            </div>
          </div>
          <div
            className="title"
            style={{
              fontSize: 20,
              paddingTop: 16,
              color: "var(--parchment-dim)",
            }}
          >
            ×
          </div>
          <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div className="mono">face</div>
            <div className="stepper-row">
              <button
                className="step-btn"
                disabled={!myTurn || proposal.face <= minFace}
                onClick={() => setProposal((p) => ({ ...p, face: p.face - 1 }))}
              >
                −
              </button>
              <Die value={proposal.face} size={40} />
              <button
                className="step-btn"
                disabled={!myTurn || proposal.face >= 6}
                onClick={() => setProposal((p) => ({ ...p, face: p.face + 1 }))}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn liar"
            style={{ flex: 1 }}
            disabled={!myTurn || !state.bid}
            onClick={() => sendMessage({ type: "challenge" })}
          >
            Call liar
          </button>
          <button
            className="btn bid"
            style={{ flex: 1 }}
            disabled={!myTurn || !isLegal(proposal.qty, proposal.face)}
            onClick={() =>
              sendMessage({
                type: "bid",
                qty: proposal.qty,
                face: proposal.face,
              })
            }
          >
            Place bid
          </button>
        </div>
      </div>
    </>
  );
}

function RevealSheet({
  state,
  sendMessage,
}: {
  state: LiarsState;
  sendMessage: (m: ClientMessage) => void;
}) {
  const r = state.reveal!;
  const nameOf = (id: string) =>
    state.players.find((p) => p.id === id)?.name ?? "?";
  const isHost = state.you.id === state.hostId;
  const over = state.phase === "over";

  return (
    <div className="overlay">
      <div className="sheet">
        <h2>{over ? `${nameOf(r.winnerId!)} wins` : "Cups up!"}</h2>
        <div
          className="mono"
          style={{ textAlign: "center", color: "#7d6c50", marginTop: 2 }}
        >
          {nameOf(r.challengerId)} called liar on {nameOf(r.bid.by)}
        </div>
        <div className="brassline" />
        {r.hands.map((h) => (
          <div className="reveal-row" key={h.id}>
            <div className="reveal-name">{h.name}</div>
            <div className="reveal-dice">
              {h.dice.map((v, i) => (
                <Die
                  key={i}
                  value={v}
                  size={30}
                  wild={state.onesWild && v === 1}
                  hit={v === r.bid.face || (state.onesWild && v === 1)}
                />
              ))}
            </div>
          </div>
        ))}
        <div
          style={{
            textAlign: "center",
            marginTop: 12,
            fontSize: 14.5,
            lineHeight: 1.5,
          }}
        >
          {r.bidStood ? (
            <>
              <b>The bid stood.</b> {nameOf(r.challengerId)} was wrong and
              loses a die.
            </>
          ) : (
            <>
              <b>Liar!</b> {nameOf(r.bid.by)} came up short and loses a die.
            </>
          )}
          <div className="mono" style={{ color: "#7d6c50", marginTop: 4 }}>
            bid {r.bid.qty} × {FACE_GLYPHS[r.bid.face - 1]} · actual {r.actual}
          </div>
          {r.eliminatedId && !over && (
            <div style={{ marginTop: 6 }}>
              <b>{nameOf(r.eliminatedId)}</b> is out of the game.
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            marginTop: 16,
          }}
        >
          {over ? (
            isHost ? (
              <button
                className="btn bid"
                onClick={() => sendMessage({ type: "rematch" })}
              >
                Rematch
              </button>
            ) : (
              <div className="mono" style={{ color: "#7d6c50" }}>
                waiting for the host…
              </div>
            )
          ) : (
            <button
              className="btn bid"
              onClick={() => sendMessage({ type: "continue_round" })}
            >
              Next round
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
