import {
  formatStudyOverlaysDto,
  normalizeOverlayDocument,
} from "./overlays.dto";

describe("overlay DTOs", () => {
  test("normalizes overlay metadata and payload document", () => {
    const result = formatStudyOverlaysDto([
      {
        sop_instance_uid: "sop-1",
        instance_id: 12,
        overlay_type: "lv_segmentation",
        kind: "lv_segmentation_overlay",
        structured: true,
        status: "completed",
        available: true,
        model_name: "MotionSegmentation",
        model_version: "v1",
        frame_count: 2,
        frame_width: 4,
        frame_height: 3,
        fps: 30,
        mask_format: "rle",
        mean_confidence: 0.8,
        frames_with_mask: 1,
        warnings: ["low_confidence"],
        generated_at: "2026-06-08T00:00:00Z",
        payload_url: "/api/instances/sop-1/overlays/lv_segmentation/payload",
        document: {
          schema_version: 1,
          kind: "lv_segmentation_overlay",
          sop_instance_uid: "sop-1",
          instance_id: 12,
          model_name: "MotionSegmentation",
          model_version: "v1",
          frame_count: 2,
          frame_width: 4,
          frame_height: 3,
          fps: 30,
          mask_format: "rle",
          mask_resolution: [4, 3],
          frames: [
            {
              rle: { size: [3, 4], counts: [5, 2, 5] },
              present: true,
              confidence: 0.9,
              area_px: 2,
            },
          ],
        },
      },
    ]);

    expect(result).toEqual([
      {
        sopInstanceUid: "sop-1",
        instanceId: 12,
        overlayType: "lv_segmentation",
        kind: "lv_segmentation_overlay",
        structured: true,
        status: "completed",
        available: true,
        modelName: "MotionSegmentation",
        modelVersion: "v1",
        frameCount: 2,
        frameWidth: 4,
        frameHeight: 3,
        fps: 30,
        maskFormat: "rle",
        meanConfidence: 0.8,
        framesWithMask: 1,
        warnings: ["low_confidence"],
        generatedAt: "2026-06-08T00:00:00Z",
        payloadUrl: "/api/instances/sop-1/overlays/lv_segmentation/payload",
        document: {
          schemaVersion: 1,
          kind: "lv_segmentation_overlay",
          sopInstanceUid: "sop-1",
          instanceId: 12,
          modelName: "MotionSegmentation",
          modelVersion: "v1",
          frameCount: 2,
          frameWidth: 4,
          frameHeight: 3,
          fps: 30,
          maskFormat: "rle",
          maskResolution: [4, 3],
          frames: [
            {
              rle: { size: [3, 4], counts: [5, 2, 5] },
              present: true,
              confidence: 0.9,
              areaPx: 2,
            },
          ],
        },
      },
    ]);
  });

  test("returns null document when no frames are present", () => {
    expect(normalizeOverlayDocument({ frames: [] })).toBeNull();
  });
});
