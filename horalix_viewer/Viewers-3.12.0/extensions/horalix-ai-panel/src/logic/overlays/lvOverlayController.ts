import { useEffect, useRef, useState } from 'react';
import {
  Enums as csEnums,
  metaData as csMeta,
  utilities as csUtils,
} from '@cornerstonejs/core';

import { HoralixAiOverlay, HoralixLvOverlayDocument } from '../../horalixAiResults.types';
import { buildMaskCanvas, Rgb } from './maskBitmap';
import { DecodedMask, decodeRleToMask } from './maskRle';
import {
  OVERLAY_VIEWPORT_RECONCILE_INTERVAL_MS,
  sopInstanceUidForViewport,
} from './overlayViewportState';
import {
  isDestroyedViewportError,
  isElementUsable,
  safeViewportCall,
} from './viewportLifecycle';

const LV_OVERLAY_KIND = 'lv_segmentation_overlay';
const OVERLAY_COLOR: Rgb = [45, 212, 191];
const OVERLAY_Z_INDEX = '5';

export type LvOverlayStatus = {
  rendering: boolean;
  dimensionMismatch: boolean;
  sopInstanceUid: string | null;
};

type ImageDimensions = {
  columns: number;
  rows: number;
};

function imageDimensions(imageId: string | undefined): ImageDimensions | null {
  if (!imageId) {
    return null;
  }

  try {
    const pixelModule = csMeta.get('imagePixelModule', imageId);
    if (pixelModule?.columns && pixelModule?.rows) {
      return { columns: pixelModule.columns, rows: pixelModule.rows };
    }
  } catch {
    return null;
  }

  return null;
}

function isRenderableLvOverlay(overlay: HoralixAiOverlay): boolean {
  return Boolean(
    overlay?.available &&
      overlay.kind === LV_OVERLAY_KIND &&
      overlay.sopInstanceUid &&
      overlay.document?.kind === LV_OVERLAY_KIND &&
      overlay.document?.frames?.length
  );
}

class LvOverlayLayer {
  private viewport: any;
  private element: HTMLElement;
  private document: HoralixLvOverlayDocument;
  private canvas: HTMLCanvasElement;
  private maskCache = new Map<number, DecodedMask | null>();
  private fillAlpha = 0.28;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private boundRender = () => this.safeRender();

  constructor(viewport: any, document: HoralixLvOverlayDocument) {
    this.viewport = viewport;
    this.element = viewport.element as HTMLElement;
    this.document = document;
    this.canvas = window.document.createElement('canvas');
    this.canvas.dataset.horalixLvOverlay = 'true';
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: OVERLAY_Z_INDEX,
    } as CSSStyleDeclaration);
  }

  attach(): boolean {
    if (this.destroyed || !isElementUsable(this.element)) {
      return false;
    }

    try {
      if (window.getComputedStyle(this.element).position === 'static') {
        this.element.style.position = 'relative';
      }
    } catch {
      return false;
    }

    this.element.appendChild(this.canvas);
    this.element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, this.boundRender);
    this.element.addEventListener(csEnums.Events.IMAGE_RENDERED, this.boundRender);
    this.element.addEventListener(csEnums.Events.CAMERA_MODIFIED, this.boundRender);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.safeRender());
      this.resizeObserver.observe(this.element);
    }

    this.safeRender();
    return true;
  }

  ownsViewport(viewport: any) {
    return (
      !this.destroyed &&
      this.viewport === viewport &&
      this.element === viewport.element &&
      isElementUsable(this.element)
    );
  }

  setOpacity(alpha: number) {
    this.fillAlpha = alpha;
  }

  validate(): { ok: boolean; reason?: string } {
    if (this.destroyed || !isElementUsable(this.element)) {
      return { ok: false, reason: 'viewport_unavailable' };
    }

    const imageId = this.safeCurrentImageId();
    const dimensions = imageDimensions(imageId);
    const frameWidth = this.document.frameWidth || 0;
    const frameHeight = this.document.frameHeight || 0;

    if (
      dimensions &&
      (dimensions.columns !== frameWidth || dimensions.rows !== frameHeight)
    ) {
      return { ok: false, reason: 'mask_dimensions_mismatch' };
    }

    try {
      const slices = this.viewport.getNumberOfSlices?.();
      if (slices && this.document.frameCount && slices !== this.document.frameCount) {
        return { ok: false, reason: 'frame_count_mismatch' };
      }
    } catch (error) {
      if (isDestroyedViewportError(error)) {
        return { ok: false, reason: 'viewport_destroyed' };
      }
      return { ok: true };
    }

    return { ok: true };
  }

  private safeCurrentImageId(): string | undefined {
    try {
      return this.viewport.getCurrentImageId?.();
    } catch {
      return undefined;
    }
  }

  private getMask(index: number): DecodedMask | null {
    if (this.maskCache.has(index)) {
      return this.maskCache.get(index) || null;
    }

    const frame = this.document.frames?.[index];
    const mask = frame?.present ? decodeRleToMask(frame.rle) : null;
    this.maskCache.set(index, mask);
    return mask;
  }

  private resizeToElement(): { dpr: number } {
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(this.element.clientWidth * dpr);
    const backingHeight = Math.round(this.element.clientHeight * dpr);

    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }

    return { dpr };
  }

  clear() {
    if (this.destroyed) {
      return;
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  safeRender() {
    return safeViewportCall(() => this.render(), undefined);
  }

  render() {
    if (this.destroyed || !isElementUsable(this.element)) {
      return;
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const { dpr } = this.resizeToElement();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.validate().ok) {
      return;
    }

    const imageId = this.safeCurrentImageId();
    if (!imageId) {
      return;
    }

    let index = 0;
    try {
      index = this.viewport.getCurrentImageIdIndex?.() ?? 0;
    } catch {
      index = 0;
    }

    const mask = this.getMask(index);
    if (!mask) {
      return;
    }

    const frameWidth = this.document.frameWidth || mask.width;
    const frameHeight = this.document.frameHeight || mask.height;

    let topLeft: number[];
    let bottomRight: number[];
    try {
      topLeft = this.viewport.worldToCanvas(
        csUtils.imageToWorldCoords(imageId, [0, 0])
      );
      bottomRight = this.viewport.worldToCanvas(
        csUtils.imageToWorldCoords(imageId, [frameWidth, frameHeight])
      );
    } catch {
      return;
    }

    const x = topLeft[0];
    const y = topLeft[1];
    const width = bottomRight[0] - topLeft[0];
    const height = bottomRight[1] - topLeft[1];
    if ([x, y, width, height].some(value => Number.isNaN(value))) {
      return;
    }

    const maskCanvas = buildMaskCanvas(mask, OVERLAY_COLOR, this.fillAlpha);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(maskCanvas, x, y, width, height);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, this.boundRender);
    this.element.removeEventListener(csEnums.Events.IMAGE_RENDERED, this.boundRender);
    this.element.removeEventListener(csEnums.Events.CAMERA_MODIFIED, this.boundRender);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.canvas.parentElement === this.element) {
      this.element.removeChild(this.canvas);
    }

    this.maskCache.clear();
  }
}

export function useLvMaskOverlay({
  servicesManager,
  overlays,
  enabled,
  opacity,
}: {
  servicesManager: any;
  overlays: HoralixAiOverlay[];
  enabled: boolean;
  opacity: number;
}): LvOverlayStatus {
  const [status, setStatus] = useState<LvOverlayStatus>({
    rendering: false,
    dimensionMismatch: false,
    sopInstanceUid: null,
  });

  const overlaysRef = useRef(overlays);
  const enabledRef = useRef(enabled);
  const opacityRef = useRef(opacity);
  const reconcileRef = useRef<() => void>(() => undefined);
  const layersRef = useRef<Map<string, LvOverlayLayer>>(new Map());

  overlaysRef.current = overlays;
  enabledRef.current = enabled;
  opacityRef.current = opacity;

  useEffect(() => {
    const cornerstoneViewportService =
      servicesManager?.services?.cornerstoneViewportService;
    if (!cornerstoneViewportService) {
      return undefined;
    }

    let disposed = false;
    const layers = layersRef.current;

    const overlayBySop = (): Map<string, HoralixAiOverlay> => {
      const map = new Map<string, HoralixAiOverlay>();
      (overlaysRef.current || []).forEach(overlay => {
        if (!isRenderableLvOverlay(overlay)) {
          return;
        }

        if (overlay.sopInstanceUid) {
          map.set(overlay.sopInstanceUid, overlay);
        }
      });
      return map;
    };

    const reconcile = () => {
      if (disposed) {
        return;
      }

      try {
        const viewportIds: string[] =
          cornerstoneViewportService.getViewportIds?.() || [];
        const overlaysBySop = overlayBySop();
        const seen = new Set<string>();
        let rendering = false;
        let dimensionMismatch = false;
        let activeSop: string | null = null;

        viewportIds.forEach(viewportId => {
          const viewport =
            cornerstoneViewportService.getCornerstoneViewport(viewportId);
          if (
            !viewport ||
            !isElementUsable(viewport.element) ||
            typeof viewport.getCurrentImageId !== 'function'
          ) {
            return;
          }

          const sop = sopInstanceUidForViewport(viewport, servicesManager);
          const overlay =
            sop && enabledRef.current ? overlaysBySop.get(sop) : null;
          if (!overlay?.document) {
            return;
          }

          seen.add(viewportId);
          let layer = layers.get(viewportId);
          if (!layer || !layer.ownsViewport(viewport)) {
            layer?.destroy();
            layer = new LvOverlayLayer(viewport, overlay.document);
            layers.set(viewportId, layer);
            if (!layer.attach()) {
              layers.delete(viewportId);
              return;
            }
          }

          layer.setOpacity(opacityRef.current);

          if (layer.validate().ok) {
            rendering = true;
            activeSop = sop;
            layer.safeRender();
          } else {
            dimensionMismatch = true;
            layer.clear();
          }
        });

        Array.from(layers.keys()).forEach(viewportId => {
          if (!seen.has(viewportId)) {
            layers.get(viewportId)?.destroy();
            layers.delete(viewportId);
          }
        });

        setStatus(previous =>
          previous.rendering === rendering &&
          previous.dimensionMismatch === dimensionMismatch &&
          previous.sopInstanceUid === activeSop
            ? previous
            : { rendering, dimensionMismatch, sopInstanceUid: activeSop }
        );
      } catch {
        return;
      }
    };

    reconcileRef.current = reconcile;
    reconcile();
    const interval = window.setInterval(
      reconcile,
      OVERLAY_VIEWPORT_RECONCILE_INTERVAL_MS
    );

    return () => {
      disposed = true;
      window.clearInterval(interval);
      Array.from(layers.values()).forEach(layer => layer.destroy());
      layers.clear();
      reconcileRef.current = () => undefined;
    };
  }, [servicesManager]);

  useEffect(() => {
    reconcileRef.current();
  }, [overlays, enabled, opacity]);

  return status;
}
