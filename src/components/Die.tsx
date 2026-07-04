const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({
  value,
  size = 44,
  wild = false,
  hit = false,
}: {
  value: number;
  size?: number;
  wild?: boolean;
  hit?: boolean;
}) {
  return (
    <div
      className={`die${wild ? " wild" : ""}${hit ? " hit" : ""}`}
      style={{ ["--ds" as string]: `${size}px` }}
      aria-label={`die showing ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="pipcell">
          {PIPS[value]?.includes(i) ? <div className="pip" /> : null}
        </div>
      ))}
    </div>
  );
}
