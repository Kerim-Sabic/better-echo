import { buildStudyResultsOhifAiPayload } from "./ohifAiPayloadSerializer";

describe("buildStudyResultsOhifAiPayload", () => {
  test("preserves measurements/report fields and adds generic overlays", () => {
    const payload = buildStudyResultsOhifAiPayload({
      studyUid: "study-1",
      studyAnalysisCombinedResultsState: "ready",
      studyAnalysisCombinedResultsData: {
        display: {
          totalMeasurements: 2,
          mainMeasurements: [{ key: "ef", value: 60 }],
          measurementSections: [{ title: "LV", items: [] }],
        },
      },
      llmReportEnabled: true,
      llmReportResultsState: "ready",
      llmReportResultsData: {
        mainTitle: "Report",
        sections: [{ title: "Summary", body: "Normal" }],
        reportGeneratedAt: "2026-06-08T00:00:00Z",
      },
      llmReportResultsDetail: null,
      studyAnalysisEditorViewModel: {
        hasStudyAnalysisOverrides: true,
        studyAnalysisOverridesUpdatedAt: "2026-06-08T00:00:00Z",
      },
      apiBaseUrl: "http://localhost:8000/api",
      aiOverlaysState: "ready",
      aiOverlays: [
        {
          overlayType: "lv_segmentation",
          sopInstanceUid: "sop-1",
          document: { sopInstanceUid: "sop-1" },
        },
      ],
    });

    expect(payload.studyAnalysisMeasurements.totalMeasurements).toBe(2);
    expect(payload.llmEchoReport.mainTitle).toBe("Report");
    expect(payload.studyAnalysisEditorState.hasOverrides).toBe(true);
    expect(payload.apiBaseUrl).toBe("http://localhost:8000/api");
    expect(payload.aiOverlaysState).toBe("ready");
    expect(payload.aiOverlays).toEqual([
      {
        overlayType: "lv_segmentation",
        sopInstanceUid: "sop-1",
        document: {
          sopInstanceUid: "sop-1",
        },
      },
    ]);
  });
});
