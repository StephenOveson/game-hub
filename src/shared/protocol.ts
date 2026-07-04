/**
 * Message protocol shared between the WebSocket server and the client.
 * The server is authoritative for both games: clients only ever see the
 * hidden information they're entitled to (their own dice; face-up cards).
 */

export type GameType = "liars" | "golf";

export const START_DICE = 5;
export const GOLF_HOLES = 9;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;

/* ────────────────────────── Shared ────────────────────────── */

export interface BasePublicPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface JoinedMessage {
  type: "joined";
  code: string;
  playerId: string;
  /** Secret used to reclaim this seat on reconnect. */
  token: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

/* ────────────────────────── Liar's Dice ────────────────────────── */

export type LiarsPhase = "lobby" | "playing" | "reveal" | "over";

export interface Bid {
  qty: number;
  face: number; // 1–6
  by: string; // player id
}

export interface LiarsPublicPlayer extends BasePublicPlayer {
  diceCount: number;
  alive: boolean;
}

export interface LiarsReveal {
  /** Full dice snapshot, only sent while phase === "reveal" or "over". */
  hands: { id: string; name: string; dice: number[] }[];
  bid: Bid;
  challengerId: string;
  actual: number;
  bidStood: boolean;
  loserId: string;
  eliminatedId: string | null;
  winnerId: string | null;
}

export interface LiarsState {
  type: "state";
  game: "liars";
  code: string;
  phase: LiarsPhase;
  round: number;
  onesWild: boolean;
  hostId: string;
  turnId: string | null;
  bid: Bid | null;
  players: LiarsPublicPlayer[];
  you: { id: string; dice: number[] };
  reveal: LiarsReveal | null;
}

/* ────────────────────────── Golf ────────────────────────── */

export type GolfPhase = "lobby" | "flipping" | "playing" | "reveal" | "over";
export type GolfTurnStage = "choose" | "holding" | "flipAfter";

export interface GolfCard {
  rank: string; // A,2..10,J,Q,K
  suit: string; // ♠♥♦♣
  red: boolean;
}

/** One grid slot as a given viewer is allowed to see it. */
export interface GolfSlotView {
  up: boolean;
  /** null while face-down — including your own cards. */
  card: GolfCard | null;
}

export interface GolfPublicPlayer extends BasePublicPlayer {
  grid: GolfSlotView[]; // always 6
  flipped: number; // face-up count (used during "flipping")
  holeScores: (number | null)[]; // length GOLF_HOLES
  total: number;
}

export interface GolfReveal {
  hole: number;
  hands: { id: string; name: string; cards: GolfCard[]; score: number }[];
  /** Populated when phase === "over"; >1 entry means a tie. */
  winnerIds: string[];
}

export interface GolfState {
  type: "state";
  game: "golf";
  code: string;
  phase: GolfPhase;
  hole: number;
  hostId: string;
  turnId: string | null;
  turnStage: GolfTurnStage | null;
  players: GolfPublicPlayer[];
  stockCount: number;
  discardTop: GolfCard | null;
  /**
   * Present while someone is holding a drawn card. `card` is only populated
   * for the holder — or for everyone if it was taken from the discard,
   * since that's public information.
   */
  held: { by: string; fromDiscard: boolean; card: GolfCard | null } | null;
  /** Who has gone out (all six face up), triggering final turns. */
  outBy: string | null;
  you: { id: string };
  reveal: GolfReveal | null;
}

/* ────────────────────────── Unions ────────────────────────── */

export type StateMessage = LiarsState | GolfState;
export type ServerMessage = StateMessage | JoinedMessage | ErrorMessage;

export type ClientMessage =
  | { type: "create_room"; game: GameType; name: string; onesWild?: boolean }
  | {
      type: "join_room";
      code: string;
      name: string;
      /** Present when reclaiming a seat after a refresh/disconnect. */
      playerId?: string;
      token?: string;
    }
  | { type: "start_game" }
  | { type: "continue_round" } // liars: next round · golf: next hole
  | { type: "rematch" }
  // Liar's Dice actions
  | { type: "bid"; qty: number; face: number }
  | { type: "challenge" }
  // Golf actions
  | { type: "golf_flip"; slot: number }
  | { type: "golf_draw" }
  | { type: "golf_take_discard" }
  | { type: "golf_swap"; slot: number }
  | { type: "golf_discard_drawn" };
