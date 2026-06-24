import { renderHook } from "@testing-library/react";
import { NO_DERIVED_DICOM_VIEWER_TOKEN } from "@/features/study_results/model/studyResults.constants";
import { useStudyResultsViewModel } from "./useStudyResultsViewModel";

const mockNavigate = jest.fn();
const mockUseStudyDetailsQuery = jest.fn();
const mockUseStudyAnalysisCombinedResultsQuery = jest.fn();
const mockUseDynamicMeasurementsCombinedResultsQuery = jest.fn();
const mockUseStudyOverlaysQuery = jest.fn();
const mockUseLlmReportResultsQuery = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null }),
}));

jest.mock("@/api/client", () => ({
  apiClient: { defaults: { baseURL: "http://localhost:8000/api" } },
}));

jest.mock("@/api/licensing", () => ({
  getLicenseStatusApi: jest.fn(),
}));

jest.mock("@/features/study_results/tanstack/queries/useStudyDetailsQuery", () => ({
  useStudyDetailsQuery: (...args) => mockUseStudyDetailsQuery(...args),
}));

jest.mock("@/features/study_results/tanstack/queries/useStudyAnalysisCombinedResultsQuery", () => ({
  useStudyAnalysisCombinedResultsQuery: (...args) =>
    mockUseStudyAnalysisCombinedResultsQuery(...args),
}));

jest.mock("@/features/study_results/tanstack/queries/useDynamicMeasurementsCombinedResultsQuery", () => ({
  useDynamicMeasurementsCombinedResultsQuery: (...args) =>
    mockUseDynamicMeasurementsCombinedResultsQuery(...args),
}));

jest.mock("@/features/study_results/tanstack/queries/useStudyOverlaysQuery", () => ({
  useStudyOverlaysQuery: (...args) => mockUseStudyOverlaysQuery(...args),
}));

jest.mock("@/features/study_results/tanstack/queries/useLlmReportResultsQuery", () => ({
  useLlmReportResultsQuery: (...args) => mockUseLlmReportResultsQuery(...args),
}));

jest.mock("@/features/study_results/viewmodels/useStudyAnalysisEditorViewModel", () => ({
  useStudyAnalysisEditorViewModel: () => ({
    hasStudyAnalysisOverrides: false,
    studyAnalysisOverridesUpdatedAt: null,
  }),
}));

jest.mock("@/features/study_results/viewmodels/pdf_printing/studyResultsPdfGenerator", () => ({
  openAiMeasurementsPrintPreview: jest.fn(),
  openAiReportPrintPreview: jest.fn(),
}));

jest.mock("@/features/study_results/viewmodels/pdf_printing/studyResultsPdfSerializer", () => ({
  buildStudyResultsPdfData: jest.fn(),
}));

function readyQuery(data) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  };
}

describe("useStudyResultsViewModel overlays", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStudyDetailsQuery.mockReturnValue(readyQuery({ llmEnabled: false }));
    mockUseStudyAnalysisCombinedResultsQuery.mockReturnValue(
      readyQuery({
        state: "ready",
        studyAnalysisCombinedResults: {
          display: {
            totalMeasurements: 1,
            mainMeasurements: [],
            measurementSections: [],
          },
        },
      })
    );
    mockUseDynamicMeasurementsCombinedResultsQuery.mockReturnValue(
      readyQuery({ state: "ready", viewerRefreshToken: "media-token" })
    );
    mockUseLlmReportResultsQuery.mockReturnValue(readyQuery(null));
  });

  test("exposes ai overlays and sends them through the OHIF payload", () => {
    const aiOverlays = [
      {
        overlayType: "lv_segmentation",
        sopInstanceUid: "sop-1",
        status: "completed",
        document: { sopInstanceUid: "sop-1" },
      },
      {
        overlayType: "linear_measurement",
        overlayKey: "rv_base",
        sopInstanceUid: "sop-1",
        status: "completed",
        document: { sopInstanceUid: "sop-1", overlayKey: "rv_base" },
      },
      {
        overlayType: "doppler_measurement",
        overlayKey: "lvotvmax",
        sopInstanceUid: "sop-2",
        status: "running",
        document: null,
      },
    ];
    const aiOverlayInstances = [
      {
        sopInstanceUid: "sop-1",
        predictedView: "A4C",
        predictedViewLabel: "A4C",
        overlayStatus: "ready",
        overlayCount: 2,
      },
    ];
    mockUseStudyOverlaysQuery.mockReturnValue(
      readyQuery({ aiOverlays, aiOverlayInstances })
    );

    const { result } = renderHook(() => useStudyResultsViewModel("study-1"));

    expect(result.current.aiOverlays).toBe(aiOverlays);
    expect(result.current.aiOverlayInstances).toBe(aiOverlayInstances);
    expect(result.current.aiOverlaysState).toBe("pending");
    expect(result.current.ohifAiPayload.aiOverlays).toBe(aiOverlays);
    expect(result.current.ohifAiPayload.aiOverlayInstances).toBe(aiOverlayInstances);
    expect(result.current.ohifAiPayload.aiOverlaysState).toBe("pending");
    expect(result.current.viewerRefreshToken).toBe("media-token");
  });

  test("uses no-derived-media token when dynamic results have no refresh token", () => {
    mockUseDynamicMeasurementsCombinedResultsQuery.mockReturnValue(
      readyQuery(null)
    );
    mockUseStudyOverlaysQuery.mockReturnValue(
      readyQuery({
        aiOverlays: [
          {
            overlayType: "lv_segmentation",
            sopInstanceUid: "sop-1",
            status: "completed",
            document: { sopInstanceUid: "sop-1" },
          },
        ],
      })
    );

    const { result } = renderHook(() => useStudyResultsViewModel("study-1"));

    expect(result.current.aiOverlaysState).toBe("ready");
    expect(result.current.viewerRefreshToken).toBe(NO_DERIVED_DICOM_VIEWER_TOKEN);
  });

  test("refetches overlays after dynamic measurements finish", () => {
    let dynamicState = "pending";
    const refetchStudyOverlays = jest.fn();

    mockUseDynamicMeasurementsCombinedResultsQuery.mockImplementation(() =>
      readyQuery({ state: dynamicState, viewerRefreshToken: "media-token" })
    );
    mockUseStudyOverlaysQuery.mockReturnValue({
      ...readyQuery({ aiOverlays: [], aiOverlayInstances: [] }),
      refetch: refetchStudyOverlays,
    });

    const { rerender } = renderHook(() => useStudyResultsViewModel("study-1"));
    expect(refetchStudyOverlays).not.toHaveBeenCalled();

    dynamicState = "ready";
    rerender();

    expect(refetchStudyOverlays).toHaveBeenCalledTimes(1);
  });
});
