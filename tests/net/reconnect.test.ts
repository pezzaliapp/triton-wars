import { describe, expect, it } from 'vitest';
import { OnlineSession } from '../../src/net/session';
import { ReconnectController, type ReconnectEvent } from '../../src/net/reconnect';
import type { NetMessage, SerializedUnit } from '../../src/net/protocol';

const FLEET: SerializedUnit[] = [
  { typeId: 'caccia', anchor: { x: 0, z: 0 }, orientation: 'x' },
];

interface FakeClock {
  now: () => number;
  advance: (ms: number) => void;
  setTimer: (cb: () => void, ms: number) => () => void;
}

function makeFakeClock(): FakeClock {
  let t = 0;
  type Pending = { fireAt: number; cb: () => void; cancelled: boolean };
  const pending: Pending[] = [];
  return {
    now: () => t,
    advance(ms: number) {
      const target = t + ms;
      // Fire timers in order — re-scheduling within a callback adds new
      // entries that we'll pick up on subsequent iterations.
      while (true) {
        const next = pending.find((p) => !p.cancelled && p.fireAt <= target);
        if (!next) break;
        t = next.fireAt;
        next.cancelled = true;
        next.cb();
      }
      t = target;
    },
    setTimer(cb, ms) {
      const entry: Pending = { fireAt: t + ms, cb, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };
}

function makePair(clock: FakeClock) {
  const sentA: NetMessage[] = [];
  const sentB: NetMessage[] = [];
  const sessionA = new OnlineSession(
    {
      side: 'host',
      nick: 'A',
      resolveAttack: () => ({ result: 'miss', cascades: [] }),
      getOwnUnits: () => FLEET,
    },
    (m) => sentA.push(m),
  );
  const sessionB = new OnlineSession(
    {
      side: 'guest',
      nick: 'B',
      resolveAttack: () => ({ result: 'miss', cascades: [] }),
      getOwnUnits: () => FLEET,
    },
    (m) => sentB.push(m),
  );
  const eventsA: ReconnectEvent[] = [];
  const eventsB: ReconnectEvent[] = [];
  const reconnectA = new ReconnectController(sessionA, (m) => sentA.push(m), {
    now: clock.now,
    setTimer: clock.setTimer,
    pingIntervalMs: 1000,
    reconnectGraceMs: 5000,
    missedPongThreshold: 3,
  });
  const reconnectB = new ReconnectController(sessionB, (m) => sentB.push(m), {
    now: clock.now,
    setTimer: clock.setTimer,
    pingIntervalMs: 1000,
    reconnectGraceMs: 5000,
    missedPongThreshold: 3,
  });
  reconnectA.subscribe((e) => eventsA.push(e));
  reconnectB.subscribe((e) => eventsB.push(e));
  return { sessionA, sessionB, sentA, sentB, eventsA, eventsB, reconnectA, reconnectB };
}

describe('ReconnectController heartbeat', () => {
  it('flags peer unresponsive after N missed pongs', () => {
    const clock = makeFakeClock();
    const { reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    // 3 ping intervals with no pong → unresponsive
    clock.advance(1000); // ping #1
    clock.advance(1000); // ping #2
    clock.advance(1000); // ping #3 → threshold hit
    expect(eventsA.find((e) => e.kind === 'peerUnresponsive')).toBeDefined();
  });

  it('emits heartbeatMissed with count + threshold on every missed pong', () => {
    const clock = makeFakeClock();
    const { reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    clock.advance(1000); // miss 1
    clock.advance(1000); // miss 2
    clock.advance(1000); // miss 3 → threshold
    const misses = eventsA.filter((e) => e.kind === 'heartbeatMissed') as {
      kind: 'heartbeatMissed'; missed: number; threshold: number;
    }[];
    expect(misses.map((m) => m.missed)).toEqual([1, 2, 3]);
    expect(misses.every((m) => m.threshold === 3)).toBe(true);
  });

  it('emits peerResponsive on pong recovery before reaching threshold', () => {
    const clock = makeFakeClock();
    const { reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    clock.advance(1000); // miss 1
    clock.advance(1000); // miss 2 (still below threshold of 3)
    reconnectA.handleMessage({ t: 'pong', ts: 0 });
    const responsives = eventsA.filter((e) => e.kind === 'peerResponsive');
    expect(responsives.length).toBeGreaterThanOrEqual(1);
  });

  it('resets missed counter on pong', () => {
    const clock = makeFakeClock();
    const { reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    clock.advance(1000);
    clock.advance(1000);
    reconnectA.handleMessage({ t: 'pong', ts: 0 });
    clock.advance(1000);
    clock.advance(1000);
    // Two missed pongs after the reset, still under threshold of 3.
    expect(eventsA.find((e) => e.kind === 'peerUnresponsive')).toBeUndefined();
  });
});

describe('ReconnectController grace window', () => {
  it('emits reconnectExpired after grace ms with no rejoin', () => {
    const clock = makeFakeClock();
    const { reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    reconnectA.onPeerLeave();
    clock.advance(5000);
    expect(eventsA.find((e) => e.kind === 'reconnectExpired')).toBeDefined();
  });

  it('cancels expiry if peer rejoins in time', () => {
    const clock = makeFakeClock();
    const { reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    reconnectA.onPeerLeave();
    clock.advance(2000);
    reconnectA.onPeerJoin();
    clock.advance(10000);
    expect(eventsA.find((e) => e.kind === 'reconnectExpired')).toBeUndefined();
    expect(eventsA.find((e) => e.kind === 'peerRejoined')).toBeDefined();
  });
});

describe('ReconnectController snapshot exchange (mismatch resolution)', () => {
  it('higher-timestamp snapshot wins over lower-timestamp local one', async () => {
    const clock = makeFakeClock();
    const { sessionA, reconnectA, eventsA, sentA } = makePair(clock);
    // Local A snapshot would be empty at t=0.
    // Simulate a remote snapshot from a peer whose clock is ahead AND has more state.
    reconnectA.onPeerJoin();
    sentA.length = 0; // ignore initial snapshot exchange noise
    // Trigger snapshot exchange by simulating a second join
    reconnectA.onPeerLeave();
    reconnectA.onPeerJoin();
    // Remote sends its snapshot with a later timestamp
    const remote = sessionA.serializeSnapshot(0);
    remote.timestamp = 9999;
    remote.phase = 'playing';
    remote.turn = 'guest';
    reconnectA.handleMessage({ t: 'snapshot', state: remote });
    expect(eventsA.find((e) => e.kind === 'snapshotApplied' && e.from === 'remote')).toBeDefined();
    expect(sessionA.phase).toBe('playing');
    expect(sessionA.turn).toBe('guest');
  });

  it('keeps local state when local snapshot has higher timestamp', () => {
    const clock = makeFakeClock();
    const { sessionA, reconnectA, eventsA } = makePair(clock);
    reconnectA.onPeerJoin();
    reconnectA.onPeerLeave();
    clock.advance(1000); // local time advances
    reconnectA.onPeerJoin();
    // Remote sends an older snapshot
    const remote = sessionA.serializeSnapshot(0);
    remote.timestamp = 50;
    remote.phase = 'ended';
    reconnectA.handleMessage({ t: 'snapshot', state: remote });
    expect(eventsA.find((e) => e.kind === 'snapshotApplied' && e.from === 'self')).toBeDefined();
    // Phase should NOT have been overwritten with 'ended' from the stale remote snapshot.
    expect(sessionA.phase).not.toBe('ended');
  });
});
