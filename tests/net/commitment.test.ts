import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  computeCommitment,
  generateNonce,
  replayAgainstReveal,
  verifyCommitment,
} from '../../src/net/commitment';
import type { SerializedUnit } from '../../src/net/protocol';

const SAMPLE_FLEET: SerializedUnit[] = [
  { typeId: 'portaerei', anchor: { x: 0, z: 0 }, orientation: 'x' },
  { typeId: 'caccia', anchor: { x: 5, z: 5 }, orientation: 'x' },
  { typeId: 'mina', anchor: { x: 8, z: 8 }, orientation: 'x' },
];

describe('commitment.canonicalSerialize', () => {
  it('produces the same string regardless of input order', () => {
    const a = canonicalSerialize(SAMPLE_FLEET);
    const b = canonicalSerialize([...SAMPLE_FLEET].reverse());
    expect(a).toBe(b);
  });

  it('changes when a unit moves', () => {
    const moved: SerializedUnit[] = [
      ...SAMPLE_FLEET.slice(0, 2),
      { typeId: 'mina', anchor: { x: 9, z: 9 }, orientation: 'x' },
    ];
    expect(canonicalSerialize(SAMPLE_FLEET)).not.toBe(canonicalSerialize(moved));
  });
});

describe('commitment.computeCommitment + verifyCommitment', () => {
  it('verifies a matching reveal', async () => {
    const nonce = generateNonce();
    const digest = await computeCommitment(SAMPLE_FLEET, nonce);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyCommitment(SAMPLE_FLEET, nonce, digest)).toBe(true);
  });

  it('rejects a tampered fleet', async () => {
    const nonce = generateNonce();
    const digest = await computeCommitment(SAMPLE_FLEET, nonce);
    const tampered: SerializedUnit[] = [
      ...SAMPLE_FLEET.slice(0, 2),
      { typeId: 'mina', anchor: { x: 0, z: 0 }, orientation: 'x' },
    ];
    expect(await verifyCommitment(tampered, nonce, digest)).toBe(false);
  });

  it('rejects a swapped nonce', async () => {
    const nonce = generateNonce();
    const other = generateNonce();
    const digest = await computeCommitment(SAMPLE_FLEET, nonce);
    expect(await verifyCommitment(SAMPLE_FLEET, other, digest)).toBe(false);
  });
});

describe('commitment.replayAgainstReveal', () => {
  it('returns ok when every shot matches the revealed grid', () => {
    const shots = [
      // miss — empty cell
      { seq: 1, cell: { x: 9, z: 0, layer: 2 }, result: 'miss' as const, cascades: [] },
      // hit on portaerei (length 5 starting at 0,0 surface, orientation x)
      { seq: 2, cell: { x: 0, z: 0, layer: 2 }, result: 'hit' as const, cascades: [] },
    ];
    const out = replayAgainstReveal(SAMPLE_FLEET, shots);
    expect(out.reason).toBe('ok');
  });

  it('flags a tampered miss that should have been a hit', () => {
    // (0,0,layer 2) is the first cell of the portaerei — declaring miss is a lie.
    const shots = [
      { seq: 1, cell: { x: 0, z: 0, layer: 2 }, result: 'miss' as const, cascades: [] },
    ];
    const out = replayAgainstReveal(SAMPLE_FLEET, shots);
    expect(out.reason).toBe('shot-result-tampered');
    expect(out.seq).toBe(1);
  });
});
