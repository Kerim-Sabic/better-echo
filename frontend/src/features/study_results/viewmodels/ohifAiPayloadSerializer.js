export function buildStudyResultsOhifAiPayload({
  studyUid,
  studyAnalysisCombinedResultsState,
  studyAnalysisCombinedResultsData,
  llmReportEnabled,
  llmReportResultsState,
  llmReportResultsData,
  llmReportResultsDetail,
  studyAnalysisEditorViewModel,
}) {
  const studyAnalysisDisplay = studyAnalysisCombinedResultsData?.display ?? {
    mainMeasurements: [],
    measurementSections: [],
    totalMeasurements: null,
  };

  const llmEchoReport = {
    mainTitle: llmReportResultsData?.mainTitle ?? null,
    sections: llmReportResultsData?.sections ?? [],
    reportGeneratedAt: llmReportResultsData?.reportGeneratedAt ?? null,
  };

  return {
    sentAt: new Date().toISOString(),
    studyUid,

    studyAnalysisCombinedResultsState,
    studyAnalysisMeasurements: {
      totalMeasurements: studyAnalysisDisplay.totalMeasurements,
      mainMeasurements: studyAnalysisDisplay.mainMeasurements,
      measurementSections: studyAnalysisDisplay.measurementSections,
    },

    studyAnalysisEditorState: {
      hasOverrides:
        studyAnalysisEditorViewModel?.hasStudyAnalysisOverrides ?? false,
      overridesUpdatedAt:
        studyAnalysisEditorViewModel?.studyAnalysisOverridesUpdatedAt ?? null,
      isReportStale: studyAnalysisEditorViewModel?.isAiReportStale ?? false,
      canRegenerateAiReport:
        studyAnalysisEditorViewModel?.canRegenerateAiReport ?? false,
      isRegeneratingAiReport:
        studyAnalysisEditorViewModel?.isRegeneratingAiReport ?? false,
      regenerateAiReportErrorMessage:
        studyAnalysisEditorViewModel?.regenerateAiReportErrorMessage ?? null,
    },

    llmReportEnabled,
    llmReportResultsState,
    llmReportResultsDetail,
    llmEchoReport,
  };
}
