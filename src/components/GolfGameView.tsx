"use client";

import { PlayingCard } from "./PlayingCard";
import type {
  ClientMessage,
  GolfPublicPlayer,
  GolfState,
} from "../shared/protocol";
import { GOLF_HOLES } from "../shared/protocol";

const partnerIdx = (i: number) => (i + 3) % 6;

function isPairedSlot(p: GolfPublicPlayer, i: number) {
  const a = p.grid[i],
    b = p.grid[partnerIdx(i)];
  return !!(a?.up && b?.up && a.card && b.card && a.card.rank === b.card.rank);
}

export function GolfGameView({
  state,
  sendMessage,
}: {
  state: GolfState;
  sendMessage: (m: ClientMessage) => void;
}) {
  const me = state.players.find((p) => p.id === state.you.id)!;
  const opponents = state.players.filter((p) => p.id !== state.you.id);
  const myTurn = state.turnId === state.you.id && state.phase === "playing";
  const flipping = state.phase === "flipping";
  const iNeedToFlip = flipping && me.flipped < 2;
  const holding = myTurn && state.turnStage === "holding";
  const flipAfter = myTurn && state.turnStage === "flipAfter";
  const choosing = myTurn && state.turnStage === "choose";

  const canTapOwnSlot = (i: number) =>
    (iNeedToFlip && !me.grid[i].up) ||
    holding ||
    (flipAfter && !me.grid[i].up);

  const onTapOwnSlot = (i: number) => {
    if (iNeedToFlip || flipAfter) sendMessage({ type: "golf_flip", slot: i });
    else if (holding) sendMessage({ type: "golf_swap", slot: i });
  };

  const turnPlayer = state.players.find((p) => p.id === state.turnId);
  const statusLine = flipping
    ? iNeedToFlip
      ? `Flip ${2 - me.flipped} of your cards to start hole ${state.hole}.`
      : "Waiting for the others to flip…"
    : holding
      ? state.held?.fromDiscard
        ? "You took the discard — tap a card to swap it in."
        : "Tap a card to swap, or discard it and flip one."
      : flipAfter
        ? "Flip one of your face-down cards."
        : choosing
          ? `Your turn — draw or take the discard.${
              state.outBy ? " Final turn!" : ""
            }`
          : turnPlayer
            ? `Waiting on ${turnPlayer.name}${
                !turnPlayer.connected ? " (reconnecting…)" : ""
              }${state.outBy ? " · final turns" : ""}`
            : "";

  return (
    <>
      {/* opponents */}
      <div className="strip" style={{ alignItems: "flex-start" }}>
        {opponents.map((p) => (
          <div
            key={p.id}
            className={[
              "golf-opp",
              p.id === state.turnId ? "turn" : "",
              !p.connected ? "offline" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="seat-name">
              {p.name}
              {p.id === state.outBy ? " · out" : ""}
            </div>
            <div className="golf-grid mini">
              {p.grid.map((s, i) => (
                <PlayingCard
                  key={i}
                  card={s.card}
                  size={34}
                  paired={isPairedSlot(p, i)}
                />
              ))}
            </div>
            <div className="mono" style={{ fontSize: 10 }}>
              total {p.total}
            </div>
          </div>
        ))}
      </div>

      {/* piles */}
      <div className="golf-piles">
        <div className="pile">
          <div className="mono">draw · {state.stockCount}</div>
          <PlayingCard
            card={null}
            size={56}
            selectable={choosing}
            onClick={
              choosing ? () => sendMessage({ type: "golf_draw" }) : undefined
            }
          />
        </div>
        <div className="pile">
          <div className="mono" style={{ color: "var(--brass-bright)" }}>
            in hand
          </div>
          {state.held ? (
            <PlayingCard card={state.held.card} size={56} />
          ) : (
            <div className="pcard-empty" style={{ ["--cw" as string]: "56px" }} />
          )}
        </div>
        <div className="pile">
          <div className="mono">discard</div>
          {state.discardTop ? (
            <PlayingCard
              card={state.discardTop}
              size={56}
              selectable={choosing}
              onClick={
                choosing
                  ? () => sendMessage({ type: "golf_take_discard" })
                  : undefined
              }
            />
          ) : (
            <div className="pcard-empty" style={{ ["--cw" as string]: "56px" }} />
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 14, minHeight: 20 }}>
        {statusLine}
      </div>

      {/* my grid */}
      <div
        className="panel"
        style={{ marginTop: "auto", display: "grid", gap: 10 }}
      >
        <div className="mono" style={{ textAlign: "center" }}>
          your cards · showing {visibleScore(me)}
        </div>
        <div className="golf-grid" style={{ justifyContent: "center" }}>
          {me.grid.map((s, i) => (
            <PlayingCard
              key={i}
              card={s.card}
              size={64}
              paired={isPairedSlot(me, i)}
              selectable={canTapOwnSlot(i)}
              onClick={
                canTapOwnSlot(i) ? () => onTapOwnSlot(i) : undefined
              }
            />
          ))}
        </div>
        {holding && !state.held?.fromDiscard && (
          <button
            className="btn liar"
            onClick={() => sendMessage({ type: "golf_discard_drawn" })}
          >
            Discard &amp; flip
          </button>
        )}
      </div>

      {(state.phase === "reveal" || state.phase === "over") &&
        state.reveal && (
          <GolfRevealSheet state={state} sendMessage={sendMessage} />
        )}
    </>
  );
}

/** Face-up score with visible column pairs cancelled — mirrors server scoring. */
function visibleScore(p: GolfPublicPlayer) {
  const val = (r: string) =>
    r === "K" ? 0
    : r === "A" ? 1
    : r === "2" ? -2
    : r === "J" || r === "Q" ? 10
    : parseInt(r, 10);
  let total = 0;
  for (let c = 0; c < 3; c++) {
    const a = p.grid[c],
      b = p.grid[c + 3];
    if (a?.card && b?.card && a.card.rank === b.card.rank) continue;
    if (a?.card) total += val(a.card.rank);
    if (b?.card) total += val(b.card.rank);
  }
  return total;
}

function GolfRevealSheet({
  state,
  sendMessage,
}: {
  state: GolfState;
  sendMessage: (m: ClientMessage) => void;
}) {
  const r = state.reveal!;
  const over = state.phase === "over";
  const isHost = state.you.id === state.hostId;
  const nameOf = (id: string) =>
    state.players.find((p) => p.id === id)?.name ?? "?";

  const holeWinner = [...r.hands].sort((a, b) => a.score - b.score)[0];

  return (
    <div className="overlay">
      <div className="sheet">
        <h2>
          {over
            ? r.winnerIds.length > 1
              ? "All square"
              : `${nameOf(r.winnerIds[0])} wins`
            : `Hole ${r.hole} complete`}
        </h2>
        <div
          className="mono"
          style={{ textAlign: "center", color: "#7d6c50", marginTop: 2 }}
        >
          {over
            ? `final scorecard · ${GOLF_HOLES} holes`
            : `${holeWinner.name} takes the hole at ${holeWinner.score}`}
        </div>
        <div className="brassline" />

        {/* hands */}
        {r.hands.map((h) => (
          <div className="reveal-row" key={h.id}>
            <div className="reveal-name">
              {h.name}
              <div className="mono" style={{ fontSize: 10 }}>
                {h.score} pts
              </div>
            </div>
            <div className="reveal-dice">
              {h.cards.map((c, i) => (
                <PlayingCard key={i} card={c} size={30} />
              ))}
            </div>
          </div>
        ))}

        {/* scorecard */}
        <table className="scorecard">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Hole</th>
              {Array.from({ length: GOLF_HOLES }, (_, h) => (
                <th key={h}>{h + 1}</th>
              ))}
              <th>Tot</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((p) => (
              <tr key={p.id}>
                <td style={{ textAlign: "left", fontWeight: 700 }}>
                  {p.name}
                </td>
                {p.holeScores.map((s, h) => (
                  <td
                    key={h}
                    className={h === r.hole - 1 ? "current" : undefined}
                  >
                    {s === null ? "·" : s}
                  </td>
                ))}
                <td style={{ fontWeight: 700 }}>{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {over && r.winnerIds.length > 1 && (
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 14 }}>
            Tied between {r.winnerIds.map(nameOf).join(" and ")}. A
            gentleman&apos;s draw.
          </div>
        )}

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
              Tee off hole {r.hole + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
