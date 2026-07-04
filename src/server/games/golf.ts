import type {
  GolfCard,
  GolfPhase,
  GolfPublicPlayer,
  GolfReveal,
  GolfSlotView,
  GolfState,
  GolfTurnStage,
} from "../../shared/protocol";
import { GOLF_HOLES } from "../../shared/protocol";
import type { ActionResult, BaseSeat } from "./base";
import { BaseGame, err, ok } from "./base";

interface GolfSeat extends BaseSeat {
  grid: (GolfCard & { up: boolean })[]; // always 6
  holeScores: (number | null)[];
  total: number;
}

const SUITS: { s: string; red: boolean }[] = [
  { s: "♠", red: false },
  { s: "♥", red: true },
  { s: "♦", red: true },
  { s: "♣", red: false },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const cardValue = (r: string) =>
  r === "K" ? 0
  : r === "A" ? 1
  : r === "2" ? -2
  : r === "J" || r === "Q" ? 10
  : parseInt(r, 10);

const partnerIdx = (i: number) => (i + 3) % 6;

function shuffled<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function freshDeck(): GolfCard[] {
  const d: GolfCard[] = [];
  for (const su of SUITS)
    for (const rank of RANKS) d.push({ rank, suit: su.s, red: su.red });
  return shuffled(d);
}

export function scoreGrid(cards: { rank: string }[]): number {
  let total = 0;
  for (let c = 0; c < 3; c++) {
    const a = cards[c], b = cards[c + 3];
    if (a.rank === b.rank) continue; // paired column = 0
    total += cardValue(a.rank) + cardValue(b.rank);
  }
  return total;
}

export class GolfGame extends BaseGame<GolfSeat> {
  phase: GolfPhase = "lobby";
  hole = 1;
  turnId: string | null = null;
  turnStage: GolfTurnStage | null = null;
  held: { by: string; fromDiscard: boolean; card: GolfCard } | null = null;
  outBy: string | null = null;
  reveal: GolfReveal | null = null;

  private stock: GolfCard[] = [];
  private discard: GolfCard[] = [];

  inLobby() {
    return this.phase === "lobby";
  }

  protected makeSeat(base: BaseSeat): GolfSeat {
    return {
      ...base,
      grid: [],
      holeScores: Array(GOLF_HOLES).fill(null),
      total: 0,
    };
  }

  protected onDisconnect(): void {
    // Game waits for reconnection; see README limitations.
  }

  // ── Deck ──
  private drawStock(): GolfCard {
    if (this.stock.length === 0) {
      // recycle discard except top card
      const top = this.discard.pop()!;
      this.stock = shuffled(this.discard);
      this.discard = [top];
    }
    return this.stock.pop()!;
  }

  // ── Hole lifecycle ──
  start(byId: string): ActionResult {
    if (this.phase !== "lobby") return err("Already started.");
    if (byId !== this.hostId) return err("Only the host can start the game.");
    if (this.players.length < 2) return err("Need at least 2 players.");
    this.hole = 1;
    for (const p of this.players) {
      p.holeScores = Array(GOLF_HOLES).fill(null);
      p.total = 0;
    }
    this.dealHole();
    return ok;
  }

  private dealHole() {
    this.stock = freshDeck();
    for (const p of this.players) {
      p.grid = Array.from({ length: 6 }, () => ({
        ...this.stock.pop()!,
        up: false,
      }));
    }
    this.discard = [this.stock.pop()!];
    this.held = null;
    this.outBy = null;
    this.turnId = null;
    this.turnStage = null;
    this.reveal = null;
    this.phase = "flipping"; // everyone flips two concurrently
  }

  private flippedCount(p: GolfSeat) {
    return p.grid.filter((c) => c.up).length;
  }

  private holeStarterId() {
    // rotate the opening turn each hole
    return this.players[(this.hole - 1) % this.players.length].id;
  }

  flip(byId: string, slot: number): ActionResult {
    const p = this.byId(byId);
    if (!p) return err("You're not seated at this table.");
    if (slot < 0 || slot > 5 || !p.grid[slot]) return err("Bad slot.");

    if (this.phase === "flipping") {
      if (this.flippedCount(p) >= 2)
        return err("You've already flipped two cards.");
      if (p.grid[slot].up) return err("That card is already face up.");
      p.grid[slot].up = true;
      if (this.players.every((q) => this.flippedCount(q) >= 2)) {
        this.phase = "playing";
        this.turnId = this.holeStarterId();
        this.turnStage = "choose";
      }
      return ok;
    }

    if (this.phase === "playing" && this.turnStage === "flipAfter") {
      if (byId !== this.turnId) return err("Not your turn.");
      if (p.grid[slot].up) return err("That card is already face up.");
      p.grid[slot].up = true;
      this.endTurn();
      return ok;
    }

    return err("You can't flip a card right now.");
  }

  draw(byId: string): ActionResult {
    const gate = this.requireTurn(byId, "choose");
    if (gate) return gate;
    this.held = { by: byId, fromDiscard: false, card: this.drawStock() };
    this.turnStage = "holding";
    return ok;
  }

  takeDiscard(byId: string): ActionResult {
    const gate = this.requireTurn(byId, "choose");
    if (gate) return gate;
    if (this.discard.length === 0) return err("The discard pile is empty.");
    this.held = { by: byId, fromDiscard: true, card: this.discard.pop()! };
    this.turnStage = "holding";
    return ok;
  }

  swap(byId: string, slot: number): ActionResult {
    const gate = this.requireTurn(byId, "holding");
    if (gate) return gate;
    if (slot < 0 || slot > 5) return err("Bad slot.");
    const p = this.byId(byId)!;
    const outgoing = p.grid[slot];
    p.grid[slot] = { ...this.held!.card, up: true };
    this.discard.push({
      rank: outgoing.rank,
      suit: outgoing.suit,
      red: outgoing.red,
    });
    this.held = null;
    this.endTurn();
    return ok;
  }

  discardDrawn(byId: string): ActionResult {
    const gate = this.requireTurn(byId, "holding");
    if (gate) return gate;
    if (this.held!.fromDiscard)
      return err("A card taken from the discard must be swapped in.");
    this.discard.push(this.held!.card);
    this.held = null;
    const p = this.byId(byId)!;
    if (p.grid.some((c) => !c.up)) {
      this.turnStage = "flipAfter";
    } else {
      this.endTurn();
    }
    return ok;
  }

  private requireTurn(
    byId: string,
    stage: GolfTurnStage
  ): ActionResult | null {
    if (this.phase !== "playing") return err("No hole in progress.");
    if (byId !== this.turnId) return err("Not your turn.");
    if (this.turnStage !== stage) return err("You can't do that right now.");
    return null;
  }

  private endTurn() {
    const current = this.turnId!;
    const p = this.byId(current)!;
    if (this.outBy === null && p.grid.every((c) => c.up)) {
      this.outBy = current; // everyone else gets exactly one more turn
    }
    const next = this.nextAfter(current);
    if (this.outBy !== null && next === this.outBy) {
      this.endHole();
      return;
    }
    this.turnId = next;
    this.turnStage = "choose";
  }

  private endHole() {
    for (const p of this.players) for (const c of p.grid) c.up = true;

    const hands = this.players.map((p) => {
      const score = scoreGrid(p.grid);
      p.holeScores[this.hole - 1] = score;
      p.total += score;
      return {
        id: p.id,
        name: p.name,
        cards: p.grid.map(({ rank, suit, red }) => ({ rank, suit, red })),
        score,
      };
    });

    const isFinal = this.hole >= GOLF_HOLES;
    let winnerIds: string[] = [];
    if (isFinal) {
      const best = Math.min(...this.players.map((p) => p.total));
      winnerIds = this.players.filter((p) => p.total === best).map((p) => p.id);
    }

    this.reveal = { hole: this.hole, hands, winnerIds };
    this.turnId = null;
    this.turnStage = null;
    this.phase = isFinal ? "over" : "reveal";
  }

  continueRound(): ActionResult {
    if (this.phase !== "reveal") return err("Nothing to continue.");
    this.hole++;
    this.dealHole();
    return ok;
  }

  rematch(byId: string): ActionResult {
    if (this.phase !== "over") return err("The game isn't over.");
    if (byId !== this.hostId) return err("Only the host can start a rematch.");
    this.phase = "lobby";
    return this.start(byId);
  }

  // ── View ──
  stateFor(viewerId: string, code: string): GolfState {
    const players: GolfPublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      flipped: this.flippedCount(p),
      holeScores: [...p.holeScores],
      total: p.total,
      grid: p.grid.map<GolfSlotView>((c) =>
        c.up
          ? { up: true, card: { rank: c.rank, suit: c.suit, red: c.red } }
          : { up: false, card: null }
      ),
    }));

    const held = this.held
      ? {
          by: this.held.by,
          fromDiscard: this.held.fromDiscard,
          card:
            this.held.by === viewerId || this.held.fromDiscard
              ? this.held.card
              : null,
        }
      : null;

    return {
      type: "state",
      game: "golf",
      code,
      phase: this.phase,
      hole: this.hole,
      hostId: this.hostId,
      turnId: this.turnId,
      turnStage: this.turnStage,
      players,
      stockCount: this.stock.length,
      discardTop: this.discard[this.discard.length - 1] ?? null,
      held,
      outBy: this.outBy,
      you: { id: viewerId },
      reveal:
        this.phase === "reveal" || this.phase === "over" ? this.reveal : null,
    };
  }
}
