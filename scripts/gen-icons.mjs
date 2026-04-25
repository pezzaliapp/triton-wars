#!/usr/bin/env node
// Genera icone PNG placeholder per la PWA senza dipendenze esterne.
// Crea una griglia su sfondo blu profondo, in tinta col tema del gioco.
// Per la "maskable" lascia un padding del ~12% (safe area).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const BG = [11, 29, 58];        // #0b1d3a
const ACCENT = [95, 212, 255];  // #5fd4ff
const HIGHLIGHT = [230, 243, 255]; // #e6f3ff

function makeIcon(size, { maskable = false } = {}) {
  const buf = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const safe = maskable ? size * 0.12 : 0;
  const usable = size - safe * 2;
  const cellCount = 6;
  const cell = usable / cellCount;
  const lineThickness = Math.max(1, Math.floor(size / 256));
  const diamondR = usable * 0.32;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = BG[0], g = BG[1], b = BG[2];

      // soft vignette
      const dx = (x - cx) / size;
      const dy = (y - cy) / size;
      const vignette = Math.min(1, Math.hypot(dx, dy) * 1.6);
      r = Math.floor(r * (1 - vignette * 0.35));
      g = Math.floor(g * (1 - vignette * 0.35));
      b = Math.floor(b * (1 - vignette * 0.25));

      const lx = x - safe;
      const ly = y - safe;
      const inSafe = lx >= 0 && ly >= 0 && lx < usable && ly < usable;

      if (inSafe) {
        // grid lines
        const onVertical = ((lx + lineThickness / 2) % cell) < lineThickness;
        const onHorizontal = ((ly + lineThickness / 2) % cell) < lineThickness;
        if (onVertical || onHorizontal) {
          r = blend(r, HIGHLIGHT[0], 0.25);
          g = blend(g, HIGHLIGHT[1], 0.25);
          b = blend(b, HIGHLIGHT[2], 0.25);
        }

        // central diamond emblem
        const ddx = Math.abs(x - cx);
        const ddy = Math.abs(y - cy);
        if (ddx + ddy < diamondR) {
          const d = (ddx + ddy) / diamondR;
          r = blend(r, ACCENT[0], 0.85 - d * 0.35);
          g = blend(g, ACCENT[1], 0.85 - d * 0.35);
          b = blend(b, ACCENT[2], 0.85 - d * 0.35);
        }
        if (Math.abs(ddx + ddy - diamondR) < lineThickness * 1.2) {
          r = HIGHLIGHT[0];
          g = HIGHLIGHT[1];
          b = HIGHLIGHT[2];
        }
      }

      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }

  return encodePng(buf, size, size);
}

function blend(a, b, t) {
  return Math.max(0, Math.min(255, Math.round(a * (1 - t) + b * t)));
}

// minimal PNG encoder (RGBA, 8-bit, no filter)
function encodePng(rgba, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  const iend = Buffer.alloc(0);

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', iend)]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable.png', size: 512, maskable: true },
];

for (const t of targets) {
  const png = makeIcon(t.size, { maskable: t.maskable });
  writeFileSync(resolve(OUT_DIR, t.name), png);
  console.log(`generated ${t.name} (${t.size}x${t.size}, ${png.length} bytes)`);
}
