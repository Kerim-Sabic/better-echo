import { apiClient, parseRetryAfter } from "../client";

function buildPipelineUrl(studyUid, pathSuffix) {
  return `/studies/${encodeURIComponent(studyUid)}/pipeline/${pathSuffix}`;
}

export const startStudyPipeline = async (
  studyUid,
  {
    run_mode = "upload_preview",
    cleanup_scope = "none",
    uploaded_instance_uids = [],
  } = {}
) => {
  const response = await apiClient.post(buildPipelineUrl(studyUid, "start"), {
    run_mode,
    cleanup_scope,
    uploaded_instance_uids,
  });

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};

export const getStudyPipelineStatus = async studyUid => {
  const response = await apiClient.get(buildPipelineUrl(studyUid, "status"));

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};

export const promoteStudyPipelineDraft = async studyUid => {
  const response = await apiClient.post(
    buildPipelineUrl(studyUid, "promote"),
    {},
    {
      validateStatus: s => (s >= 200 && s < 300) || s === 202 || s === 409,
    }
  );

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};

export const cancelStudyPipeline = async studyUid => {
  const response = await apiClient.post(
    buildPipelineUrl(studyUid, "cancel"),
    {},
    {
      validateStatus: s => (s >= 200 && s < 300) || s === 409,
    }
  );

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
