/**
 * Commit-reveal anti-cheat for Triton Wars.
 *
 * The flow:
 *  1. Each player serialises their fleet deterministically.
 *  2. Generates a 32-byte random nonce.
 *  3. Hashes (canonicalSerialize(units) + ':' + nonce) with SHA-256.
 *  4. Sends the digest to the opponent BEFORE any shot is fired.
 *  5. At end of game, both peers reveal (units, nonce). The opponent
 *     recomputes the hash and verifies equality + replays every
 *     received shotResult against the revealed grid.
 *
 * The game is honest if and only if commitment matches and every
 * declared result (miss/hit/sunk) is consistent with the revealed
 * fleet. Anything else flags 'cheating detected'.
 *
 * SHA-256 + crypto.getRandomValues come from Web Crypto, which is
 * available both in modern browsers and in Node 20+ (Vitest runtime).
 */
import type { SerializedUnit, NetCell, NetCascade } from './protocol';
import { computeCells, cellKey } from '../game/units/unit';
import { getUnitType } from '../game/units/definitions';
import type { AttackResult } from '../game/rules/attack';

const NONCE_BYTES = 32;

/** Returns a hex-encoded random nonce. */
export function generateNonce(): string {
  const buf = new Uint8Array(NONCE_BYTES);
  cryptoRef().getRandomValues(buf);
  return toHex(buf);
}

/**
 * Canonical serialisation of a fleet for hashing. Sort by typeId then
 * anchor.x, anchor.z, orientation so two clients with the same logical
 * fleet always produce the same string regardless of placement order.
 */
export function canonicalSerialize(units: SerializedUnit[]): string {
  const sorted = [...units].sort((a, b) => {
    if (a.typeId !== b.typeId) return a.typeId < b.typeId ? -1 : 1;
    if (a.anchor.x !== b.anchor.x) return a.anchor.x - b.anchor.x;
    if (a.anchor.z !== b.anchor.z) return a.anchor.z - b.anchor.z;
    return a.orientation < b.orientation ? -1 : a.orientation > b.orientation ? 1 : 0;
  });
  return JSON.stringify(
    sorted.map((u) => [u.typeId, u.anchor.x, u.anchor.z, u.orientation]),
  );
}

/** SHA-256(canonicalSerialize(units) + ':' + nonce), hex-encoded. */
export async function computeCommitment(
  units: SerializedUnit[],
  nonce: string,
): Promise<string> {
  const payload = canonicalSerialize(units) + ':' + nonce;
  const bytes = new TextEncoder().encode(payload);
  const digest = await cryptoRef().subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

/** True iff hash(units, nonce) === expected. */
export async function verifyCommitment(
  units: SerializedUnit[],
  nonce: string,
  expected: string,
): Promise<boolean> {
  const got = await computeCommitment(units, nonce);
  return constantTimeEqual(got, expected);
}

export interface VerificationFailure {
  reason: 'commitment-mismatch' | 'shot-result-tampered';
  /** For shot-result-tampered: which seq number broke. */
  seq?: number;
  /** Expected vs declared result for diagnostics. */
  expectedResult?: Exclude<AttackResult, 'already'>;
  declaredResult?: Exclude<AttackResult, 'already'>;
}

export interface VerificationOk {
  reason: 'ok';
}

export type VerificationOutcome = VerificationOk | VerificationFailure;

/**
 * Replay every shotResult the opponent sent us against the now-revealed
 * fleet. If any declared result diverges from what the revealed grid
 * would have produced, return 'shot-result-tampered'.
 *
 * Pre-condition: commitment has already been verified — this is the
 * second half of end-of-game integrity check.
 */
export function replayAgainstReveal(
  revealedUnits: SerializedUnit[],
  shots: ReadonlyArray<{
    seq: number;
    cell: NetCell;
    result: Exclude<AttackResult, 'already'>;
    cascades: NetCascade[];
  }>,
): VerificationOutcome {
  const sim = new SimulatedDefender(revealedUnits);
  for (const s of shots) {
    const expected = sim.fire(s.cell);
    if (expected.result !== s.result) {
      return {
        reason: 'shot-result-tampered',
        seq: s.seq,
        expectedResult: expected.result,
        declaredResult: s.result,
      };
    }
  }
  return { reason: 'ok' };
}

/**
 * Minimal defender simulator, mirroring resolveAttack semantics but
 * stateless across instances. Used only by replayAgainstReveal.
 */
class SimulatedDefender {
  private readonly cellOwner = new Map<string, number>();
  private readonly hits: Set<string>[] = [];
  private readonly sunk: boolean[] = [];
  private readonly unitCellCount: number[] = [];
  private readonly shots = new Set<string>();

  constructor(units: SerializedUnit[]) {
    units.forEach((u, idx) => {
      const type = getUnitType(u.typeId);
      const cells = computeCells(type.layer, type.length, u.anchor, u.orientation);
      this.hits.push(new Set<string>());
      this.sunk.push(false);
      this.unitCellCount.push(cells.length);
      for (const c of cells) {
        this.cellOwner.set(cellKey(c.layer, c.x, c.z), idx);
      }
    });
  }

  fire(cell: NetCell): { result: Exclude<AttackResult, 'already'> } {
    const k = cellKey(cell.layer, cell.x, cell.z);
    if (this.shots.has(k)) {
      // Defender treats double-shot as 'miss' for replay parity — the
      // honest path never generates 'already' over the wire.
      return { result: 'miss' };
    }
    this.shots.add(k);
    const ownerIdx = this.cellOwner.get(k);
    if (ownerIdx === undefined) return { result: 'miss' };
    this.hits[ownerIdx]!.add(k);
    if (this.hits[ownerIdx]!.size >= this.unitCellCount[ownerIdx]!) {
      this.sunk[ownerIdx] = true;
      return { result: 'sunk' };
    }
    return { result: 'hit' };
  }
}

// ---- internals -----------------------------------------------------------

function cryptoRef(): Crypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('Web Crypto not available');
  return c;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}
