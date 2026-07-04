export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="shell" style={{ justifyContent: "center", gap: 14 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>🕯️</div>
        <h1 className="title" style={{ fontSize: 28 }}>
          The table&apos;s gone dark
        </h1>
        <p
          style={{
            color: "var(--parchment-dim)",
            fontSize: 14.5,
            lineHeight: 1.5,
            marginTop: 8,
          }}
        >
          Card Room needs a connection — the dice live on the server, not in
          your pocket. Reconnect and your seat will be waiting.
        </p>
      </div>
    </main>
  );
}
