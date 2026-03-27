export function buildStudyResultsOhifAiPayload({
  studyUid,
  studyAnalysisCombinedResultsState,
  studyAnalysisCombinedResultsData,
}) {
  const studyAnalysisCombinedResultsDisplay =
    studyAnalysisCombinedResultsData?.display ?? {
      mainMeasurements: [],
      measurementSections: [],
      totalMeasurements: null,
    };

  return {
    sentAt: new Date().toISOString(),
    studyUid,
    studyAnalysisCombinedResultsState,
    studyAnalysisMeasurements: {
      totalMeasurements: studyAnalysisCombinedResultsDisplay.totalMeasurements,
      mainMeasurements: studyAnalysisCombinedResultsDisplay.mainMeasurements,
      measurementSections: studyAnalysisCombinedResultsDisplay.measurementSections,
    },
  };
}
