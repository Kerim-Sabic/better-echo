import { apiClient } from "../client";

export const patchStudyAnalysisOverridesApi = async (
  studyUid,
  overrides
) => {
  const response = await apiClient.patch(
    `/studies/${encodeURIComponent(studyUid)}/study-analysis-overrides`,
    { overrides }
  );

  return {
    status: response.status,
    data: response.data,
  };
};
