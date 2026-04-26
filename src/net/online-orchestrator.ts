/**
 * OnlineOrchestrator — wires Transport ↔ OnlineSession ↔ ReconnectController.
 *
 * Higher layers (the app boot in main.ts and an OnlineMatchController to
 * follow) interact only with this orchestrator: subscribe to events,
 * call commit/place/fire/forfeit, get verification outcome at the end.
 *
 * Resolving incoming attacks: the orchestrator receives a NetCell from
 * the opponent and must turn it into a real outcome on our defending
 * grid. We accept a `resolveAttack` callback so this module stays free
 * of any GameState dependency, which keeps it unit-testable.
 */
import type { NetMessage, SerializedUnit, NetCell, Side } from './protocol';
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
  | { kind: 'transportError'; error: Error };

export type OrchestratorListener = (e: OrchestratorEvent) => void;

export class OnlineOrchestrator {
  readonly session: OnlineSession;
  readonly reconnect: ReconnectController;

  private readonly transportUnsub: () => void;
  private readonly sessionUnsub: () => void;
  private readonly reconnectUnsub: () => void;
  private readonly listeners = new Set<OrchestratorListener>();
  private destroyed = false;

  constructor(private readonly opts: OrchestratorOptions) {
    const send = (msg: NetMessage): void => {
      void opts.transport.send(msg, null);
    };
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
          this.reconnect.onPeerJoin();
          this.session.sayHello();
          return;
        case 'peerLeave':
          this.reconnect.onPeerLeave();
          return;
        case 'message':
          this.reconnect.handleMessage(e.msg);
          void this.session.handleMessage(e.msg);
          return;
        case 'error':
          this.emit({ kind: 'transportError', error: e.error });
          return;
      }
    };
    this.transportUnsub = opts.transport.subscribe(onTransport);
    this.sessionUnsub = this.session.subscribe((e) => this.emit(e));
    this.reconnectUnsub = this.reconnect.subscribe((e) => this.emit(e));

    // If the transport already has the peer connected at construction
    // time (loopback test path), kick the hello immediately.
    if (opts.transport.peers().length > 0) {
      this.reconnect.onPeerJoin();
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

  private emit(e: OrchestratorEvent): void {
    for (const l of this.listeners) l(e);
  }
}
