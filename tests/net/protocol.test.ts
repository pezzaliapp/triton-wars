import { describe, expect, it } from 'vitest';
import {
  decode,
  encode,
  isCompatibleVersion,
  PROTOCOL_VERSION,
  type NetMessage,
} from '../../src/net/protocol';

describe('protocol encode/decode', () => {
  it('round-trips every message kind', () => {
    const samples: NetMessage[] = [
      { t: 'hello', protocolVersion: PROTOCOL_VERSION, nick: 'Aly' },
      { t: 'ready' },
      { t: 'commit', commitment: 'ab'.repeat(32) },
      { t: 'placed' },
      { t: 'shot', seq: 7, cell: { x: 3, z: 4, layer: 2 } },
      {
        t: 'shotResult',
        seq: 7,
        result: 'sunk',
        cascades: [
          { cell: { x: 4, z: 4, layer: 2 }, result: 'miss' },
        ],
      },
      {
        t: 'reveal',
        units: [{ typeId: 'caccia', anchor: { x: 1, z: 2 }, orientation: 'x' }],
        nonce: 'abcd',
      },
      { t: 'verifyResult', ok: true },
      { t: 'snapshotReq' },
      { t: 'ping', ts: 12345 },
      { t: 'pong', ts: 12345 },
      { t: 'forfeit' },
    ];
    for (const msg of samples) {
      const got = decode(encode(msg));
      expect(got).toEqual(msg);
    }
  });

  it('rejects malformed JSON', () => {
    expect(() => decode('{not json')).toThrow(/invalid JSON/);
  });

  it('rejects unknown message kinds', () => {
    expect(() => decode(JSON.stringify({ t: 'attack', x: 1 }))).toThrow(/unknown kind/);
  });

  it('rejects messages without a tag', () => {
    expect(() => decode(JSON.stringify({ x: 1 }))).toThrow(/missing tag/);
    expect(() => decode(JSON.stringify(null))).toThrow(/missing tag/);
  });

  it('flags incompatible protocol versions', () => {
    expect(isCompatibleVersion(PROTOCOL_VERSION)).toBe(true);
    expect(isCompatibleVersion(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isCompatibleVersion(0)).toBe(false);
  });
});
