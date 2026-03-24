export function buildStudyResultsOhifAiPayload({
  studyUid,
  panechoEchoprimeCombinedResultsState,
  panechoEchoprimeCombinedResultsData,
  llmReportResultsState,
  llmReportResultsData,
  llmReportResultsDetail,
}) {
  const panechoEchoprimeCombinedResultsDisplay =
    panechoEchoprimeCombinedResultsData?.display ?? {
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
    
    llmReportResultsState,
    llmReportResultsDetail,
    llmEchoReport,
  };
}
