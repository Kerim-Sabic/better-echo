import { apiClient } from "../client";

export const postGenerateLlmReportApi = async studyUid => {
  const response = await apiClient.post(
    `/studies/${encodeURIComponent(studyUid)}/llm/report/generate`
  );

  return {
    status: response.status,
    data: response.data,
  };
};
