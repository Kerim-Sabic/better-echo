export type Rle = {
  size?: number[];
  counts?: number[];
};

export type DecodedMask = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function decodeRleToMask(rle: Rle | null | undefined): DecodedMask | null {
  if (!rle || !Array.isArray(rle.size) || rle.size.length < 2) {
    return null;
  }

  const height = Number(rle.size[0]) | 0;
  const width = Number(rle.size[1]) | 0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const total = width * height;
  const data = new Uint8Array(total);
  const counts = Array.isArray(rle.counts) ? rle.counts : [];

  let pos = 0;
  let value = 0;
  for (let i = 0; i < counts.length; i++) {
    const run = Number(counts[i]) | 0;
    if (run < 0) {
      return null;
    }

    if (value === 1 && run > 0) {
      data.fill(1, pos, Math.min(pos + run, total));
    }
    pos += run;
    value ^= 1;
  }

  return { width, height, data };
}
