import { metaData as csMeta } from '@cornerstonejs/core';

import { HoralixOverlayViewport } from '../../horalixAiResults.types';

export const OVERLAY_VIEWPORT_RECONCILE_INTERVAL_MS = 750;

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

function viewportGridEntry(viewportId: string, servicesManager: any): any {
  try {
    const gridState = servicesManager?.services?.viewportGridService?.getState?.();
    const viewports = gridState?.viewports;
    return (
      (viewports && typeof viewports.get === 'function' && viewports.get(viewportId)) ||
      (viewports && viewports[viewportId]) ||
      null
    );
  } catch {
    return null;
  }
}

function displaySetSopUid(displaySet: any): string | null {
  return (
    displaySet?.SOPInstanceUID ||
    displaySet?.instances?.[0]?.SOPInstanceUID ||
    displaySet?.images?.[0]?.SOPInstanceUID ||
    null
  );
}

function currentFrameIndexForViewport(viewport: any): number | null {
  try {
    const index = viewport?.getCurrentImageIdIndex?.();
    return typeof index === 'number' && Number.isFinite(index) ? index : null;
  } catch {
    return null;
  }
}

function gridViewportIds(servicesManager: any): string[] {
  try {
    const viewports =
      servicesManager?.services?.viewportGridService?.getState?.()?.viewports;
    if (!viewports) {
      return [];
    }
    if (typeof viewports.keys === 'function') {
      return Array.from(viewports.keys()).filter(Boolean) as string[];
    }
    if (Array.isArray(viewports)) {
      return viewports
        .map(viewport => viewport?.viewportId || viewport?.id)
        .filter(Boolean) as string[];
    }
    return Object.keys(viewports);
  } catch {
    return [];
  }
}

function visibleViewportIds(servicesManager: any): string[] {
  const cornerstoneViewportService =
    servicesManager?.services?.cornerstoneViewportService;
  const cornerstoneIds: string[] = cornerstoneViewportService?.getViewportIds?.() || [];
  const orderedIds = gridViewportIds(servicesManager);
  return [...orderedIds, ...cornerstoneIds].filter((viewportId, index, all) => {
    return viewportId && all.indexOf(viewportId) === index;
  });
}

export function sopInstanceUidForViewport(
  viewport: any,
  servicesManager: any
): string | null {
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
    const displaySetService = servicesManager?.services?.displaySetService;
    const entry = viewportGridEntry(viewport.id, servicesManager);
    const displaySetInstanceUIDs: string[] = entry?.displaySetInstanceUIDs || [];

    for (const displaySetInstanceUID of displaySetInstanceUIDs) {
      const displaySet = displaySetService?.getDisplaySetByUID?.(displaySetInstanceUID);
      const sop = displaySetSopUid(displaySet);
      if (sop) {
        return sop;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveVisibleOverlayViewports(
  servicesManager: any
): HoralixOverlayViewport[] {
  const cornerstoneViewportService =
    servicesManager?.services?.cornerstoneViewportService;
  if (!cornerstoneViewportService) {
    return [];
  }

  try {
    const viewportIds = visibleViewportIds(servicesManager);

    return viewportIds
      .map((viewportId, viewportIndex) => {
        const viewport = cornerstoneViewportService.getCornerstoneViewport?.(viewportId);
        const sopInstanceUid = viewport
          ? sopInstanceUidForViewport(viewport, servicesManager)
          : null;

        return {
          viewportId,
          viewportIndex,
          viewportLabel: `Viewport ${viewportIndex + 1}`,
          sopInstanceUid,
          currentFrameIndex: viewport ? currentFrameIndexForViewport(viewport) : null,
        };
      })
      .filter(record => Boolean(record.sopInstanceUid));
  } catch {
    return [];
  }
}

export function sameOverlayViewports(
  previous: HoralixOverlayViewport[],
  next: HoralixOverlayViewport[]
): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((record, index) => {
    const candidate = next[index];
    return (
      record.viewportId === candidate.viewportId &&
      record.viewportIndex === candidate.viewportIndex &&
      record.viewportLabel === candidate.viewportLabel &&
      record.sopInstanceUid === candidate.sopInstanceUid &&
      record.currentFrameIndex === candidate.currentFrameIndex
    );
  });
}
