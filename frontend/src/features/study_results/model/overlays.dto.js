import {
  toArray,
  toObject,
  toNullableString,
} from "@/general_components/utility/dataShapeUtils";

function toNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePoint(rawPoint) {
  const point = toObject(rawPoint);

  return {
    id: toNullableString(point.id),
    x: toNumberOrNull(point.x),
    y: toNumberOrNull(point.y),
    confidence: toNumberOrNull(point.confidence),
  };
}

function normalizeSegment(rawSegment) {
  const segment = toObject(rawSegment);

  return {
    from: toNullableString(segment.from),
    to: toNullableString(segment.to),
    role: toNullableString(segment.role),
  };
}

function normalizeMeasurement(rawMeasurement) {
  const measurement = toObject(rawMeasurement);

  if (!Object.keys(measurement).length) {
    return null;
  }

  return {
    name: toNullableString(measurement.name),
    value: toNumberOrNull(measurement.value),
    units: toNullableString(measurement.units),
    lengthPx: toNumberOrNull(measurement.length_px),
  };
}

function normalizeReferenceLine(rawReferenceLine) {
  const referenceLine = toObject(rawReferenceLine);

  if (!Object.keys(referenceLine).length) {
    return null;
  }

  return {
    y: toNumberOrNull(referenceLine.y),
    relativeY: toNumberOrNull(referenceLine.relative_y),
    role: toNullableString(referenceLine.role),
  };
}

function normalizeOverlayFrame(rawFrame) {
  const frame = toObject(rawFrame);
  const rle = toObject(frame.rle);
  const points = toArray(frame.points);
  const segments = toArray(frame.segments);

  return {
    frameIndex: toNumberOrNull(frame.frame_index),
    rle: {
      size: toArray(rle.size),
      counts: toArray(rle.counts),
    },
    present: Boolean(frame.present),
    confidence: toNumberOrNull(frame.confidence),
    areaPx: toNumberOrNull(frame.area_px),
    points: points.map(normalizePoint),
    segments: segments.map(normalizeSegment),
    measurement: normalizeMeasurement(frame.measurement),
  };
}

export function normalizeOverlayDocument(rawDocument) {
  const document = toObject(rawDocument);
  const frames = toArray(document.frames);
  const points = toArray(document.points);
  const segments = toArray(document.segments);

  if (frames.length === 0 && points.length === 0) {
    return null;
  }

  return {
    schemaVersion: toNumberOrNull(document.schema_version),
    overlayType: toNullableString(document.overlay_type),
    overlayKey: toNullableString(document.overlay_key),
    kind: toNullableString(document.kind),
    sopInstanceUid: toNullableString(document.sop_instance_uid),
    instanceId: toNumberOrNull(document.instance_id),
    modelName: toNullableString(document.model_name),
    modelVersion: toNullableString(document.model_version),
    frameCount: toNumberOrNull(document.frame_count),
    frameWidth: toNumberOrNull(document.frame_width),
    frameHeight: toNumberOrNull(document.frame_height),
    fps: toNumberOrNull(document.fps),
    coordinateSpace: toNullableString(document.coordinate_space),
    geometryType: toNullableString(document.geometry_type),
    selectedFrameIndex: toNumberOrNull(document.selected_frame_index),
    maskFormat: toNullableString(document.mask_format),
    maskResolution: toArray(document.mask_resolution),
    points: points.map(normalizePoint),
    segments: segments.map(normalizeSegment),
    frames: frames.map(normalizeOverlayFrame),
    measurement: normalizeMeasurement(document.measurement),
    referenceLine: normalizeReferenceLine(document.reference_line),
    dopplerRegion: toObject(document.doppler_region),
    frameSelection: toObject(document.frame_selection),
    quality: toObject(document.quality),
  };
}

export function formatStudyOverlaysDto(rawOverlays) {
  return toArray(rawOverlays)
    .map(rawOverlay => {
      const overlay = toObject(rawOverlay);
      const overlayType = toNullableString(overlay.overlay_type);

      return {
        sopInstanceUid: toNullableString(overlay.sop_instance_uid),
        instanceId: toNumberOrNull(overlay.instance_id),
        overlayType,
        overlayKey: toNullableString(overlay.overlay_key),
        kind: toNullableString(overlay.kind),
        structured: Boolean(overlay.structured),
        status: toNullableString(overlay.status) || "not_available",
        available: Boolean(overlay.available),
        modelName: toNullableString(overlay.model_name),
        modelVersion: toNullableString(overlay.model_version),
        frameCount: toNumberOrNull(overlay.frame_count),
        frameWidth: toNumberOrNull(overlay.frame_width),
        frameHeight: toNumberOrNull(overlay.frame_height),
        fps: toNumberOrNull(overlay.fps),
        geometryType: toNullableString(overlay.geometry_type),
        maskFormat: toNullableString(overlay.mask_format),
        meanConfidence: toNumberOrNull(overlay.mean_confidence),
        framesWithMask: toNumberOrNull(overlay.frames_with_mask),
        measurementName: toNullableString(overlay.measurement_name),
        measurementValue: toNumberOrNull(overlay.measurement_value),
        measurementUnits: toNullableString(overlay.measurement_units),
        displayName: toNullableString(overlay.display_name),
        familyLabel: toNullableString(overlay.family_label),
        summaryValueLabel: toNullableString(overlay.summary_value_label),
        summaryValueKind: toNullableString(overlay.summary_value_kind),
        confidenceScore: toNumberOrNull(overlay.confidence_score),
        confidenceSource: toNullableString(overlay.confidence_source),
        confidenceThreshold: toNumberOrNull(overlay.confidence_threshold),
        lowConfidence: Boolean(overlay.low_confidence),
        warnings: toArray(overlay.warnings),
        generatedAt: toNullableString(overlay.generated_at),
        payloadUrl: toNullableString(overlay.payload_url),
        document: normalizeOverlayDocument(overlay.document),
      };
    })
    .filter(overlay => overlay.sopInstanceUid && overlay.overlayType);
}

export function formatStudyOverlayInstancesDto(rawInstances) {
  return toArray(rawInstances)
    .map(rawInstance => {
      const instance = toObject(rawInstance);

      return {
        sopInstanceUid: toNullableString(instance.sop_instance_uid),
        instanceId: toNumberOrNull(instance.instance_id),
        predictedView: toNullableString(instance.predicted_view),
        predictedViewLabel: toNullableString(instance.predicted_view_label),
        predictedViewConfidence: toNumberOrNull(
          instance.predicted_view_confidence
        ),
        overlayStatus: toNullableString(instance.overlay_status) || "none",
        overlayCount: toNumberOrNull(instance.overlay_count) ?? 0,
        availableOverlayCount:
          toNumberOrNull(instance.available_overlay_count) ?? 0,
        runningOverlayCount:
          toNumberOrNull(instance.running_overlay_count) ?? 0,
        failedOverlayCount: toNumberOrNull(instance.failed_overlay_count) ?? 0,
        lowConfidenceCount:
          toNumberOrNull(instance.low_confidence_count) ?? 0,
      };
    })
    .filter(instance => instance.sopInstanceUid);
}
