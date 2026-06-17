import { useEffect, useRef, useState } from 'react';
import {
  Enums as csEnums,
  metaData as csMeta,
  utilities as csUtils,
} from '@cornerstonejs/core';

import {
  HoralixAiOverlay,
  HoralixOverlayDocument,
  HoralixOverlayFrame,
  HoralixOverlayMeasurement,
  HoralixOverlayPoint,
  HoralixOverlayReferenceLine,
  HoralixOverlaySegment,
} from '../../horalixAiResults.types';
import {
  CanvasLine,
  CanvasPoint,
  CanvasSegment,
  drawPointLineOverlay,
} from './pointLineCanvas';

const LINEAR_OVERLAY_KIND = 'linear_measurement_overlay';
const DOPPLER_OVERLAY_KIND = 'doppler_measurement_overlay';
const COORDINATE_SPACE_SOURCE_PIXEL = 'source_pixel';
const RECONCILE_INTERVAL_MS = 750;
const OVERLAY_Z_INDEX = '6';

type ImageDimensions = {
  columns: number;
  rows: number;
};

export type PointLineOverlayStatus = {
  rendering: boolean;
  dimensionMismatch: boolean;
  sopInstanceUid: string | null;
  selectedFrameHidden: boolean;
};

export type SelectedPointLineGeometry = {
  visible: boolean;
  selectedFrameHidden: boolean;
  points: HoralixOverlayPoint[];
  segments: HoralixOverlaySegment[];
  measurement: HoralixOverlayMeasurement | null;
  referenceLine: HoralixOverlayReferenceLine | null;
};

type RenderResult = {
  rendering: boolean;
  dimensionMismatch: boolean;
  selectedFrameHidden: boolean;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sopUidForImageId(imageId: string | undefined): string | null {
  if (!imageId) {
    return null;
  }

  try {
    const instance = csMeta.get('instance', imageId);
    return (instance && instance.SOPInstanceUID) || null;
  } catch {
    return null;
  }
}

function sopUidForViewport(viewport: any, servicesManager: any): string | null {
  let imageId: string | undefined;
  try {
    imageId = viewport.getCurrentImageId?.();
  } catch {
    imageId = undefined;
  }

  const imageSop = sopUidForImageId(imageId);
  if (imageSop) {
    return imageSop;
  }

  try {
    const services = servicesManager?.services || {};
    const { displaySetService, viewportGridService } = services;
    const gridState = viewportGridService?.getState?.();
    const viewports = gridState?.viewports;
    const entry =
      (viewports && typeof viewports.get === 'function' && viewports.get(viewport.id)) ||
      (viewports && viewports[viewport.id]) ||
      null;
    const displaySetInstanceUIDs: string[] = entry?.displaySetInstanceUIDs || [];

    for (const displaySetInstanceUID of displaySetInstanceUIDs) {
      const displaySet = displaySetService?.getDisplaySetByUID?.(displaySetInstanceUID);
      const sop =
        displaySet?.SOPInstanceUID ||
        displaySet?.instances?.[0]?.SOPInstanceUID ||
        displaySet?.images?.[0]?.SOPInstanceUID;
      if (sop) {
        return sop;
      }
    }
  } catch {
    return null;
  }

  return null;
}

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

function frameIndex(frame: HoralixOverlayFrame, fallbackIndex: number): number {
  return finiteNumber(frame.frameIndex) ?? fallbackIndex;
}

function measurementLabel(
  measurement: HoralixOverlayMeasurement | null | undefined,
  fallbackName: string | null | undefined
): string | null {
  const name = measurement?.name || fallbackName || null;
  const value = finiteNumber(measurement?.value);
  const units = measurement?.units || '';

  if (value === null) {
    return name;
  }

  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return `${name ? `${name}: ` : ''}${rounded}${units ? ` ${units}` : ''}`;
}

function canvasPointFor(
  viewport: any,
  imageId: string,
  point: HoralixOverlayPoint
): CanvasPoint | null {
  const x = finiteNumber(point.x);
  const y = finiteNumber(point.y);
  if (x === null || y === null) {
    return null;
  }

  try {
    const canvas = viewport.worldToCanvas(csUtils.imageToWorldCoords(imageId, [x, y]));
    if (!Array.isArray(canvas) || canvas.length < 2) {
      return null;
    }
    if (!Number.isFinite(canvas[0]) || !Number.isFinite(canvas[1])) {
      return null;
    }

    return { id: point.id, x: canvas[0], y: canvas[1] };
  } catch {
    return null;
  }
}

function referenceLineFor(
  viewport: any,
  imageId: string,
  document: HoralixOverlayDocument,
  referenceLine: HoralixOverlayReferenceLine | null
): CanvasLine | null {
  const y = finiteNumber(referenceLine?.y);
  const width = finiteNumber(document.frameWidth);
  if (y === null || width === null) {
    return null;
  }

  const from = canvasPointFor(viewport, imageId, { id: 'reference-start', x: 0, y });
  const to = canvasPointFor(viewport, imageId, { id: 'reference-end', x: width, y });
  return from && to ? { from, to } : null;
}

export function overlayIdentity(overlay: HoralixAiOverlay): string {
  return `${overlay.overlayType || 'unknown'}:${overlay.overlayKey || 'default'}:${
    overlay.sopInstanceUid || 'unknown'
  }`;
}

export function isRenderablePointLineOverlay(overlay: HoralixAiOverlay): boolean {
  const document = overlay?.document;
  if (
    !overlay?.available ||
    !overlay.sopInstanceUid ||
    !document ||
    document.sopInstanceUid !== overlay.sopInstanceUid ||
    document.coordinateSpace !== COORDINATE_SPACE_SOURCE_PIXEL ||
    document.kind !== overlay.kind
  ) {
    return false;
  }

  if (overlay.kind === LINEAR_OVERLAY_KIND) {
    return Boolean(document.frames?.length);
  }

  if (overlay.kind === DOPPLER_OVERLAY_KIND) {
    return Boolean(document.points?.length);
  }

  return false;
}

export function selectPointLineGeometry(
  overlay: HoralixAiOverlay,
  currentFrameIndex: number
): SelectedPointLineGeometry {
  const document = overlay.document;
  const empty: SelectedPointLineGeometry = {
    visible: false,
    selectedFrameHidden: false,
    points: [],
    segments: [],
    measurement: null,
    referenceLine: null,
  };

  if (!document || !isRenderablePointLineOverlay(overlay)) {
    return empty;
  }

  if (overlay.kind === LINEAR_OVERLAY_KIND) {
    const frames = document.frames || [];
    const frame = frames.find((candidate, index) => {
      return frameIndex(candidate, index) === currentFrameIndex;
    });

    if (!frame?.present || !frame.points?.length) {
      return empty;
    }

    return {
      visible: true,
      selectedFrameHidden: false,
      points: frame.points,
      segments: frame.segments || [],
      measurement: frame.measurement || document.measurement || null,
      referenceLine: null,
    };
  }

  const selectedFrameIndex = finiteNumber(document.selectedFrameIndex) ?? 0;
  if (selectedFrameIndex !== currentFrameIndex) {
    return {
      ...empty,
      selectedFrameHidden: true,
      referenceLine: document.referenceLine || null,
    };
  }

  return {
    visible: true,
    selectedFrameHidden: false,
    points: document.points || [],
    segments: document.segments || [],
    measurement: document.measurement || null,
    referenceLine: document.referenceLine || null,
  };
}

export function hasPointLineDimensionMismatch(
  document: HoralixOverlayDocument | null | undefined,
  dimensions: ImageDimensions | null
): boolean {
  if (!document || !dimensions) {
    return false;
  }

  const frameWidth = finiteNumber(document.frameWidth);
  const frameHeight = finiteNumber(document.frameHeight);
  return Boolean(
    frameWidth !== null &&
      frameHeight !== null &&
      (dimensions.columns !== frameWidth || dimensions.rows !== frameHeight)
  );
}

class PointLineOverlayLayer {
  private viewport: any;
  private element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private overlays: HoralixAiOverlay[] = [];
  private opacity = 0.28;
  private resizeObserver: ResizeObserver | null = null;
  private boundRender = () => this.render();

  constructor(viewport: any) {
    this.viewport = viewport;
    this.element = viewport.element as HTMLElement;
    this.canvas = window.document.createElement('canvas');
    this.canvas.dataset.horalixPointLineOverlay = 'true';
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

  attach() {
    try {
      if (window.getComputedStyle(this.element).position === 'static') {
        this.element.style.position = 'relative';
      }
    } catch {
      return;
    }

    this.element.appendChild(this.canvas);
    this.element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, this.boundRender);
    this.element.addEventListener(csEnums.Events.IMAGE_RENDERED, this.boundRender);
    this.element.addEventListener(csEnums.Events.CAMERA_MODIFIED, this.boundRender);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(this.element);
    }

    this.render();
  }

  ownsViewport(viewport: any) {
    return this.viewport === viewport && this.element === viewport.element;
  }

  setOverlays(overlays: HoralixAiOverlay[]) {
    this.overlays = overlays;
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
  }

  clear() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(): RenderResult {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return {
        rendering: false,
        dimensionMismatch: false,
        selectedFrameHidden: false,
      };
    }

    const { dpr } = this.resizeToElement();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const imageId = this.safeCurrentImageId();
    if (!imageId) {
      return {
        rendering: false,
        dimensionMismatch: false,
        selectedFrameHidden: false,
      };
    }

    const dimensions = imageDimensions(imageId);
    const currentFrameIndex = this.currentFrameIndex();
    let rendering = false;
    let dimensionMismatch = false;
    let selectedFrameHidden = false;

    this.overlays.forEach(overlay => {
      const document = overlay.document;
      if (!document || !isRenderablePointLineOverlay(overlay)) {
        return;
      }

      if (hasPointLineDimensionMismatch(document, dimensions)) {
        dimensionMismatch = true;
        return;
      }

      const geometry = selectPointLineGeometry(overlay, currentFrameIndex);
      selectedFrameHidden = selectedFrameHidden || geometry.selectedFrameHidden;
      if (!geometry.visible) {
        return;
      }

      const points = geometry.points
        .map(point => canvasPointFor(this.viewport, imageId, point))
        .filter(Boolean) as CanvasPoint[];
      const pointById = new Map<string, CanvasPoint>();
      points.forEach((point, index) => {
        pointById.set(point.id || `p${index}`, point);
      });

      const segments = this.canvasSegments(geometry.segments, points, pointById);
      const referenceLine = referenceLineFor(
        this.viewport,
        imageId,
        document,
        geometry.referenceLine
      );
      const label = measurementLabel(geometry.measurement, overlay.overlayKey);
      const labelAnchor = this.labelAnchor(points, segments);

      if (!points.length && !referenceLine) {
        return;
      }

      drawPointLineOverlay(ctx, {
        color: overlay.kind === DOPPLER_OVERLAY_KIND ? '#FBBF24' : '#38BDF8',
        opacity: Math.max(0, Math.min(1, this.opacity / 0.6)),
        points,
        segments,
        referenceLine,
        label,
        labelAnchor,
      });
      rendering = true;
    });

    return { rendering, dimensionMismatch, selectedFrameHidden };
  }

  destroy() {
    this.element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, this.boundRender);
    this.element.removeEventListener(csEnums.Events.IMAGE_RENDERED, this.boundRender);
    this.element.removeEventListener(csEnums.Events.CAMERA_MODIFIED, this.boundRender);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.canvas.parentElement === this.element) {
      this.element.removeChild(this.canvas);
    }
  }

  private canvasSegments(
    segments: HoralixOverlaySegment[],
    points: CanvasPoint[],
    pointById: Map<string, CanvasPoint>
  ): CanvasSegment[] {
    if (!segments.length && points.length >= 2) {
      return [{ from: points[0], to: points[1], role: 'measurement_line' }];
    }

    return segments
      .map(segment => {
        const from = segment.from ? pointById.get(segment.from) : null;
        const to = segment.to ? pointById.get(segment.to) : null;
        return from && to ? { from, to, role: segment.role } : null;
      })
      .filter(Boolean) as CanvasSegment[];
  }

  private currentFrameIndex(): number {
    try {
      return this.viewport.getCurrentImageIdIndex?.() ?? 0;
    } catch {
      return 0;
    }
  }

  private labelAnchor(points: CanvasPoint[], segments: CanvasSegment[]): CanvasPoint | null {
    const firstSegment = segments[0];
    if (firstSegment) {
      return {
        x: (firstSegment.from.x + firstSegment.to.x) / 2,
        y: (firstSegment.from.y + firstSegment.to.y) / 2,
      };
    }

    return points[0] || null;
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

  private safeCurrentImageId(): string | undefined {
    try {
      return this.viewport.getCurrentImageId?.();
    } catch {
      return undefined;
    }
  }
}

export function usePointLineOverlays({
  servicesManager,
  overlays,
  enabled,
  opacity,
}: {
  servicesManager: any;
  overlays: HoralixAiOverlay[];
  enabled: boolean;
  opacity: number;
}): PointLineOverlayStatus {
  const [status, setStatus] = useState<PointLineOverlayStatus>({
    rendering: false,
    dimensionMismatch: false,
    sopInstanceUid: null,
    selectedFrameHidden: false,
  });

  const overlaysRef = useRef(overlays);
  const enabledRef = useRef(enabled);
  const opacityRef = useRef(opacity);
  const reconcileRef = useRef<() => void>(() => undefined);
  const layersRef = useRef<Map<string, PointLineOverlayLayer>>(new Map());

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

    const overlaysBySop = (): Map<string, HoralixAiOverlay[]> => {
      const map = new Map<string, HoralixAiOverlay[]>();
      (overlaysRef.current || []).forEach(overlay => {
        if (!isRenderablePointLineOverlay(overlay) || !overlay.sopInstanceUid) {
          return;
        }

        const bucket = map.get(overlay.sopInstanceUid) || [];
        bucket.push(overlay);
        map.set(overlay.sopInstanceUid, bucket);
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
        const overlayMap = overlaysBySop();
        const seen = new Set<string>();
        let rendering = false;
        let dimensionMismatch = false;
        let selectedFrameHidden = false;
        let activeSop: string | null = null;

        viewportIds.forEach(viewportId => {
          const viewport =
            cornerstoneViewportService.getCornerstoneViewport(viewportId);
          if (!viewport || typeof viewport.getCurrentImageId !== 'function') {
            return;
          }

          const sop = sopUidForViewport(viewport, servicesManager);
          const matchingOverlays =
            sop && enabledRef.current ? overlayMap.get(sop) || [] : [];
          if (!matchingOverlays.length) {
            return;
          }

          seen.add(viewportId);
          let layer = layers.get(viewportId);
          if (!layer || !layer.ownsViewport(viewport)) {
            layer?.destroy();
            layer = new PointLineOverlayLayer(viewport);
            layers.set(viewportId, layer);
            layer.attach();
          }

          layer.setOverlays(matchingOverlays);
          layer.setOpacity(opacityRef.current);
          const result = layer.render();

          rendering = rendering || result.rendering;
          dimensionMismatch = dimensionMismatch || result.dimensionMismatch;
          selectedFrameHidden = selectedFrameHidden || result.selectedFrameHidden;
          activeSop = sop;
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
          previous.sopInstanceUid === activeSop &&
          previous.selectedFrameHidden === selectedFrameHidden
            ? previous
            : {
                rendering,
                dimensionMismatch,
                sopInstanceUid: activeSop,
                selectedFrameHidden,
              }
        );
      } catch {
        return;
      }
    };

    reconcileRef.current = reconcile;
    reconcile();
    const interval = window.setInterval(reconcile, RECONCILE_INTERVAL_MS);

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
