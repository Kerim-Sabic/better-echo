export function buildStudyResultsOhifAiPayload({
  studyUid,
  panechoEchoprimeCombinedResultsState,
  panechoEchoprimeCombinedResultsData,
  llmReportResultsState,
  llmReportResultsData,
  llmReportResultsDetail,
  panechoEchoprimeEditorViewModel,
}) {
  const studyAnalysisCombinedResultsDisplay =
    studyAnalysisCombinedResultsData?.display ?? {
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

    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeAiMeasurements: {
      totalMeasurements: panechoEchoprimeCombinedResultsDisplay.totalMeasurements,
      mainMeasurements: panechoEchoprimeCombinedResultsDisplay.mainMeasurements,
      measurementSections: panechoEchoprimeCombinedResultsDisplay.measurementSections,
    },

    panechoEchoprimeEditorState: {
      hasOverrides:
        panechoEchoprimeEditorViewModel?.hasPanechoEchoprimeOverrides ?? false,
      overridesUpdatedAt:
        panechoEchoprimeEditorViewModel?.panechoEchoprimeOverridesUpdatedAt ??
        null,
      isReportStale:
        panechoEchoprimeEditorViewModel?.isAiReportStale ?? false,
      canRegenerateAiReport:
        panechoEchoprimeEditorViewModel?.canRegenerateAiReport ?? false,
      isRegeneratingAiReport:
        panechoEchoprimeEditorViewModel?.isRegeneratingAiReport ?? false,
      regenerateAiReportErrorMessage:
        panechoEchoprimeEditorViewModel?.regenerateAiReportErrorMessage ?? null,
    },

    llmReportResultsState,
    llmReportResultsDetail,
    llmEchoReport,
  };
}
