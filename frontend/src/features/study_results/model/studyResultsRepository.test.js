jest.mock("@/api/get_study_results_apis", () => ({
  getDynamicMeasurementsCombinedResultsApi: jest.fn(),
  getInstanceOverlayPayloadApi: jest.fn(),
  getLlmReportApi: jest.fn(),
  getStudyAnalysisCombinedResultsApi: jest.fn(),
  getStudyOverlaysApi: jest.fn(),
}));

jest.mock("@/api/studies", () => ({
  getStudyByUidApi: jest.fn(),
}));

jest.mock("@/api/study_analysis_overrides/patchStudyAnalysisOverridesApi", () => ({
  patchStudyAnalysisOverridesApi: jest.fn(),
}));

jest.mock("@/api/llm_report_generate/postGenerateLlmReportApi", () => ({
  postGenerateLlmReportApi: jest.fn(),
}));

import {
  getInstanceOverlayPayloadApi,
  getStudyOverlaysApi,
} from "@/api/get_study_results_apis";
import { studyResultsRepository } from "./studyResultsRepository";

describe("studyResultsRepository overlays", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns empty overlays on metadata 404", async () => {
    getStudyOverlaysApi.mockResolvedValue({ status: 404, data: null });

    await expect(studyResultsRepository.getStudyOverlays("study-1")).resolves.toEqual({
      aiOverlays: [],
    });
    expect(getInstanceOverlayPayloadApi).not.toHaveBeenCalled();
  });

  test("fetches payload only for available overlays with payload urls", async () => {
    getStudyOverlaysApi.mockResolvedValue({
      status: 200,
      data: {
        overlays: [
          {
            sop_instance_uid: "sop-1",
            overlay_type: "lv_segmentation",
            kind: "lv_segmentation_overlay",
            status: "completed",
            available: true,
            structured: true,
            payload_url: "/api/instances/sop-1/overlays/lv_segmentation/payload",
          },
          {
            sop_instance_uid: "sop-2",
            overlay_type: "lv_segmentation",
            status: "not_available",
            available: false,
            payload_url: "/api/instances/sop-2/overlays/lv_segmentation/payload",
          },
        ],
      },
    });
    getInstanceOverlayPayloadApi.mockResolvedValue({
      status: 200,
      data: {
        kind: "lv_segmentation_overlay",
        frame_count: 1,
        frame_width: 4,
        frame_height: 3,
        mask_format: "rle",
        frames: [{ rle: { size: [3, 4], counts: [12] }, present: false }],
      },
    });

    const result = await studyResultsRepository.getStudyOverlays("study-1");

    expect(getInstanceOverlayPayloadApi).toHaveBeenCalledTimes(1);
    expect(getInstanceOverlayPayloadApi).toHaveBeenCalledWith(
      "sop-1",
      "lv_segmentation"
    );
    expect(result.aiOverlays).toHaveLength(2);
    expect(result.aiOverlays[0].document.frameCount).toBe(1);
    expect(result.aiOverlays[1].document).toBeNull();
  });
});
