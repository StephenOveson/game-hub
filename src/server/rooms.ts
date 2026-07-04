import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import { LiarsGame } from "./games/liars";
import { GolfGame } from "./games/golf";
import type {
  ClientMessage,
  ServerMessage,
} from "../shared/protocol";
import { MAX_PLAYERS } from "../shared/protocol";

type Engine = LiarsGame | GolfGame;

interface Room {
  code: string;
  engine: Engine;
  sockets: Map<string, WebSocket>; // playerId -> socket
  lastActivity: number;
}

const rooms = new Map<string, Room>();

const ROOM_TTL_MS = 30 * 60 * 1000; // sweep rooms idle for 30 min
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no lookalikes

function newRoomCode(): string {
  for (;;) {
    let code = "";
    const bytes = randomBytes(4);
    for (let i = 0; i < 4; i++)
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
}

function sanitizeName(raw: string): string {
  const name = raw.replace(/[<>&"']/g, "").trim().slice(0, 12);
  return name || "Player";
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, message: string) {
  send(ws, { type: "error", message });
}

/** Push a personalized state snapshot to every connected player in the room. */
function broadcast(room: Room) {
  room.lastActivity = Date.now();
  for (const [playerId, ws] of room.sockets) {
    send(ws, room.engine.stateFor(playerId, room.code));
  }
}

interface SocketContext {
  roomCode: string | null;
  playerId: string | null;
}

export function attachRoomServer(wss: WebSocketServer) {
  // periodic GC of abandoned rooms
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const empty = [...room.sockets.values()].every(
        (ws) => ws.readyState !== ws.OPEN
      );
      if (empty && now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
    }
  }, 60 * 1000);
  sweeper.unref();

  wss.on("connection", (ws) => {
    const ctx: SocketContext = { roomCode: null, playerId: null };

    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return sendError(ws, "Malformed message.");
      }
      try {
        handleMessage(ws, ctx, msg);
      } catch (err) {
        console.error("handler error", err);
        sendError(ws, "Something went wrong on the server.");
      }
    });

    ws.on("close", () => {
      const room = ctx.roomCode ? rooms.get(ctx.roomCode) : null;
      if (!room || !ctx.playerId) return;
      // Only clear the socket if it's still the one registered for this seat
      if (room.sockets.get(ctx.playerId) === ws)
        room.sockets.delete(ctx.playerId);
      room.engine.removePlayer(ctx.playerId);
      if (room.engine.players.length === 0) rooms.delete(room.code);
      else broadcast(room);
    });
  });
}

function handleMessage(ws: WebSocket, ctx: SocketContext, msg: ClientMessage) {
  if (msg.type === "create_room") {
    const code = newRoomCode();
    let engine: Engine;
    if (msg.game === "golf") {
      engine = new GolfGame();
    } else {
      const liars = new LiarsGame();
      liars.onesWild = msg.onesWild !== false;
      engine = liars;
    }
    const room: Room = {
      code,
      engine,
      sockets: new Map(),
      lastActivity: Date.now(),
    };
    rooms.set(code, room);
    joinRoom(ws, ctx, room, sanitizeName(msg.name));
    return;
  }

  if (msg.type === "join_room") {
    const room = rooms.get(msg.code.toUpperCase());
    if (!room) return sendError(ws, "Room not found — check the code.");

    // Reconnection path: reclaim an existing seat
    if (msg.playerId && msg.token) {
      if (room.engine.reclaimSeat(msg.playerId, msg.token)) {
        ctx.roomCode = room.code;
        ctx.playerId = msg.playerId;
        room.sockets.get(msg.playerId)?.close();
        room.sockets.set(msg.playerId, ws);
        const seat = room.engine.byId(msg.playerId)!;
        send(ws, {
          type: "joined",
          code: room.code,
          playerId: seat.id,
          token: seat.token,
        });
        broadcast(room);
        return;
      }
    }

    if (!room.engine.inLobby())
      return sendError(ws, "That game has already started.");
    if (room.engine.players.length >= MAX_PLAYERS)
      return sendError(ws, "That table is full (6 players max).");
    joinRoom(ws, ctx, room, sanitizeName(msg.name));
    return;
  }

  // Everything below requires being seated in a room
  const room = ctx.roomCode ? rooms.get(ctx.roomCode) : null;
  if (!room || !ctx.playerId) return sendError(ws, "You're not in a room.");
  const pid = ctx.playerId;
  const { engine } = room;

  let result;
  switch (msg.type) {
    case "start_game":
      result = engine.start(pid);
      break;
    case "continue_round":
      result = engine.continueRound();
      break;
    case "rematch":
      result = engine.rematch(pid);
      break;

    // ── Liar's Dice ──
    case "bid":
      if (!(engine instanceof LiarsGame)) return sendError(ws, "Wrong game.");
      result = engine.placeBid(pid, msg.qty | 0, msg.face | 0);
      break;
    case "challenge":
      if (!(engine instanceof LiarsGame)) return sendError(ws, "Wrong game.");
      result = engine.challenge(pid);
      break;

    // ── Golf ──
    case "golf_flip":
      if (!(engine instanceof GolfGame)) return sendError(ws, "Wrong game.");
      result = engine.flip(pid, msg.slot | 0);
      break;
    case "golf_draw":
      if (!(engine instanceof GolfGame)) return sendError(ws, "Wrong game.");
      result = engine.draw(pid);
      break;
    case "golf_take_discard":
      if (!(engine instanceof GolfGame)) return sendError(ws, "Wrong game.");
      result = engine.takeDiscard(pid);
      break;
    case "golf_swap":
      if (!(engine instanceof GolfGame)) return sendError(ws, "Wrong game.");
      result = engine.swap(pid, msg.slot | 0);
      break;
    case "golf_discard_drawn":
      if (!(engine instanceof GolfGame)) return sendError(ws, "Wrong game.");
      result = engine.discardDrawn(pid);
      break;

    default:
      return sendError(ws, "Unknown message type.");
  }

  if (!result.ok) return sendError(ws, result.error);
  broadcast(room);
}

function joinRoom(
  ws: WebSocket,
  ctx: SocketContext,
  room: Room,
  name: string
) {
  const playerId = randomUUID();
  const token = randomBytes(16).toString("hex");
  const res = room.engine.addPlayer({
    id: playerId,
    name,
    token,
    connected: true,
  });
  if (!res.ok) return sendError(ws, res.error);

  ctx.roomCode = room.code;
  ctx.playerId = playerId;
  room.sockets.set(playerId, ws);
  send(ws, { type: "joined", code: room.code, playerId, token });
  broadcast(room);
}
