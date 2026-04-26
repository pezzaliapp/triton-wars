/**
 * Room codes look like TRITON-XXXX-XXXX (8 base32 chars without ambiguous
 * glyphs: no 0/O, no 1/I/L). 8 chars over a 32-symbol alphabet ≈ 1e12
 * combinations — collision risk is negligible for hand-shared lobbies and
 * the codes stay short enough to type from a phone.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const BLOCK_LEN = 4;
const BLOCKS = 2;
const PREFIX = 'TRITON-';
const CODE_RE = /^TRITON-[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/;

export function generateRoomCode(): string {
  const buf = new Uint8Array(BLOCK_LEN * BLOCKS);
  globalThis.crypto.getRandomValues(buf);
  const blocks: string[] = [];
  for (let b = 0; b < BLOCKS; b++) {
    let s = '';
    for (let i = 0; i < BLOCK_LEN; i++) {
      s += ALPHABET[buf[b * BLOCK_LEN + i]! % ALPHABET.length];
    }
    blocks.push(s);
  }
  return PREFIX + blocks.join('-');
}

export function isValidRoomCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Best-effort normalisation: uppercase + strip whitespace + map common
 * lookalikes the user might type by mistake (O→0 doesn't apply here
 * because 0 isn't in the alphabet — instead we map O to 0... no, scratch:
 * O is not in alphabet, neither is 0; we drop them and let validation
 * reject). We only do safe transforms. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

/** Build a deep-link URL that the other player can paste into a browser. */
export function shareableLink(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', code);
  return url.toString();
}

/** Read ?room=… from the current URL, returning a normalised code if present. */
export function readRoomFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  if (!raw) return null;
  const normalised = normalizeRoomCode(raw);
  return isValidRoomCode(normalised) ? normalised : null;
}
