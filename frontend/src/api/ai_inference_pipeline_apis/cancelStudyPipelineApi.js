import { apiClient, parseRetryAfter } from "../client";

export const cancelStudyPipelineApi = async studyUid => {
  const response = await apiClient.post(
    `/studies/${encodeURIComponent(studyUid)}/pipeline/cancel`,
    {},
    {
      validateStatus: status => (status >= 200 && status < 300) || status === 409,
    }
  );

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};
