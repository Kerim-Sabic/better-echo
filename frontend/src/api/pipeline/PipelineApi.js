import { apiClient, parseRetryAfter } from "../client";

function buildPipelineUrl(studyUid, pathSuffix) {
  return `/studies/${encodeURIComponent(studyUid)}/pipeline/${pathSuffix}`;
}


export const getStudyPipelineStatus = async studyUid => {
  const response = await apiClient.get(buildPipelineUrl(studyUid, "status"));

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};


export const regenerateStudyPipelineCombined = async studyUid => {
  const response = await apiClient.post(buildPipelineUrl(studyUid, "regenerate-combined"), {});

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};
