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
          glsBullseye: {
            schema_version: 1,
            global: { value: -20, status: "normal" },
            segments: [{ id: 1, measured: false }],
            trend: [{ study_uid: "study-1", value: -20 }],
          },
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
        {
          overlayType: "linear_measurement",
          overlayKey: "rv_base",
          sopInstanceUid: "sop-1",
          document: {
            overlayType: "linear_measurement",
            overlayKey: "rv_base",
            sopInstanceUid: "sop-1",
          },
        },
      ],
      aiOverlayInstances: [
        {
          sopInstanceUid: "sop-1",
          predictedView: "A4C",
          predictedViewLabel: "A4C",
          overlayStatus: "ready",
          overlayCount: 2,
        },
      ],
    });

    expect(payload.studyAnalysisMeasurements.totalMeasurements).toBe(2);
    expect(payload.studyAnalysisMeasurements.glsBullseye.global.value).toBe(-20);
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
      {
        overlayType: "linear_measurement",
        overlayKey: "rv_base",
        sopInstanceUid: "sop-1",
        document: {
          overlayType: "linear_measurement",
          overlayKey: "rv_base",
          sopInstanceUid: "sop-1",
        },
      },
    ]);
    expect(payload.aiOverlays[0]).not.toHaveProperty("sopInstanceUID");
    expect(payload.aiOverlays[0].document).not.toHaveProperty("sopInstanceUID");
    expect(payload.aiOverlayInstances).toEqual([
      {
        sopInstanceUid: "sop-1",
        predictedView: "A4C",
        predictedViewLabel: "A4C",
        overlayStatus: "ready",
        overlayCount: 2,
      },
    ]);
  });
});
