import { DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN } from "./studyResults.constants";
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
    expect(result.viewerRefreshToken).toBe("orthanc-derived-1");
  });

  test("uses output path when a measurement result has no derived DICOM ref", () => {
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

    expect(result.viewerRefreshToken).toBe("measurement_spectral/study/lvotvmax.jpg");
  });

  test("keeps pending viewer token while measurements are still pending", () => {
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
    expect(result.viewerRefreshToken).toBe(DYNAMIC_MEASUREMENTS_PENDING_VIEWER_TOKEN);
  });

  test("builds stable deduped token regardless of result order", () => {
    const first = formatDynamicMeasurements({
      status: "complete",
      measurement_results: {
        instances: [
          {
            results: [
              { output_path: "b.mp4" },
              { output_path: "a.mp4" },
              { output_path: "b.mp4" },
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
              { output_path: "b.mp4" },
              { output_path: "a.mp4" },
            ],
          },
        ],
      },
    });

    expect(first.viewerRefreshToken).toBe("a.mp4|b.mp4");
    expect(second.viewerRefreshToken).toBe(first.viewerRefreshToken);
  });
});
