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

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
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
      })
    );
    expect(result[0].document).toEqual(
      expect.objectContaining({
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
      })
    );
    expect(result[0].document.frames[0]).toEqual(
      expect.objectContaining({
        rle: { size: [3, 4], counts: [5, 2, 5] },
        present: true,
        confidence: 0.9,
        areaPx: 2,
      })
    );
  });

  test("returns null document when no frames are present", () => {
    expect(normalizeOverlayDocument({ frames: [] })).toBeNull();
  });

  test("normalizes linear measurement point-line documents", () => {
    const document = normalizeOverlayDocument({
      schema_version: 1,
      overlay_type: "linear_measurement",
      overlay_key: "rv_base",
      kind: "linear_measurement_overlay",
      sop_instance_uid: "sop-2",
      coordinate_space: "source_pixel",
      geometry_type: "point_line",
      frames: [
        {
          frame_index: 0,
          present: true,
          points: [
            { id: "p0", x: 10, y: 20, confidence: null },
            { id: "p1", x: 40, y: 20, confidence: null },
          ],
          segments: [{ from: "p0", to: "p1", role: "measurement_line" }],
          measurement: { name: "rv_base", value: 3.4, units: "cm", length_px: 30 },
        },
      ],
      quality: { frames_with_geometry: 1 },
    });

    expect(document).toEqual(
      expect.objectContaining({
        overlayType: "linear_measurement",
        overlayKey: "rv_base",
        kind: "linear_measurement_overlay",
        sopInstanceUid: "sop-2",
        coordinateSpace: "source_pixel",
        geometryType: "point_line",
        quality: { frames_with_geometry: 1 },
      })
    );
    expect(document.frames[0].points).toEqual([
      { id: "p0", x: 10, y: 20, confidence: null },
      { id: "p1", x: 40, y: 20, confidence: null },
    ]);
    expect(document.frames[0].segments).toEqual([
      { from: "p0", to: "p1", role: "measurement_line" },
    ]);
    expect(document.frames[0].measurement).toEqual({
      name: "rv_base",
      value: 3.4,
      units: "cm",
      lengthPx: 30,
    });
  });

  test("normalizes doppler selected-frame documents", () => {
    const document = normalizeOverlayDocument({
      schema_version: 1,
      overlay_type: "doppler_measurement",
      overlay_key: "lvotvmax",
      kind: "doppler_measurement_overlay",
      sop_instance_uid: "sop-3",
      coordinate_space: "source_pixel",
      geometry_type: "point_marker",
      selected_frame_index: 4,
      points: [{ id: "p0", x: 220, y: 260, confidence: 0.91 }],
      segments: [],
      reference_line: { y: 190, relative_y: 12, role: "doppler_baseline" },
      measurement: { name: "lvotvmax", value: 102.4, units: "cm/s" },
      doppler_region: { y0: 88 },
      frame_selection: { selected_frame_index: 4 },
      quality: { low_confidence: false },
    });

    expect(document).toEqual(
      expect.objectContaining({
        overlayType: "doppler_measurement",
        overlayKey: "lvotvmax",
        kind: "doppler_measurement_overlay",
        sopInstanceUid: "sop-3",
        coordinateSpace: "source_pixel",
        geometryType: "point_marker",
        selectedFrameIndex: 4,
        points: [{ id: "p0", x: 220, y: 260, confidence: 0.91 }],
        segments: [],
        referenceLine: { y: 190, relativeY: 12, role: "doppler_baseline" },
        measurement: {
          name: "lvotvmax",
          value: 102.4,
          units: "cm/s",
          lengthPx: null,
        },
        dopplerRegion: { y0: 88 },
        frameSelection: { selected_frame_index: 4 },
        quality: { low_confidence: false },
      })
    );
  });
});
