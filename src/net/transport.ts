/**
 * Abstract transport for Triton Wars online multiplayer.
 *
 * The whole netcode (protocol + session + orchestrator) is written
 * against the Transport interface, never against Trystero directly.
 * This keeps the orchestrator pure-TS testable: tests use an in-memory
 * pair of LoopbackTransports, prod wires up TrysteroTransport.
 *
 * Trystero default strategy is Nostr — public relays, zero account,
 * zero recurring cost. Game payload is end-to-end on a WebRTC data
 * channel; the relay only carries WebRTC SDP for handshake.
 */
import type { NetMessage } from './protocol';
import { encode, decode } from './protocol';

export type TransportEvent =
  | { kind: 'peerJoin'; peerId: string }
  | { kind: 'peerLeave'; peerId: string }
  | { kind: 'message'; peerId: string; msg: NetMessage }
  | { kind: 'error'; error: Error };

export type TransportListener = (e: TransportEvent) => void;

export interface Transport {
  /** Stable id of the local peer. */
  readonly selfId: string;
  /** Currently connected peer ids (excluding self). */
  peers(): string[];
  /** Send a message to one peer or to all peers if peerId is null. */
  send(msg: NetMessage, peerId: string | null): Promise<void>;
  /** Subscribe to transport events. Returns an unsubscribe handle. */
  subscribe(l: TransportListener): () => void;
  /** Tear down — leave the room, close sockets. */
  destroy(): Promise<void>;
}

// ---- Trystero implementation --------------------------------------------

export interface TrysteroTransportOptions {
  /** Stable app id — namespaces our rooms apart from other Trystero apps. */
  appId: string;
  /** Lobby code — both peers must use the same to find each other. */
  roomId: string;
}

export async function createTrysteroTransport(
  opts: TrysteroTransportOptions,
): Promise<Transport> {
  // Dynamic import keeps trystero out of the singleplayer code path so
  // the menu screen (and offline PWA boot) never pull the library.
  const { joinRoom, selfId } = await import('trystero');
  const room = joinRoom({ appId: opts.appId }, opts.roomId);

  const [sendRaw, onRaw] = room.makeAction<string>('msg');
  const listeners = new Set<TransportListener>();
  const emit = (e: TransportEvent): void => {
    for (const l of listeners) l(e);
  };

  room.onPeerJoin((peerId) => emit({ kind: 'peerJoin', peerId }));
  room.onPeerLeave((peerId) => emit({ kind: 'peerLeave', peerId }));
  onRaw((data, peerId) => {
    try {
      const msg = decode(data);
      emit({ kind: 'message', peerId, msg });
    } catch (err) {
      emit({ kind: 'error', error: err instanceof Error ? err : new Error(String(err)) });
    }
  });

  return {
    selfId,
    peers(): string[] {
      return Object.keys(room.getPeers());
    },
    async send(msg: NetMessage, peerId: string | null): Promise<void> {
      const payload = encode(msg);
      await sendRaw(payload, peerId ?? undefined);
    },
    subscribe(l: TransportListener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async destroy(): Promise<void> {
      listeners.clear();
      await room.leave();
    },
  };
}

// ---- Loopback (testing) -------------------------------------------------

/**
 * In-memory transport pair for tests and local end-to-end runs.
 * createLoopbackPair() returns two Transports wired to each other
 * synchronously (microtask delivery to keep tests deterministic).
 */
export function createLoopbackPair(): [Transport, Transport] {
  const [a, b] = createLoopbackRoom(2, ['peer-a', 'peer-b']);
  return [a, b];
}

/**
 * In-memory N-peer room for hard-cap / multi-peer rejection tests. All
 * peers see each other's join/leave/messages; targeted sends honour the
 * peerId argument.
 */
export function createLoopbackRoom(
  count: number,
  ids?: string[],
): Transport[] {
  const peers: LoopbackTransport[] = [];
  for (let i = 0; i < count; i++) {
    const id = ids?.[i] ?? `peer-${String.fromCharCode(97 + i)}`;
    peers.push(new LoopbackTransport(id));
  }
  for (const p of peers) {
    for (const other of peers) {
      if (other === p) continue;
      p.linkPeer(other);
    }
  }
  // Defer all peerJoin emissions to microtasks so listeners attached after
  // construction still see them — matches createLoopbackPair semantics.
  for (const p of peers) p.flushInitialJoins();
  return peers;
}

class LoopbackTransport implements Transport {
  readonly selfId: string;
  private readonly peers_ = new Map<string, LoopbackTransport>();
  private readonly listeners = new Set<TransportListener>();
  private destroyed = false;
  private readonly pendingJoins: string[] = [];

  constructor(id: string) {
    this.selfId = id;
  }

  /** Internal — register a sibling without emitting yet. */
  linkPeer(other: LoopbackTransport): void {
    this.peers_.set(other.selfId, other);
    this.pendingJoins.push(other.selfId);
  }

  /** Internal — emit all queued peerJoin events on a microtask. */
  flushInitialJoins(): void {
    const queued = this.pendingJoins.splice(0);
    queueMicrotask(() => {
      if (this.destroyed) return;
      for (const id of queued) this.emit({ kind: 'peerJoin', peerId: id });
    });
  }

  peers(): string[] {
    return [...this.peers_.values()]
      .filter((p) => !p.destroyed)
      .map((p) => p.selfId);
  }

  async send(msg: NetMessage, peerId: string | null): Promise<void> {
    if (this.destroyed) return;
    const targets =
      peerId === null
        ? [...this.peers_.values()].filter((p) => !p.destroyed)
        : [this.peers_.get(peerId)].filter(
            (p): p is LoopbackTransport => !!p && !p.destroyed,
          );
    const fromId = this.selfId;
    for (const target of targets) {
      const peer = target;
      queueMicrotask(() => {
        if (peer.destroyed) return;
        peer.emit({ kind: 'message', peerId: fromId, msg });
      });
    }
  }

  subscribe(l: TransportListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const peers = [...this.peers_.values()];
    this.peers_.clear();
    this.listeners.clear();
    for (const peer of peers) {
      if (peer.destroyed) continue;
      const id = this.selfId;
      queueMicrotask(() => peer.emit({ kind: 'peerLeave', peerId: id }));
    }
  }

  private emit(e: TransportEvent): void {
    for (const l of this.listeners) l(e);
  }
}
