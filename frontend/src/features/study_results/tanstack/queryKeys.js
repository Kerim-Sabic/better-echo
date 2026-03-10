export const studyResultsKeys = {
  all: ["studyResults"],
  panecho: studyUid => ["studyResults", "panechoEchoprimeCombinedResults", studyUid],
  dynamicMeasurements: studyUid => ["studyResults", "dynamicMeasurementsCombinedResults", studyUid],
  llmReport: studyUid => ["studyResults", "llmReportResults", studyUid],
  meta: studyUid => ["studyResults", "studyMeta", studyUid],
};
