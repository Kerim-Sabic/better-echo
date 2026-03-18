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
    sentAt: new Date().toISOString(),
    studyUid,
    panechoEchoprimeCombinedResultsState,
    panechoEchoprimeAiMeasurements: {
      totalMeasurements: panechoEchoprimeCombinedResultsDisplay.totalMeasurements,
      mainMeasurements: panechoEchoprimeCombinedResultsDisplay.mainMeasurements,
      measurementSections: panechoEchoprimeCombinedResultsDisplay.measurementSections,
    },
  };
}
