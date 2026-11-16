import QRCode from 'qrcode';

/** 把文本渲染成内联 SVG 二维码（不依赖网络或 canvas）。 */
export function qrSvg(
  text: string,
  { scale = 6, margin = 4, ecl = 'M' }: { scale?: number; margin?: number; ecl?: 'L' | 'M' | 'Q' | 'H' } = {}
): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const total = (size + margin * 2) * scale;
  const cells: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[y * size + x]) {
        cells.push(
          `<rect x="${(x + margin) * scale}" y="${(y + margin) * scale}" width="${scale}" height="${scale}"/>`
        );
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#111">${cells.join('')}</g></svg>`;
}
