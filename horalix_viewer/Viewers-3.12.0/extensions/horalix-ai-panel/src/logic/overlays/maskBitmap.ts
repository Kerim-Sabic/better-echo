import { DecodedMask } from './maskRle';

export type Rgb = [number, number, number];

export function buildMaskCanvas(
  mask: DecodedMask,
  color: Rgb,
  fillAlpha: number
): HTMLCanvasElement {
  const { width, height, data } = mask;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  const image = ctx.createImageData(width, height);
  const out = image.data;
  const [r, g, b] = color;
  const fillA = Math.max(0, Math.min(255, Math.round(fillAlpha * 255)));
  const edgeA = 255;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (!data[idx]) {
        continue;
      }

      const isEdge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !data[idx - 1] ||
        !data[idx + 1] ||
        !data[idx - width] ||
        !data[idx + width];

      const outIdx = idx * 4;
      out[outIdx] = r;
      out[outIdx + 1] = g;
      out[outIdx + 2] = b;
      out[outIdx + 3] = isEdge ? edgeA : fillA;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}
