/**
 * Phase 1 mobile-first verification: opens the built app in headless
 * chromium for each device preset, drives it through the placement
 * flow, and saves screenshots to scripts/screenshots-out/.
 *
 * Usage: node scripts/screenshot-presets.mjs
 *
 * Assumes a static server is already running at PREVIEW_URL (default
 * http://localhost:4173/triton-wars/, the vite preview default base).
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'screenshots-out');
const PREVIEW_URL = process.env.PREVIEW_URL ?? 'http://localhost:4173/triton-wars/';

/** 6 presets: 5 mobile/tablet (portrait + landscape variants) + 2 desktop. */
const PRESETS = [
  { name: 'iphone-se-portrait',     w: 375,  h: 667,  mobile: true,  desc: 'iPhone SE portrait (375×667)' },
  { name: 'iphone-se-landscape',    w: 667,  h: 375,  mobile: true,  desc: 'iPhone SE landscape (667×375)' },
  { name: 'iphone-14-pro-portrait', w: 393,  h: 852,  mobile: true,  desc: 'iPhone 14 Pro portrait (393×852)' },
  { name: 'iphone-14-pro-landscape',w: 852,  h: 393,  mobile: true,  desc: 'iPhone 14 Pro landscape (852×393)' },
  { name: 'ipad-mini-portrait',     w: 768,  h: 1024, mobile: true,  desc: 'iPad Mini portrait (768×1024)' },
  { name: 'ipad-mini-landscape',    w: 1024, h: 768,  mobile: true,  desc: 'iPad Mini landscape (1024×768)' },
  { name: 'galaxy-s20-portrait',    w: 360,  h: 800,  mobile: true,  desc: 'Galaxy S20 portrait (360×800)' },
  { name: 'galaxy-s20-landscape',   w: 800,  h: 360,  mobile: true,  desc: 'Galaxy S20 landscape (800×360)' },
  { name: 'desktop-1280',           w: 1280, h: 800,  mobile: false, desc: 'Desktop laptop (1280×800)' },
  { name: 'desktop-1920',           w: 1920, h: 1080, mobile: false, desc: 'Desktop full HD (1920×1080)' },
];

async function ensureOutDir() {
  await mkdir(OUT_DIR, { recursive: true });
}

async function captureForPreset(browser, preset) {
  const ctx = await browser.newContext({
    viewport: { width: preset.w, height: preset.h },
    isMobile: preset.mobile,
    hasTouch: preset.mobile,
    deviceScaleFactor: preset.mobile ? 2 : 1,
    userAgent: preset.mobile ? devices['iPhone 14 Pro'].userAgent : undefined,
    // Pre-set how-to-suppression so we don't open the tutorial overlay.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(PREVIEW_URL).origin,
          localStorage: [{ name: 'triton-wars:howto-seen', value: '1' }],
        },
      ],
    },
  });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`  [console.error]`, msg.text());
  });
  page.on('pageerror', (err) => console.error(`  [pageerror]`, err.message));

  const out = (slug) => join(OUT_DIR, `${preset.name}--${slug}.png`);

  // 1) MENU shot.
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.main-menu', { timeout: 8000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: out('01-menu'), fullPage: false });

  // 2) Click "Gioca vs Computer · Recluta" → enter placement.
  const playBtn = page.locator('.main-menu-actions .btn-primary').first();
  await playBtn.click();
  await page.waitForSelector('.bottom-sheet', { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('02-placement'), fullPage: false });

  // 3) Tap on canvas roughly mid-screen to attempt placement (best-effort).
  // The canvas hit-test depends on camera/projection; we just want to
  // exercise the input chain, not assert success.
  const canvas = page.locator('#scene');
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('03-after-tap'), fullPage: false });
  }

  // 4) Click "Ruota" if visible (placement actions row).
  const rotateBtn = page.locator('.tray-summary-actions [data-rotate]');
  if (await rotateBtn.isVisible()) {
    await rotateBtn.click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: out('04-after-rotate'), fullPage: false });
  }

  // 5) On mobile: try expanding the bottom-sheet via grip tap.
  if (preset.mobile) {
    const grip = page.locator('.bottom-sheet-grip');
    if (await grip.isVisible()) {
      await grip.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: out('05-sheet-expanded'), fullPage: false });
    }
  }

  await ctx.close();
  return preset.name;
}

async function main() {
  await ensureOutDir();
  // Use the system Chrome installation: avoids the ~150 MB chromium
  // download which fails behind some networks (ECONNRESET on the
  // playwright CDN). Set TRITON_USE_SYSTEM_CHROME=0 to fall back to
  // the bundled chromium when it has been installed.
  const useSystemChrome = process.env.TRITON_USE_SYSTEM_CHROME !== '0';
  const browser = await chromium.launch({
    headless: true,
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
  });
  const log = [];
  for (const preset of PRESETS) {
    process.stdout.write(`▶ ${preset.desc} … `);
    try {
      await captureForPreset(browser, preset);
      log.push({ preset: preset.name, ok: true });
      console.log('ok');
    } catch (err) {
      log.push({ preset: preset.name, ok: false, error: String(err) });
      console.log(`FAIL: ${err.message}`);
    }
  }
  await browser.close();
  await writeFile(join(OUT_DIR, 'summary.json'), JSON.stringify(log, null, 2));
  console.log(`\nDone. Output in ${OUT_DIR}`);
  console.log(`Summary: ${log.filter((l) => l.ok).length}/${log.length} presets OK`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
