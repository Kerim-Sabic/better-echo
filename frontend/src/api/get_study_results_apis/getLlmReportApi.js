import { apiClient } from "../client";

export const getLlmReportApi = async (
  studyUid,
  { preview = true } = {}
) => {
  const response = await apiClient.get(
    `/studies/${encodeURIComponent(studyUid)}/llm-report-results`,
    {
      params: { preview },
      validateStatus: s => (s >= 200 && s < 300) || s === 202 || s === 404,
    }
  );

  return {
    status: response.status,
    data: response.data,
  };
};
