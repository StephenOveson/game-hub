import type { StateMessage } from "../../shared/protocol";

export interface BaseSeat {
  id: string;
  name: string;
  token: string;
  connected: boolean;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export const ok: ActionResult = { ok: true };
export const err = (error: string): ActionResult => ({ ok: false, error });

/**
 * Lobby and seat management shared by every game engine. Subclasses own
 * their phase machine; the only contract here is that joining is only
 * possible while `inLobby()` is true.
 */
export abstract class BaseGame<P extends BaseSeat> {
  players: P[] = [];
  hostId = "";

  abstract inLobby(): boolean;
  /** Personalized snapshot — never leaks hidden info to the wrong viewer. */
  abstract stateFor(viewerId: string, code: string): StateMessage;
  abstract start(byId: string): ActionResult;
  abstract continueRound(): ActionResult;
  abstract rematch(byId: string): ActionResult;
  protected abstract makeSeat(base: BaseSeat): P;
  /** Called when a seated player disconnects mid-game. */
  protected abstract onDisconnect(id: string): void;

  byId(id: string): P | null {
    return this.players.find((p) => p.id === id) ?? null;
  }

  addPlayer(base: BaseSeat): ActionResult {
    if (!this.inLobby()) return err("Game already in progress.");
    this.players.push(this.makeSeat(base));
    if (this.players.length === 1) this.hostId = base.id;
    return ok;
  }

  removePlayer(id: string) {
    if (this.inLobby()) {
      this.players = this.players.filter((p) => p.id !== id);
      if (this.hostId === id && this.players.length > 0)
        this.hostId = this.players[0].id;
    } else {
      const p = this.byId(id);
      if (p) {
        p.connected = false;
        this.onDisconnect(id);
      }
    }
  }

  reclaimSeat(id: string, token: string): boolean {
    const p = this.byId(id);
    if (p && p.token === token) {
      p.connected = true;
      return true;
    }
    return false;
  }

  protected nextAfter(id: string, eligible: (p: P) => boolean = () => true) {
    const idx = this.players.findIndex((p) => p.id === id);
    let j = idx;
    do {
      j = (j + 1) % this.players.length;
    } while (!eligible(this.players[j]) && j !== idx);
    return this.players[j].id;
  }
}
