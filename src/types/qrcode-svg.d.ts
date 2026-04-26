declare module 'qrcode-svg' {
  export interface QRCodeOptions {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: 'L' | 'M' | 'Q' | 'H';
    join?: boolean;
    container?: 'svg' | 'svg-viewbox' | 'g' | 'none';
    pretty?: boolean;
    swap?: boolean;
    xmlDeclaration?: boolean;
  }

  export default class QRCode {
    constructor(options: QRCodeOptions | string);
    svg(opts?: { container?: string }): string;
  }
}
