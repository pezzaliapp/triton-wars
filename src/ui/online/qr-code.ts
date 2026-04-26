/**
 * Lazy-loaded QR code rendering. Keeps the qrcode-svg dependency out of
 * the main bundle (~3 KB gz) — only fetched when the host actually opens
 * the "Mostra QR" panel on the lobby create screen.
 *
 * Returns the inline SVG markup as a string so the caller can drop it
 * straight into innerHTML; the markup uses no scripts, no external refs.
 */

export interface QrOptions {
  /** Px, including the white border. Default 192. */
  size?: number;
  /** Quiet zone in modules. Default 2. */
  padding?: number;
}

export async function renderQrCode(text: string, opts: QrOptions = {}): Promise<string> {
  const { default: QRCode } = await import('qrcode-svg');
  const qr = new QRCode({
    content: text,
    width: opts.size ?? 192,
    height: opts.size ?? 192,
    padding: opts.padding ?? 2,
    color: '#0e1d33',
    background: '#f4f9ff',
    ecl: 'M',
    join: true,
    container: 'svg-viewbox',
  });
  return qr.svg();
}
