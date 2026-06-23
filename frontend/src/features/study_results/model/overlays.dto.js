import {
  toArray,
  toObject,
  toNullableString,
} from "@/general_components/utility/dataShapeUtils";

function toNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOverlayFrame(rawFrame) {
  const frame = toObject(rawFrame);
  const rle = toObject(frame.rle);

  return {
    rle: {
      size: toArray(rle.size),
      counts: toArray(rle.counts),
    },
    present: Boolean(frame.present),
    confidence: toNumberOrNull(frame.confidence),
    areaPx: toNumberOrNull(frame.area_px),
  };
}

export function normalizeOverlayDocument(rawDocument) {
  const document = toObject(rawDocument);
  const frames = toArray(document.frames);

  if (frames.length === 0) {
    return null;
  }

  return {
    schemaVersion: toNumberOrNull(document.schema_version),
    kind: toNullableString(document.kind),
    sopInstanceUid: toNullableString(document.sop_instance_uid),
    instanceId: toNumberOrNull(document.instance_id),
    modelName: toNullableString(document.model_name),
    modelVersion: toNullableString(document.model_version),
    frameCount: toNumberOrNull(document.frame_count),
    frameWidth: toNumberOrNull(document.frame_width),
    frameHeight: toNumberOrNull(document.frame_height),
    fps: toNumberOrNull(document.fps),
    maskFormat: toNullableString(document.mask_format),
    maskResolution: toArray(document.mask_resolution),
    frames: frames.map(normalizeOverlayFrame),
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
        maskFormat: toNullableString(overlay.mask_format),
        meanConfidence: toNumberOrNull(overlay.mean_confidence),
        framesWithMask: toNumberOrNull(overlay.frames_with_mask),
        warnings: toArray(overlay.warnings),
        generatedAt: toNullableString(overlay.generated_at),
        payloadUrl: toNullableString(overlay.payload_url),
        document: normalizeOverlayDocument(overlay.document),
      };
    })
    .filter(overlay => overlay.sopInstanceUid && overlay.overlayType);
}
