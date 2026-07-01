jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    Events: {
      STACK_NEW_IMAGE: 'STACK_NEW_IMAGE',
      IMAGE_RENDERED: 'IMAGE_RENDERED',
      CAMERA_MODIFIED: 'CAMERA_MODIFIED',
    },
  },
  metaData: {
    get: jest.fn(),
  },
  utilities: {
    imageToWorldCoords: jest.fn((_: string, point: number[]) => point),
  },
}));

import {
  hasPointLineDimensionMismatch,
  isRenderablePointLineOverlay,
  overlayIdentity,
  selectPointLineGeometry,
} from './pointLineOverlayController';
import {
  isDestroyedViewportError,
  isElementUsable,
  safeViewportCall,
} from './viewportLifecycle';
import { HoralixAiOverlay } from '../../horalixAiResults.types';

function linearOverlay(): HoralixAiOverlay {
  return {
    sopInstanceUid: 'sop-1',
    overlayType: 'linear_measurement',
    overlayKey: 'rv_base',
    kind: 'linear_measurement_overlay',
    available: true,
    document: {
      kind: 'linear_measurement_overlay',
      sopInstanceUid: 'sop-1',
      coordinateSpace: 'source_pixel',
      frameWidth: 640,
      frameHeight: 480,
      frames: [
        {
          frameIndex: 1,
          present: true,
          points: [
            { id: 'p0', x: 10, y: 20 },
            { id: 'p1', x: 40, y: 20 },
          ],
          segments: [{ from: 'p0', to: 'p1', role: 'measurement_line' }],
          measurement: { name: 'rv_base', value: 3.4, units: 'cm' },
        },
      ],
    },
  };
}

function dopplerOverlay(points = [{ id: 'p0', x: 220, y: 260 }]): HoralixAiOverlay {
  return {
    sopInstanceUid: 'sop-2',
    overlayType: 'doppler_measurement',
    overlayKey: 'lvotvmax',
    kind: 'doppler_measurement_overlay',
    available: true,
    document: {
      kind: 'doppler_measurement_overlay',
      sopInstanceUid: 'sop-2',
      coordinateSpace: 'source_pixel',
      frameWidth: 640,
      frameHeight: 480,
      selectedFrameIndex: 4,
      points,
      segments: [],
      referenceLine: { y: 190, role: 'doppler_baseline' },
      measurement: { name: 'lvotvmax', value: 102.4, units: 'cm/s' },
    },
  };
}

describe('point-line overlay controller helpers', () => {
  it('builds stable overlay identity', () => {
    expect(overlayIdentity(linearOverlay())).toBe('linear_measurement:rv_base:sop-1');
  });

  it('skips unavailable and wrong-kind overlays', () => {
    expect(isRenderablePointLineOverlay({ ...linearOverlay(), available: false })).toBe(
      false
    );
    expect(
      isRenderablePointLineOverlay({
        ...linearOverlay(),
        kind: 'lv_segmentation_overlay',
      })
    ).toBe(false);
  });

  it('skips metadata and document SOP mismatches', () => {
    const overlay = linearOverlay();
    if (overlay.document) {
      overlay.document.sopInstanceUid = 'other-sop';
    }

    expect(isRenderablePointLineOverlay(overlay)).toBe(false);
  });

  it('skips unsupported coordinate spaces', () => {
    const overlay = linearOverlay();
    if (overlay.document) {
      overlay.document.coordinateSpace = 'model_pixel';
    }

    expect(isRenderablePointLineOverlay(overlay)).toBe(false);
  });

  it('selects 2D Linear geometry for the current frame', () => {
    const geometry = selectPointLineGeometry(linearOverlay(), 1);

    expect(geometry.visible).toBe(true);
    expect(geometry.points).toHaveLength(2);
    expect(geometry.segments).toEqual([
      { from: 'p0', to: 'p1', role: 'measurement_line' },
    ]);
    expect(geometry.measurement?.value).toBe(3.4);
  });

  it('skips 2D Linear geometry when the current frame has no points', () => {
    const geometry = selectPointLineGeometry(linearOverlay(), 2);

    expect(geometry.visible).toBe(false);
    expect(geometry.points).toEqual([]);
  });

  it('hides Doppler geometry on non-selected frames', () => {
    const geometry = selectPointLineGeometry(dopplerOverlay(), 3);

    expect(geometry.visible).toBe(false);
    expect(geometry.selectedFrameHidden).toBe(true);
    expect(geometry.referenceLine).toEqual({ y: 190, role: 'doppler_baseline' });
  });

  it('keeps single-point Doppler without a connecting segment', () => {
    const geometry = selectPointLineGeometry(dopplerOverlay(), 4);

    expect(geometry.visible).toBe(true);
    expect(geometry.points).toHaveLength(1);
    expect(geometry.segments).toEqual([]);
    expect(geometry.referenceLine).toEqual({ y: 190, role: 'doppler_baseline' });
  });

  it('keeps two-point Doppler segments when present', () => {
    const overlay = dopplerOverlay([
      { id: 'p0', x: 220, y: 260 },
      { id: 'p1', x: 260, y: 230 },
    ]);
    if (overlay.document) {
      overlay.document.segments = [{ from: 'p0', to: 'p1', role: 'measurement_line' }];
    }

    const geometry = selectPointLineGeometry(overlay, 4);

    expect(geometry.visible).toBe(true);
    expect(geometry.points).toHaveLength(2);
    expect(geometry.segments).toEqual([
      { from: 'p0', to: 'p1', role: 'measurement_line' },
    ]);
  });

  it('reports source dimension mismatch', () => {
    expect(
      hasPointLineDimensionMismatch(linearOverlay().document, {
        columns: 640,
        rows: 480,
      })
    ).toBe(false);
    expect(
      hasPointLineDimensionMismatch(linearOverlay().document, {
        columns: 320,
        rows: 480,
      })
    ).toBe(true);
  });
});

describe('viewport lifecycle helpers', () => {
  it('detects destroyed viewport errors', () => {
    expect(
      isDestroyedViewportError(
        new Error('The stack viewport has been destroyed and is no longer usable.')
      )
    ).toBe(true);
    expect(isDestroyedViewportError(new Error('normal render failure'))).toBe(false);
  });

  it('returns fallback for destroyed viewport calls only', () => {
    expect(
      safeViewportCall(() => {
        throw new Error('StackViewport._throwIfDestroyed');
      }, 'fallback')
    ).toBe('fallback');

    expect(() =>
      safeViewportCall(() => {
        throw new Error('normal render failure');
      }, 'fallback')
    ).toThrow('normal render failure');
  });

  it('treats connected elements as usable', () => {
    const element = document.createElement('div');

    expect(isElementUsable(element)).toBe(false);

    document.body.appendChild(element);
    expect(isElementUsable(element)).toBe(true);
    element.remove();
  });
});
