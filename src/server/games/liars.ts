import type {
  Bid,
  LiarsPhase,
  LiarsPublicPlayer,
  LiarsReveal,
  LiarsState,
} from "../../shared/protocol";
import { START_DICE } from "../../shared/protocol";
import type { ActionResult, BaseSeat } from "./base";
import { BaseGame, err, ok } from "./base";

interface LiarsSeat extends BaseSeat {
  dice: number[];
  alive: boolean;
}

const rollDie = () => 1 + Math.floor(Math.random() * 6);

export class LiarsGame extends BaseGame<LiarsSeat> {
  phase: LiarsPhase = "lobby";
  bid: Bid | null = null;
  turnId: string | null = null;
  onesWild = true;
  round = 1;
  reveal: LiarsReveal | null = null;

  inLobby() {
    return this.phase === "lobby";
  }

  protected makeSeat(base: BaseSeat): LiarsSeat {
    return { ...base, dice: Array(START_DICE).fill(1), alive: true };
  }

  protected onDisconnect(): void {
    // Game waits for reconnection; see README limitations.
  }

  // ── Helpers ──
  private alive() {
    return this.players.filter((p) => p.alive);
  }
  totalDice() {
    return this.alive().reduce((s, p) => s + p.dice.length, 0);
  }
  private matches(v: number, face: number) {
    return v === face || (this.onesWild && v === 1);
  }
  private minFace() {
    return this.onesWild ? 2 : 1;
  }
  private countFace(face: number) {
    let n = 0;
    for (const p of this.alive())
      for (const v of p.dice) if (this.matches(v, face)) n++;
    return n;
  }

  isLegalBid(qty: number, face: number): boolean {
    if (qty < 1 || face < this.minFace() || face > 6) return false;
    if (qty > this.totalDice()) return false;
    if (!this.bid) return true;
    return qty > this.bid.qty || (qty === this.bid.qty && face > this.bid.face);
  }

  // ── Round flow ──
  start(byId: string): ActionResult {
    if (this.phase !== "lobby") return err("Already started.");
    if (byId !== this.hostId) return err("Only the host can start the game.");
    if (this.players.length < 2) return err("Need at least 2 players.");
    this.phase = "playing";
    this.round = 1;
    this.startRound(this.players[0].id);
    return ok;
  }

  private startRound(starterId: string) {
    this.bid = null;
    this.reveal = null;
    this.turnId = starterId;
    for (const p of this.alive())
      p.dice = Array.from({ length: p.dice.length }, rollDie);
  }

  placeBid(byId: string, qty: number, face: number): ActionResult {
    if (this.phase !== "playing") return err("No round in progress.");
    if (byId !== this.turnId) return err("Not your turn.");
    if (!this.isLegalBid(qty, face))
      return err("That bid doesn't raise the current bid.");
    this.bid = { qty, face, by: byId };
    this.turnId = this.nextAfter(byId, (p) => p.alive);
    return ok;
  }

  challenge(byId: string): ActionResult {
    if (this.phase !== "playing") return err("No round in progress.");
    if (byId !== this.turnId) return err("Not your turn.");
    if (!this.bid) return err("There's no bid to challenge.");

    const bid = this.bid;
    const actual = this.countFace(bid.face);
    const bidStood = actual >= bid.qty;
    const loserId = bidStood ? byId : bid.by;
    const loser = this.byId(loserId)!;

    // Snapshot hands as rolled, BEFORE the loser's die is removed,
    // so the revealed dice visibly add up to `actual`.
    const hands = this.alive().map((p) => ({
      id: p.id,
      name: p.name,
      dice: [...p.dice],
    }));

    loser.dice.pop();
    const eliminated = loser.dice.length === 0;
    if (eliminated) loser.alive = false;

    const survivors = this.alive();
    const winnerId = survivors.length === 1 ? survivors[0].id : null;

    this.reveal = {
      hands,
      bid,
      challengerId: byId,
      actual,
      bidStood,
      loserId,
      eliminatedId: eliminated ? loserId : null,
      winnerId,
    };
    this.phase = winnerId ? "over" : "reveal";
    this.turnId = null;
    return ok;
  }

  continueRound(): ActionResult {
    if (this.phase !== "reveal") return err("Nothing to continue.");
    const { loserId } = this.reveal!;
    const loser = this.byId(loserId)!;
    const starterId = loser.alive
      ? loserId
      : this.nextAfter(loserId, (p) => p.alive);
    this.round++;
    this.phase = "playing";
    this.startRound(starterId);
    return ok;
  }

  rematch(byId: string): ActionResult {
    if (this.phase !== "over") return err("The game isn't over.");
    if (byId !== this.hostId) return err("Only the host can start a rematch.");
    for (const p of this.players) {
      p.alive = true;
      p.dice = Array(START_DICE).fill(1);
    }
    this.round = 1;
    this.reveal = null;
    this.phase = "playing";
    this.startRound(this.players[0].id);
    return ok;
  }

  // ── View ──
  stateFor(viewerId: string, code: string): LiarsState {
    const players: LiarsPublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      diceCount: p.dice.length,
      alive: p.alive,
    }));
    return {
      type: "state",
      game: "liars",
      code,
      phase: this.phase,
      round: this.round,
      onesWild: this.onesWild,
      hostId: this.hostId,
      turnId: this.turnId,
      bid: this.bid,
      players,
      you: { id: viewerId, dice: this.byId(viewerId)?.dice ?? [] },
      reveal:
        this.phase === "reveal" || this.phase === "over" ? this.reveal : null,
    };
  }
}
