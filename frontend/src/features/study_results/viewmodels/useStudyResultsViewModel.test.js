import { renderHook } from "@testing-library/react";
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
    ];
    mockUseStudyOverlaysQuery.mockReturnValue(
      readyQuery({ aiOverlays })
    );

    const { result } = renderHook(() => useStudyResultsViewModel("study-1"));

    expect(result.current.aiOverlays).toBe(aiOverlays);
    expect(result.current.aiOverlaysState).toBe("ready");
    expect(result.current.ohifAiPayload.aiOverlays).toBe(aiOverlays);
    expect(result.current.ohifAiPayload.aiOverlaysState).toBe("ready");
    expect(result.current.viewerRefreshToken).toBe("media-token");
  });
});
