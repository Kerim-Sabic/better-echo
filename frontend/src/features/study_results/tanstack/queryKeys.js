export const studyResultsKeys = {
  all: ["studyResults"],
  panecho: studyUid => ["combinedResults", studyUid],
  dynamicMeasurements: studyUid => ["dynamicMeasurementsResults", studyUid],
  llmReport: studyUid => ["llmReportResults", studyUid],
  meta: studyUid => ["studyMeta", studyUid],
};
