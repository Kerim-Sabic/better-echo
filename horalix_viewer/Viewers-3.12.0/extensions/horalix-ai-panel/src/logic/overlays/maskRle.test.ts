import { decodeRleToMask } from './maskRle';

describe('decodeRleToMask', () => {
  it('decodes an all-background mask', () => {
    const mask = decodeRleToMask({ size: [2, 2], counts: [4] });
    expect(mask).not.toBeNull();
    expect(mask!.width).toBe(2);
    expect(mask!.height).toBe(2);
    expect(Array.from(mask!.data)).toEqual([0, 0, 0, 0]);
  });

  it('decodes an all-foreground mask', () => {
    const mask = decodeRleToMask({ size: [2, 2], counts: [0, 4] });
    expect(mask).not.toBeNull();
    expect(Array.from(mask!.data)).toEqual([1, 1, 1, 1]);
  });

  it('decodes a mixed row-major mask', () => {
    const mask = decodeRleToMask({ size: [2, 3], counts: [0, 1, 4, 1] });
    expect(mask).not.toBeNull();
    expect(Array.from(mask!.data)).toEqual([1, 0, 0, 0, 0, 1]);
    expect(mask!.data[0 * 3 + 0]).toBe(1);
    expect(mask!.data[1 * 3 + 2]).toBe(1);
  });

  it('keeps distinct masks across frames', () => {
    const first = decodeRleToMask({ size: [2, 2], counts: [0, 1, 3] });
    const second = decodeRleToMask({ size: [2, 2], counts: [3, 1] });

    expect(first!.data[0]).toBe(1);
    expect(first!.data[3]).toBe(0);
    expect(second!.data[0]).toBe(0);
    expect(second!.data[3]).toBe(1);
  });

  it('returns null for malformed input', () => {
    expect(decodeRleToMask(null)).toBeNull();
    expect(decodeRleToMask({ size: [0, 0], counts: [] })).toBeNull();
    expect(decodeRleToMask({ counts: [1] })).toBeNull();
    expect(decodeRleToMask({ size: [1, 1], counts: [-1] })).toBeNull();
  });
});
