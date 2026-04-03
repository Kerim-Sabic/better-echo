import { apiClient, parseRetryAfter } from "../client";

export const promoteStudyPipelineDraftApi = async studyUid => {
  const response = await apiClient.post(
    `/studies/${encodeURIComponent(studyUid)}/pipeline/promote`,
    {},
    {
      validateStatus: status => (status >= 200 && status < 300) || status === 202 || status === 409,
    }
  );

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};
