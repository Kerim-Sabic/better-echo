import { apiClient, parseRetryAfter } from "../client";

export const getPanechoEchoprimeCombinedResultsApi = async studyUid => {
  console.log("[API][PanechoCombined] Request studyUid:", studyUid);

  const response = await apiClient.get(
    `/studies/${encodeURIComponent(studyUid)}/PanEcho-EchoPrime-combined-results`,
    {
      validateStatus: s => (s >= 200 && s < 300) || s === 202 || s === 404,
    }
  );

  console.log("[API][PanechoCombined] Response:", {
    status: response.status,
    data: response.data,
    retryAfterHeader: response.headers?.["retry-after"] ?? null,
  });

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};
