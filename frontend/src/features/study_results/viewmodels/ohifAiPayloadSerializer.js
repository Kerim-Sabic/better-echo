export function buildStudyResultsOhifAiPayload({
  studyUid,
  panechoEchoprimeCombinedResultsState,
  panechoEchoprimeCombinedResultsData,
}) {
  const panechoEchoprimeCombinedResultsDisplay =
    panechoEchoprimeCombinedResultsData?.display ?? {
      mainMeasurements: [],
      measurementSections: [],
      totalMeasurements: null,
    };

  return {
    version: 1,
    sentAt: new Date().toISOString(),
    studyUID: studyUid ?? null,
    state: panechoEchoprimeCombinedResultsState ?? "loading",
    panechoEchoprimeCombinedResultsState: panechoEchoprimeCombinedResultsState ?? "loading",
    aiMeasurements: {
      state: panechoEchoprimeCombinedResultsState ?? "loading",
      totalMeasurements: panechoEchoprimeCombinedResultsDisplay.totalMeasurements,
      mainMeasurements: panechoEchoprimeCombinedResultsDisplay.mainMeasurements,
      Measurements: panechoEchoprimeCombinedResultsDisplay.measurementSections,
    },
  };
}
