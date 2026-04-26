/**
 * Reconnect / liveness layer for OnlineSession.
 *
 * Two responsibilities:
 *   1. Heartbeat — periodic ping/pong. After N missed pongs, surface a
 *      'peer-unresponsive' event so the UI can display a banner. The
 *      grace window is a UI concern; this module just emits the signal.
 *
 *   2. Snapshot resume — when a peer reappears (peerJoin after peerLeave),
 *      both sides exchange their session snapshots. The one with the
 *      higher timestamp is treated as authoritative and the other side
 *      adopts it. This is how the *snapshot mismatch* edge case is
 *      handled: both peers may have made a local move during the gap,
 *      and we can't reliably reconcile two divergent histories without
 *      a server, so we pick the more recent one and let the older client
 *      catch up (their pending shot, if any, is dropped).
 *
 *      Justification for the timestamp tiebreak: if peer A took a shot
 *      and lost the connection before peer B saw it, A's local snapshot
 *      will have a *later* timestamp than B's pre-shot snapshot. Picking
 *      A's wins is correct. The reverse case (B replied but A didn't see
 *      the reply) also resolves correctly because B's later snapshot
 *      has the reply recorded.
 */
import type {
  NetMessage,
  SessionSnapshot,
} from './protocol';
import type { OnlineSession } from './session';

export interface ReconnectOptions {
  /** Ms between pings while connected. Default 5000. */
  pingIntervalMs?: number;
  /** Number of consecutive missed pongs before peer is reported unresponsive. */
  missedPongThreshold?: number;
  /** Ms after peerLeave before we treat the match as forfeited. */
  reconnectGraceMs?: number;
  /** Time source (override-able for tests). */
  now?: () => number;
  /** Used for ping interval scheduling (override-able for tests). */
  setTimer?: (cb: () => void, ms: number) => () => void;
}

export type ReconnectEvent =
  | { kind: 'peerUnresponsive' }
  | { kind: 'peerResponsive' }
  | { kind: 'peerLeft' }
  | { kind: 'peerRejoined' }
  | { kind: 'reconnectExpired' }
  | { kind: 'snapshotApplied'; from: 'self' | 'remote' }
  /** Fired on each missed pong, *including* the one that crosses the
   * threshold. UI can show "1/3 ... 2/3 ... 3/3" without needing to know
   * the threshold from elsewhere. */
  | { kind: 'heartbeatMissed'; missed: number; threshold: number };

export type ReconnectListener = (e: ReconnectEvent) => void;

const DEFAULTS = {
  pingIntervalMs: 5000,
  missedPongThreshold: 3,
  reconnectGraceMs: 30_000,
};

export class ReconnectController {
  private readonly listeners = new Set<ReconnectListener>();
  private pingTimer: (() => void) | null = null;
  private graceTimer: (() => void) | null = null;
  private missedPongs = 0;
  private peerOnline = false;
  private destroyed = false;
  private pendingRemoteSnapshot: SessionSnapshot | null = null;
  private snapshotSent = false;

  private readonly now: () => number;
  private readonly setTimer: NonNullable<ReconnectOptions['setTimer']>;
  private readonly pingIntervalMs: number;
  private readonly missedPongThreshold: number;
  private readonly reconnectGraceMs: number;

  constructor(
    private readonly session: OnlineSession,
    private readonly send: (msg: NetMessage) => void,
    opts: ReconnectOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? defaultSetTimer;
    this.pingIntervalMs = opts.pingIntervalMs ?? DEFAULTS.pingIntervalMs;
    this.missedPongThreshold = opts.missedPongThreshold ?? DEFAULTS.missedPongThreshold;
    this.reconnectGraceMs = opts.reconnectGraceMs ?? DEFAULTS.reconnectGraceMs;
  }

  subscribe(l: ReconnectListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Called by the orchestrator on transport peerJoin. */
  onPeerJoin(): void {
    const wasOffline = !this.peerOnline;
    this.peerOnline = true;
    this.missedPongs = 0;
    this.cancelGrace();
    if (wasOffline) {
      this.snapshotSent = false;
      this.pendingRemoteSnapshot = null;
      this.requestSnapshotExchange();
      this.emit({ kind: 'peerRejoined' });
    }
    this.startPingLoop();
  }

  /** Called by the orchestrator on transport peerLeave. */
  onPeerLeave(): void {
    this.peerOnline = false;
    this.stopPingLoop();
    this.emit({ kind: 'peerLeft' });
    this.graceTimer = this.setTimer(() => {
      this.graceTimer = null;
      if (!this.peerOnline) this.emit({ kind: 'reconnectExpired' });
    }, this.reconnectGraceMs);
  }

  /** Called by the orchestrator for every incoming message — we only
   * react to liveness/snapshot frames; the session handles the rest. */
  handleMessage(msg: NetMessage): void {
    switch (msg.t) {
      case 'ping':
        this.send({ t: 'pong', ts: msg.ts });
        return;
      case 'pong':
        if (this.missedPongs > 0) {
          this.missedPongs = 0;
          this.peerOnline = true;
          // Emit peerResponsive on any recovery (not only after we declared
          // unresponsive) so the UI can drop the heartbeat banner the
          // moment a pong returns, even mid-counter.
          this.emit({ kind: 'peerResponsive' });
        }
        return;
      case 'snapshotReq':
        this.sendOwnSnapshot();
        return;
      case 'snapshot':
        this.receiveSnapshot(msg.state);
        return;
      default:
        return;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopPingLoop();
    this.cancelGrace();
    this.listeners.clear();
  }

  // ---- internals --------------------------------------------------------

  private requestSnapshotExchange(): void {
    this.send({ t: 'snapshotReq' });
    this.sendOwnSnapshot();
  }

  private sendOwnSnapshot(): void {
    if (this.snapshotSent) return;
    this.snapshotSent = true;
    const state = this.session.serializeSnapshot(this.now());
    this.send({ t: 'snapshot', state });
    this.maybeReconcile();
  }

  private receiveSnapshot(remote: SessionSnapshot): void {
    this.pendingRemoteSnapshot = remote;
    this.maybeReconcile();
  }

  private maybeReconcile(): void {
    if (!this.snapshotSent || !this.pendingRemoteSnapshot) return;
    const own = this.session.serializeSnapshot(this.now());
    const remote = this.pendingRemoteSnapshot;
    this.pendingRemoteSnapshot = null;
    if (remote.timestamp > own.timestamp) {
      this.session.loadSnapshot(remote);
      this.emit({ kind: 'snapshotApplied', from: 'remote' });
    } else {
      this.emit({ kind: 'snapshotApplied', from: 'self' });
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    const tick = (): void => {
      if (this.destroyed || !this.peerOnline) return;
      this.send({ t: 'ping', ts: this.now() });
      this.missedPongs += 1;
      this.emit({
        kind: 'heartbeatMissed',
        missed: this.missedPongs,
        threshold: this.missedPongThreshold,
      });
      if (this.missedPongs === this.missedPongThreshold) {
        this.peerOnline = false;
        this.emit({ kind: 'peerUnresponsive' });
      }
      this.pingTimer = this.setTimer(tick, this.pingIntervalMs);
    };
    this.pingTimer = this.setTimer(tick, this.pingIntervalMs);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      this.pingTimer();
      this.pingTimer = null;
    }
  }

  private cancelGrace(): void {
    if (this.graceTimer) {
      this.graceTimer();
      this.graceTimer = null;
    }
  }

  private emit(e: ReconnectEvent): void {
    for (const l of this.listeners) l(e);
  }
}

function defaultSetTimer(cb: () => void, ms: number): () => void {
  const id = setTimeout(cb, ms);
  return () => clearTimeout(id);
}
