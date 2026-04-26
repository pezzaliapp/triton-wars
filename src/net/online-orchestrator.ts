/**
 * OnlineOrchestrator — wires Transport ↔ OnlineSession ↔ ReconnectController.
 *
 * Higher layers (the app boot in main.ts and OnlineMatchController) interact
 * only with this orchestrator: subscribe to events, call commit/place/fire/
 * forfeit, get verification outcome at the end.
 *
 * Resolving incoming attacks: the orchestrator receives a NetCell from
 * the opponent and must turn it into a real outcome on our defending
 * grid. We accept a `resolveAttack` callback so this module stays free
 * of any GameState dependency, which keeps it unit-testable.
 *
 * Hard-cap on peers: a Trystero room can in theory have N peers. Triton
 * Wars is strictly 1v1, so the orchestrator locks `partnerPeerId` on the
 * first incoming hello and rejects anyone else with a `roomFull` frame.
 * The lock survives reconnects of the partner.
 */
import type { NetMessage, SerializedUnit, NetCell, Side, RoomFullStage } from './protocol';
import type { Transport, TransportListener } from './transport';
import { OnlineSession, type ResolveAttack, type SessionEvent } from './session';
import { ReconnectController, type ReconnectEvent } from './reconnect';

export interface OrchestratorOptions {
  transport: Transport;
  side: Side;
  nick: string;
  resolveAttack: ResolveAttack;
  getOwnUnits: () => SerializedUnit[];
  /** Override-able for tests. */
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => () => void;
  pingIntervalMs?: number;
  reconnectGraceMs?: number;
}

export type OrchestratorEvent =
  | SessionEvent
  | ReconnectEvent
  | { kind: 'transportError'; error: Error }
  /** Host pressed "Inizia partita" — both peers can now move into placement. */
  | { kind: 'matchStarting' }
  /** Host parked us in stand-by while deciding. expiresAt is a wall-clock ms. */
  | { kind: 'standby'; expiresAt: number }
  /** A third peer tried to enter our room and was kicked out. */
  | { kind: 'thirdPeerRejected'; peerId: string; stage: RoomFullStage }
  /** The remote peer told us the room is taken (we are the third one). */
  | { kind: 'rejectedByPeer'; stage: RoomFullStage };

export type OrchestratorListener = (e: OrchestratorEvent) => void;

export class OnlineOrchestrator {
  readonly session: OnlineSession;
  readonly reconnect: ReconnectController;

  private readonly transportUnsub: () => void;
  private readonly sessionUnsub: () => void;
  private readonly reconnectUnsub: () => void;
  private readonly listeners = new Set<OrchestratorListener>();
  private destroyed = false;

  /** First peer that talked our protocol becomes the partner. Locked for
   * the lifetime of the orchestrator (survives reconnects of the same id). */
  private partnerPeerId: string | null = null;
  /** Set to true once the host (or remote, on the guest side) has signalled
   * 'startMatch'. From that moment a third peer is rejected with stage=locked. */
  private roomLocked = false;

  constructor(private readonly opts: OrchestratorOptions) {
    const send = (msg: NetMessage): void => this.sendOut(msg);
    this.session = new OnlineSession(
      {
        side: opts.side,
        nick: opts.nick,
        resolveAttack: opts.resolveAttack,
        getOwnUnits: opts.getOwnUnits,
      },
      send,
    );
    this.reconnect = new ReconnectController(this.session, send, {
      now: opts.now,
      setTimer: opts.setTimer,
      pingIntervalMs: opts.pingIntervalMs,
      reconnectGraceMs: opts.reconnectGraceMs,
    });

    const onTransport: TransportListener = (e) => {
      if (this.destroyed) return;
      switch (e.kind) {
        case 'peerJoin':
          this.handlePeerJoin(e.peerId);
          return;
        case 'peerLeave':
          this.handlePeerLeave(e.peerId);
          return;
        case 'message':
          this.handleIncoming(e.peerId, e.msg);
          return;
        case 'error':
          this.emit({ kind: 'transportError', error: e.error });
          return;
      }
    };
    this.transportUnsub = opts.transport.subscribe(onTransport);
    this.sessionUnsub = this.session.subscribe((ev) => this.emit(ev));
    this.reconnectUnsub = this.reconnect.subscribe((ev) => this.emit(ev));

    // If the transport already has a peer connected at construction time
    // (loopback test path), broadcast hello so the other side can lock us
    // in as their partner. Our own lock fires when their hello arrives.
    if (opts.transport.peers().length > 0) {
      this.session.sayHello();
    }
  }

  subscribe(l: OrchestratorListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  async commit(): Promise<void> {
    await this.session.commit();
  }

  notifyPlaced(): void {
    this.session.notifyPlaced();
  }

  fireShot(cell: NetCell): number | null {
    return this.session.fireShot(cell);
  }

  async reveal(): Promise<void> {
    await this.session.reveal();
  }

  forfeit(): void {
    this.session.forfeit();
  }

  /** Host calls this when pressing "Inizia partita" — locks the room and
   * tells the partner to switch to placement. */
  signalStartMatch(): void {
    if (this.roomLocked) return;
    this.roomLocked = true;
    this.sendOut({ t: 'startMatch' });
    this.emit({ kind: 'matchStarting' });
  }

  /** Host calls this when pressing "Aspetta" — keeps the partner around but
   * tells them they're in stand-by until expiresAt (wall-clock ms). */
  signalStandby(durationMs: number): void {
    const expiresAt = (this.opts.now?.() ?? Date.now()) + durationMs;
    this.sendOut({ t: 'standby', expiresAt });
  }

  /** Whether the room is locked to the current partner (post-startMatch). */
  get isRoomLocked(): boolean {
    return this.roomLocked;
  }

  /** The locked partner's peer id, or null if still open. */
  get currentPartnerPeerId(): string | null {
    return this.partnerPeerId;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.transportUnsub();
    this.sessionUnsub();
    this.reconnectUnsub();
    this.reconnect.destroy();
    this.listeners.clear();
    await this.opts.transport.destroy();
  }

  // ---- internals --------------------------------------------------------

  private sendOut(msg: NetMessage): void {
    // Once locked, target the partner specifically. Before lock we have no
    // partner id yet (first hello hasn't been received) so we broadcast —
    // only honest peers in our room can reach us anyway.
    void this.opts.transport.send(msg, this.partnerPeerId);
  }

  private handlePeerJoin(peerId: string): void {
    if (this.partnerPeerId === peerId) {
      // Our partner came back after a drop — re-arm reconnect + greet again.
      this.reconnect.onPeerJoin();
      this.session.sayHello();
      return;
    }
    if (this.partnerPeerId === null) {
      // No partner locked yet. Broadcast hello so this new peer can pick us
      // up; their reciprocal hello will lock the partner slot.
      this.session.sayHello();
      return;
    }
    // We already have a partner — kick this third peer out.
    this.rejectPeer(peerId);
  }

  private handlePeerLeave(peerId: string): void {
    if (peerId === this.partnerPeerId) {
      this.reconnect.onPeerLeave();
    }
    // Else: a non-partner left (probably a third peer we just rejected) —
    // nothing to clean up at the orchestrator level.
  }

  private handleIncoming(peerId: string, msg: NetMessage): void {
    // Receiving roomFull means the other side already had a partner and
    // locked us out. Surface the rejection so the UI can return to menu.
    if (msg.t === 'roomFull') {
      this.emit({ kind: 'rejectedByPeer', stage: msg.stage });
      return;
    }

    if (this.partnerPeerId === null) {
      // First contact — only a hello can promote a peer to partner. Anything
      // else before hello is dropped (would be a protocol race).
      if (msg.t === 'hello') {
        this.partnerPeerId = peerId;
        this.reconnect.onPeerJoin();
        void this.session.handleMessage(msg);
      }
      return;
    }

    if (peerId !== this.partnerPeerId) {
      // A third peer is trying to play after our partner is locked. Reply
      // with roomFull so they see a clear "Stanza piena" state instead of
      // an unexplained timeout.
      this.rejectPeer(peerId);
      return;
    }

    // Lobby-flow control plane ----------------------------------------------
    if (msg.t === 'startMatch') {
      if (!this.roomLocked) {
        this.roomLocked = true;
        this.emit({ kind: 'matchStarting' });
      }
      return;
    }
    if (msg.t === 'standby') {
      this.emit({ kind: 'standby', expiresAt: msg.expiresAt });
      return;
    }

    // Game-flow / liveness — forward to reconnect + session as before.
    this.reconnect.handleMessage(msg);
    void this.session.handleMessage(msg);
  }

  private rejectPeer(peerId: string): void {
    const stage: RoomFullStage = this.roomLocked ? 'locked' : 'pending';
    void this.opts.transport.send({ t: 'roomFull', stage }, peerId);
    this.emit({ kind: 'thirdPeerRejected', peerId, stage });
  }

  private emit(e: OrchestratorEvent): void {
    for (const l of this.listeners) l(e);
  }
}
