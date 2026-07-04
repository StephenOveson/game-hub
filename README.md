# Card Room — Golf & Liar's Dice online

Real-time multiplayer card/dice room over WebSockets. Two games behind one
lobby: **Golf** (6-card, 9 holes, lowest total wins) and **Liar's Dice**
(Perudo). Next.js 15 App Router + a custom Node server with `ws` attached to
the same HTTP server, so the whole app deploys as one process on one port.

## Why a custom server

Next.js API routes on serverless platforms (Vercel) can't hold long-lived
WebSocket connections. This scaffold runs Next behind its own `http.Server`
(`server.ts`) and routes `upgrade` requests on `/ws` to a `ws`
`WebSocketServer`, while forwarding all other upgrades (like
`/_next/webpack-hmr` in dev) back to Next. Deploy anywhere that runs a
persistent Node process: Railway, Render, Fly.io, a VPS.

## Run it

```bash
npm install
npm run dev        # tsx watch server.ts — Next dev + WS on :3000
```

Open http://localhost:3000, pick a game, create a table, then join from a
second browser tab (or a phone on the same network) with the 4-letter code.

Production:

```bash
npm run build
npm start          # NODE_ENV=production tsx server.ts
```

## Deploy

**Railway / Render**: point at the repo, build command `npm run build`, start
command `npm start`. Both set `PORT` automatically and the server reads it.

**Fly.io**: `fly launch` will detect the Dockerfile. WebSockets work out of
the box behind Fly's proxy.

## Architecture

```
server.ts                        HTTP server + /ws upgrade routing
src/server/games/base.ts         Shared lobby/seat/reconnect logic (BaseGame)
src/server/games/liars.ts        Liar's Dice engine (pure, unit-testable)
src/server/games/golf.ts         Golf engine (pure, unit-testable)
src/server/rooms.ts              Room registry, message routing, broadcasts
src/shared/protocol.ts           Typed message contracts (discriminated unions)
src/hooks/useGameSocket.ts       Client socket: reconnect + seat reclaim
src/components/LiarsGameView.tsx Liar's Dice UI
src/components/GolfGameView.tsx  Golf UI (grids, piles, scorecard)
src/app/page.tsx                 Lobby: game picker + create/join by code
src/app/room/[code]/page.tsx     Dispatches to the right game view
```

**The server is authoritative for both games.** Each engine implements
`stateFor(viewerId, code)` — the single place hidden information is filtered:

- *Liar's Dice*: you get everyone's dice **counts** but only your own dice
  **values**. Full hands appear only in the reveal after a challenge.
- *Golf*: face-down cards are sent as `null` to **everyone, including their
  owner** (in Golf you don't know your own face-down cards). A card drawn
  from the stock is visible only to its holder; a card taken from the
  discard is public, matching table reality.

Adding a third game means: a new engine extending `BaseGame`, a state type in
the protocol union, a case block in `rooms.ts`, and a view component.

**Reconnection**: on join, the server issues a `playerId` + secret `token`,
stored in `sessionStorage` keyed by room code. If the socket drops, the hook
reconnects with exponential backoff and reclaims the same seat mid-game.

**Rules implemented**

- *Golf*: six cards in a 2×3 grid, everyone flips two **concurrently** to
  start each hole; on your turn draw or take the discard, then swap in (or
  discard a stock draw and flip one of your own); a discard take must be
  swapped. When someone goes out, each other player gets exactly one final
  turn. K=0, A=1, 2=−2, J/Q=10, matching column pairs cancel. Nine holes,
  lowest total wins; ties are reported as ties. Opening turn rotates each
  hole.
- *Liar's Dice*: 5 dice each, bids must raise, optional ones-wild (set at
  table creation; disables bidding on ones), challenge reveals all hands,
  loser drops a die and opens the next round, elimination at zero, last
  player standing wins.

## Testing

Both engines are pure classes with no socket code. They've been fuzz-tested
(random full games across 2–6 players) for turn gating, bid/action legality,
scorecard consistency, privacy invariants in `stateFor`, and termination.
Dropping in Vitest to make those checks permanent is the natural next step.

## Known limitations / next steps

- **Rooms are in-memory.** A server restart drops all games, and it only
  scales to one instance. For multi-instance deploys, move room state to
  Redis and use pub/sub for broadcasts.
- **A disconnected player stalls their turn** (and Golf's flipping phase).
  A turn timer with auto-play/skip is the natural fix.
- **No spectators or late joins** once a game starts.
- **No persistence/accounts** — rooms are throwaway by design.
