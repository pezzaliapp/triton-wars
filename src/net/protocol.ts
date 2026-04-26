/**
 * Wire protocol for Triton Wars online multiplayer.
 *
 * Both peers exchange JSON-serialised NetMessage values over a Trystero
 * data channel. Schema is intentionally tiny (turn-based game, low
 * bandwidth) and explicitly versioned so we can ship breaking changes
 * later without silently mismatching peers.
 *
 * Anti-cheat lives in the protocol shape:
 *  - 'commit' carries SHA-256(units + nonce) before any shot is fired.
 *  - 'reveal' carries (units, nonce) at end-of-game so the opponent
 *    can verify both the commitment and every shotResult ever sent.
 *
 * Sequence numbers on shot/shotResult exist so a peer can detect dropped
 * or duplicated messages after a reconnect (snapshot resume reads them).
 */
import type { Orientation, Cell } from '../game/units/unit';
import type { UnitTypeId } from '../game/units/definitions';
import type { AttackResult } from '../game/rules/attack';

export const PROTOCOL_VERSION = 1 as const;

/** A unit as serialised over the wire — anchor + orientation + type are
 * sufficient to reconstruct cells deterministically on the other side. */
export interface SerializedUnit {
  typeId: UnitTypeId;
  anchor: Cell;
  orientation: Orientation;
}

/** Cell coordinate in shotResult cascades and sunk-cell reveals. */
export interface NetCell {
  x: number;
  z: number;
  layer: number;
}

export interface NetCascade {
  cell: NetCell;
  result: Exclude<AttackResult, 'already'>;
  sunkType?: UnitTypeId;
}

export type Side = 'host' | 'guest';

/** Full session snapshot for resume-after-disconnect. Contains everything
 * needed for the rejoining peer to catch up: opponent's commitment, our
 * own shotLog (what we sent), the reverse log (what we received), and the
 * monotonic timestamp used to break ties when two snapshots disagree. */
export interface SessionSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  /** Wall-clock ms at the moment the snapshot was produced. Higher wins
   * on mismatch. */
  timestamp: number;
  /** Our side in this session. */
  side: Side;
  /** Hash committed by the opponent at start of game. */
  opponentCommitment: string | null;
  /** Hash we committed (so the opponent can re-verify after a reveal). */
  ownCommitment: string | null;
  /** Sequence numbers of shots we have *sent* so far, in order. */
  sentShots: ShotRecord[];
  /** Sequence numbers of shots we have *received* (and resolved) so far. */
  receivedShots: ReceivedShotRecord[];
  /** Whose turn it is locally. */
  turn: Side;
  /** Phase of the session. */
  phase: SessionPhase;
}

export type SessionPhase =
  | 'lobby'
  | 'placing'
  | 'playing'
  | 'reveal'
  | 'ended';

export interface ShotRecord {
  seq: number;
  cell: NetCell;
  /** Result that the *opponent* told us about this shot. Null until reply. */
  result?: Exclude<AttackResult, 'already'>;
  cascades?: NetCascade[];
}

export interface ReceivedShotRecord {
  seq: number;
  cell: NetCell;
  /** Result we computed locally and sent back. */
  result: Exclude<AttackResult, 'already'>;
  cascades: NetCascade[];
}

/** Why a third peer is being kicked out of a room.
 *  - 'pending': host has not yet confirmed the current candidate; the
 *    rejected peer can be told the host is evaluating someone else.
 *  - 'locked':  host has already pressed "Inizia partita" — the match is
 *    underway. */
export type RoomFullStage = 'pending' | 'locked';

export type NetMessage =
  | { t: 'hello'; protocolVersion: number; nick: string }
  | { t: 'ready' }
  | { t: 'commit'; commitment: string }
  | { t: 'placed' }
  | { t: 'shot'; seq: number; cell: NetCell }
  | {
      t: 'shotResult';
      seq: number;
      result: Exclude<AttackResult, 'already'>;
      cascades: NetCascade[];
    }
  | { t: 'reveal'; units: SerializedUnit[]; nonce: string }
  | { t: 'verifyResult'; ok: boolean; reason?: string }
  | { t: 'snapshot'; state: SessionSnapshot }
  | { t: 'snapshotReq' }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'forfeit' }
  /** Host signals to guest that the lobby is closed and placement begins.
   *  Sent when the host presses "Inizia partita" in the invite flow. */
  | { t: 'startMatch' }
  /** Host puts the guest in stand-by while deciding. expiresAt is wall-clock
   *  ms; on receipt the guest counts down and auto-disconnects on expiry. */
  | { t: 'standby'; expiresAt: number }
  /** Sent to a peer that we cannot accept because the room slot is taken. */
  | { t: 'roomFull'; stage: RoomFullStage };

export type NetMessageKind = NetMessage['t'];

const KINDS: ReadonlySet<NetMessageKind> = new Set([
  'hello',
  'ready',
  'commit',
  'placed',
  'shot',
  'shotResult',
  'reveal',
  'verifyResult',
  'snapshot',
  'snapshotReq',
  'ping',
  'pong',
  'forfeit',
  'startMatch',
  'standby',
  'roomFull',
]);

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parse + validate. Throws on malformed input. Caller should catch and
 * either drop the message (for noisy field) or close the session (for
 * actively hostile input).
 */
export function decode(raw: string): NetMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('protocol: invalid JSON');
  }
  if (!isObject(parsed) || typeof parsed.t !== 'string') {
    throw new Error('protocol: missing tag');
  }
  if (!KINDS.has(parsed.t as NetMessageKind)) {
    throw new Error(`protocol: unknown kind '${parsed.t}'`);
  }
  return parsed as NetMessage;
}

/** True if hello.protocolVersion is compatible with our PROTOCOL_VERSION.
 * Right now we require exact match — bump to range check when v2 ships. */
export function isCompatibleVersion(remote: number): boolean {
  return remote === PROTOCOL_VERSION;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
