/**
 * OnlineSession — pure-TS state machine that owns the protocol-level
 * lifecycle of a 1v1 match. It does NOT touch the DOM, Three.js, or
 * the audio system; the orchestrator (online-orchestrator.ts) is what
 * bridges Session events into GameState mutations.
 *
 * Lifecycle:
 *   lobby   → both peers have exchanged 'hello'; nicks known
 *   placing → both committed (sent 'commit'); local placement in progress
 *   playing → both 'placed', turns alternate via shot/shotResult
 *   reveal  → game ended locally; reveals exchanged, commitment verified
 *   ended   → verification done (ok or cheat detected)
 *
 * Whose turn is it first? Determined deterministically from the two
 * commitment hashes XORed together — both peers compute the same byte
 * and pick host/guest by parity. No need for a third party.
 *
 * Sequence numbers: every shot we *send* gets a monotonic seq assigned
 * locally; every shot we *receive* is echoed back with the same seq in
 * its shotResult. This lets the snapshot/resume logic detect dropped or
 * duplicate frames after a reconnect.
 */
import type {
  NetMessage,
  NetCell,
  NetCascade,
  SerializedUnit,
  SessionPhase,
  SessionSnapshot,
  ShotRecord,
  ReceivedShotRecord,
  Side,
} from './protocol';
import { PROTOCOL_VERSION, isCompatibleVersion } from './protocol';
import {
  computeCommitment,
  generateNonce,
  verifyCommitment,
  replayAgainstReveal,
  type VerificationOutcome,
} from './commitment';

export type ResolveAttack = (cell: NetCell) => {
  result: 'miss' | 'hit' | 'sunk';
  cascades: NetCascade[];
};

export interface SessionOptions {
  side: Side;
  nick: string;
  /** Resolves a shot received from the opponent against our local grid. */
  resolveAttack: ResolveAttack;
  /** Provides the player's units for commit + reveal. Called lazily so
   * the session can be constructed before placement is finished. */
  getOwnUnits: () => SerializedUnit[];
}

export type SessionEvent =
  | { kind: 'phaseChanged'; phase: SessionPhase }
  | { kind: 'opponentReady'; nick: string }
  | { kind: 'opponentCommitted' }
  | { kind: 'opponentPlaced' }
  | { kind: 'turnChanged'; turn: Side }
  | {
      kind: 'incomingShotResult';
      seq: number;
      cell: NetCell;
      result: 'miss' | 'hit' | 'sunk';
      cascades: NetCascade[];
    }
  | {
      kind: 'opponentShot';
      seq: number;
      cell: NetCell;
      result: 'miss' | 'hit' | 'sunk';
      cascades: NetCascade[];
    }
  | { kind: 'verificationComplete'; outcome: VerificationOutcome }
  | { kind: 'opponentForfeit' }
  | { kind: 'protocolError'; reason: string };

export type SessionListener = (e: SessionEvent) => void;

export type Outbound = (msg: NetMessage) => void;

export class OnlineSession {
  private _phase: SessionPhase = 'lobby';
  private _turn: Side = 'host';
  private _nonce: string | null = null;
  private _ownCommitment: string | null = null;
  private _opponentCommitment: string | null = null;
  private _opponentNick: string | null = null;
  private _opponentPlaced = false;
  private _opponentReveal: { units: SerializedUnit[]; nonce: string } | null = null;
  private _ownPlaced = false;

  private nextSeq = 1;
  private readonly sentShots: ShotRecord[] = [];
  private readonly receivedShots: ReceivedShotRecord[] = [];

  private readonly listeners = new Set<SessionListener>();

  constructor(
    private readonly opts: SessionOptions,
    private readonly send: Outbound,
  ) {}

  get phase(): SessionPhase {
    return this._phase;
  }
  get turn(): Side {
    return this._turn;
  }
  get side(): Side {
    return this.opts.side;
  }
  get opponentNick(): string | null {
    return this._opponentNick;
  }
  get sentShotsView(): readonly ShotRecord[] {
    return this.sentShots;
  }
  get receivedShotsView(): readonly ReceivedShotRecord[] {
    return this.receivedShots;
  }

  subscribe(l: SessionListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Send our hello frame. Call once after the transport reports peerJoin. */
  sayHello(): void {
    this.send({ t: 'hello', protocolVersion: PROTOCOL_VERSION, nick: this.opts.nick });
  }

  /** Send our commit frame. Call once placement is locked locally. */
  async commit(): Promise<void> {
    if (this._ownCommitment) return;
    const units = this.opts.getOwnUnits();
    this._nonce = generateNonce();
    this._ownCommitment = await computeCommitment(units, this._nonce);
    this.send({ t: 'commit', commitment: this._ownCommitment });
    this.maybeStartPlacing();
  }

  /** Tell the opponent we have finished placing locally. */
  notifyPlaced(): void {
    if (this._ownPlaced) return;
    this._ownPlaced = true;
    this.send({ t: 'placed' });
    this.maybeStartPlaying();
  }

  /** Fire a shot at the opponent's grid. Returns the assigned seq number,
   * or null if it isn't our turn / phase is wrong. */
  fireShot(cell: NetCell): number | null {
    if (this._phase !== 'playing') return null;
    if (this._turn !== this.opts.side) return null;
    const seq = this.nextSeq++;
    this.sentShots.push({ seq, cell });
    this.send({ t: 'shot', seq, cell });
    return seq;
  }

  /** Voluntarily forfeit the match. */
  forfeit(): void {
    if (this._phase === 'ended') return;
    this.send({ t: 'forfeit' });
    this.transitionTo('ended');
  }

  /** Trigger reveal — call when local game-over is reached. */
  async reveal(): Promise<void> {
    if (this._phase !== 'playing' && this._phase !== 'reveal') return;
    if (!this._nonce) return;
    const units = this.opts.getOwnUnits();
    this.transitionTo('reveal');
    this.send({ t: 'reveal', units, nonce: this._nonce });
    await this.maybeFinishVerification();
  }

  /** Feed an incoming message from the transport. */
  async handleMessage(msg: NetMessage): Promise<void> {
    switch (msg.t) {
      case 'hello':
        if (!isCompatibleVersion(msg.protocolVersion)) {
          this.emit({
            kind: 'protocolError',
            reason: `incompatible protocol v${msg.protocolVersion}`,
          });
          return;
        }
        this._opponentNick = msg.nick;
        this.emit({ kind: 'opponentReady', nick: msg.nick });
        return;

      case 'ready':
        // Reserved for explicit ready handshake — currently 'hello' implies ready.
        return;

      case 'commit':
        this._opponentCommitment = msg.commitment;
        this.emit({ kind: 'opponentCommitted' });
        this.maybeStartPlacing();
        return;

      case 'placed':
        this._opponentPlaced = true;
        this.emit({ kind: 'opponentPlaced' });
        this.maybeStartPlaying();
        return;

      case 'shot': {
        if (this._phase !== 'playing') return;
        if (this._turn === this.opts.side) {
          // Both clients think they're firing — protocol error.
          this.emit({ kind: 'protocolError', reason: 'shot received while it is our turn' });
          return;
        }
        const outcome = this.opts.resolveAttack(msg.cell);
        this.receivedShots.push({
          seq: msg.seq,
          cell: msg.cell,
          result: outcome.result,
          cascades: outcome.cascades,
        });
        this.send({
          t: 'shotResult',
          seq: msg.seq,
          result: outcome.result,
          cascades: outcome.cascades,
        });
        this.emit({
          kind: 'opponentShot',
          seq: msg.seq,
          cell: msg.cell,
          result: outcome.result,
          cascades: outcome.cascades,
        });
        this.flipTurn();
        return;
      }

      case 'shotResult': {
        const pending = this.sentShots.find((s) => s.seq === msg.seq);
        if (!pending) {
          this.emit({ kind: 'protocolError', reason: `shotResult for unknown seq ${msg.seq}` });
          return;
        }
        if (pending.result !== undefined) {
          // Duplicate result for a seq we've already resolved — ignore.
          return;
        }
        pending.result = msg.result;
        pending.cascades = msg.cascades;
        this.emit({
          kind: 'incomingShotResult',
          seq: msg.seq,
          cell: pending.cell,
          result: msg.result,
          cascades: msg.cascades,
        });
        this.flipTurn();
        return;
      }

      case 'reveal':
        this._opponentReveal = { units: msg.units, nonce: msg.nonce };
        if (this._phase !== 'reveal' && this._phase !== 'ended') {
          this.transitionTo('reveal');
        }
        await this.maybeFinishVerification();
        return;

      case 'verifyResult':
        // Informational only — each peer verifies independently.
        return;

      case 'forfeit':
        this.emit({ kind: 'opponentForfeit' });
        this.transitionTo('ended');
        return;

      case 'snapshot':
      case 'snapshotReq':
      case 'ping':
      case 'pong':
        // Reconnect / liveness flows are handled in reconnect.ts; the
        // session itself ignores them (it only cares about game state).
        return;
    }
  }

  /** Snapshot used by reconnect.ts. */
  serializeSnapshot(now: number): SessionSnapshot {
    return {
      protocolVersion: PROTOCOL_VERSION,
      timestamp: now,
      side: this.opts.side,
      opponentCommitment: this._opponentCommitment,
      ownCommitment: this._ownCommitment,
      sentShots: this.sentShots.map((s) => ({ ...s })),
      receivedShots: this.receivedShots.map((s) => ({ ...s })),
      turn: this._turn,
      phase: this._phase,
    };
  }

  /** Replace local view with snapshot. Used after reconnect when our
   * snapshot loses the timestamp tiebreak vs. the peer's. */
  loadSnapshot(snap: SessionSnapshot): void {
    if (snap.protocolVersion !== PROTOCOL_VERSION) return;
    this._opponentCommitment = snap.opponentCommitment;
    this._ownCommitment = snap.ownCommitment;
    this._turn = snap.turn;
    this._phase = snap.phase;
    this.sentShots.length = 0;
    this.sentShots.push(...snap.sentShots.map((s) => ({ ...s })));
    this.receivedShots.length = 0;
    this.receivedShots.push(...snap.receivedShots.map((s) => ({ ...s })));
    this.nextSeq = Math.max(
      this.nextSeq,
      ...snap.sentShots.map((s) => s.seq + 1),
      1,
    );
    this.emit({ kind: 'phaseChanged', phase: this._phase });
    this.emit({ kind: 'turnChanged', turn: this._turn });
  }

  // ---- internals --------------------------------------------------------

  private maybeStartPlacing(): void {
    if (this._phase !== 'lobby') return;
    if (!this._ownCommitment || !this._opponentCommitment) return;
    this._turn = decideFirstTurn(this._ownCommitment, this._opponentCommitment, this.opts.side);
    this.transitionTo('placing');
    this.emit({ kind: 'turnChanged', turn: this._turn });
  }

  private maybeStartPlaying(): void {
    if (this._phase !== 'placing') return;
    if (!this._ownPlaced || !this._opponentPlaced) return;
    this.transitionTo('playing');
  }

  private flipTurn(): void {
    this._turn = this._turn === 'host' ? 'guest' : 'host';
    this.emit({ kind: 'turnChanged', turn: this._turn });
  }

  private async maybeFinishVerification(): Promise<void> {
    if (!this._opponentReveal) return;
    if (!this._opponentCommitment) return;
    const ok = await verifyCommitment(
      this._opponentReveal.units,
      this._opponentReveal.nonce,
      this._opponentCommitment,
    );
    if (!ok) {
      const outcome: VerificationOutcome = { reason: 'commitment-mismatch' };
      this.emit({ kind: 'verificationComplete', outcome });
      this.send({ t: 'verifyResult', ok: false, reason: 'commitment-mismatch' });
      this.transitionTo('ended');
      return;
    }
    // Replay every shotResult we received against the revealed grid.
    const replayShots = this.sentShots
      .filter((s) => s.result !== undefined)
      .map((s) => ({
        seq: s.seq,
        cell: s.cell,
        result: s.result!,
        cascades: s.cascades ?? [],
      }));
    const outcome = replayAgainstReveal(this._opponentReveal.units, replayShots);
    this.emit({ kind: 'verificationComplete', outcome });
    this.send({
      t: 'verifyResult',
      ok: outcome.reason === 'ok',
      reason: outcome.reason,
    });
    this.transitionTo('ended');
  }

  private transitionTo(next: SessionPhase): void {
    if (this._phase === next) return;
    this._phase = next;
    this.emit({ kind: 'phaseChanged', phase: next });
  }

  private emit(e: SessionEvent): void {
    for (const l of this.listeners) l(e);
  }
}

/**
 * Deterministic first-turn selection. Both peers feed the two
 * commitments (which they both know) plus their own side identifier.
 * They XOR the first byte of each hex digest and pick host/guest by
 * parity — both end up agreeing without further exchange.
 */
export function decideFirstTurn(
  ownCommitment: string,
  opponentCommitment: string,
  ownSide: Side,
): Side {
  void ownSide; // both peers must agree → output cannot depend on ownSide
  const a = parseInt(ownCommitment.slice(0, 2), 16) || 0;
  const b = parseInt(opponentCommitment.slice(0, 2), 16) || 0;
  return ((a ^ b) & 1) === 0 ? 'host' : 'guest';
}
