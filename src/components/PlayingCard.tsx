import type { GolfCard } from "../shared/protocol";

export function PlayingCard({
  card,
  size = 64, // width in px; height derives from a 0.71 aspect
  selectable = false,
  paired = false,
  onClick,
}: {
  card: GolfCard | null; // null renders a face-down back
  size?: number;
  selectable?: boolean;
  paired?: boolean;
  onClick?: () => void;
}) {
  const cls = [
    "pcard",
    card ? "up" : "down",
    selectable ? "selectable" : "",
    paired ? "paired" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      style={{ ["--cw" as string]: `${size}px` }}
      onClick={onClick}
      disabled={!onClick}
      aria-label={card ? `${card.rank} of ${card.suit}` : "face-down card"}
    >
      {card ? (
        <span className={`pcard-face${card.red ? " red" : ""}`}>
          <span className="pcard-corner">{card.rank}</span>
          <span className="pcard-rank">{card.rank}</span>
          <span className="pcard-suit">{card.suit}</span>
        </span>
      ) : (
        <span className="pcard-back">⛳</span>
      )}
    </button>
  );
}
