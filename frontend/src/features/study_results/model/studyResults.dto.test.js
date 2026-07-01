import { NO_DERIVED_DICOM_VIEWER_TOKEN } from "./studyResults.constants";
import { formatDynamicMeasurementsCombinedResultsDto } from "./studyResults.dto";

function formatDynamicMeasurements(data, status = 200) {
  return formatDynamicMeasurementsCombinedResultsDto({ status, data });
}

describe("formatDynamicMeasurementsCombinedResultsDto", () => {
  test("builds viewer refresh token from measurement_results derived DICOM ids", () => {
    const result = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [
              {
                derived_dicom: {
                  orthanc_instance_id: "orthanc-derived-1",
                  relative_dicom_path: "fallback.dcm",
                },
              },
            ],
          },
        ],
      },
    });

    expect(result.state).toBe("ready");
    expect(result.viewerRefreshToken).toMatch(/^derived-media-/);
    expect(result.viewerRefreshToken).not.toContain("orthanc-derived-1");
    expect(result.viewerRefreshToken.length).toBeLessThan(48);
  });

  test("does not use output path when a measurement result has no derived DICOM ref", () => {
    const result = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [
              {
                output_path: "measurement_spectral/study/lvotvmax.jpg",
              },
            ],
          },
        ],
      },
    });

    expect(result.viewerRefreshToken).toBe(NO_DERIVED_DICOM_VIEWER_TOKEN);
  });

  test("keeps stable no-derived-media token while measurements are still pending", () => {
    const result = formatDynamicMeasurements(
      {
        status: "pending",
        measurement_results: {
          instances: [
            {
              results: [{ output_path: "measurements_2D/study/rv_base.mp4" }],
            },
          ],
        },
      },
      202
    );

    expect(result.state).toBe("pending");
    expect(result.viewerRefreshToken).toBe(NO_DERIVED_DICOM_VIEWER_TOKEN);
  });

  test("builds stable deduped derived DICOM token regardless of result order", () => {
    const first = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [
              { derived_dicom: { orthanc_instance_id: "derived-b" } },
              { derived_dicom: { orthanc_instance_id: "derived-a" } },
              { derived_dicom: { orthanc_instance_id: "derived-b" } },
            ],
          },
        ],
      },
    });

    const second = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [
              { derived_dicom: { orthanc_instance_id: "derived-b" } },
              { derived_dicom: { orthanc_instance_id: "derived-a" } },
            ],
          },
        ],
      },
    });

    expect(first.viewerRefreshToken).toMatch(/^derived-media-/);
    expect(first.viewerRefreshToken).not.toContain("derived-a");
    expect(first.viewerRefreshToken).not.toContain("derived-b");
    expect(second.viewerRefreshToken).toBe(first.viewerRefreshToken);
  });

  test("changes derived DICOM token when derived media identity changes", () => {
    const first = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [{ derived_dicom: { orthanc_instance_id: "derived-a" } }],
          },
        ],
      },
    });

    const second = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [{ derived_dicom: { orthanc_instance_id: "derived-b" } }],
          },
        ],
      },
    });

    expect(second.viewerRefreshToken).not.toBe(first.viewerRefreshToken);
  });

  test("keeps viewer refresh token bounded for long derived DICOM paths", () => {
    const results = Array.from({ length: 35 }, (_, index) => ({
      derived_dicom: {
        relative_dicom_path: `ai_derived_dicom_videos/study/${"nested-path/".repeat(60)}derived-${index}.dcm`,
      },
    }));
    const result = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results,
          },
        ],
      },
    });

    expect(result.viewerRefreshToken).toMatch(/^derived-media-/);
    expect(result.viewerRefreshToken.length).toBeLessThan(48);
    expect(result.viewerRefreshToken).not.toContain("ai_derived_dicom_videos");
    expect(result.viewerRefreshToken).not.toContain("nested-path");
  });
});
