import { apiClient, parseRetryAfter } from "../client";

export const startStudyPipelineApi = async (
  studyUid,
  {
    run_mode = "upload_preview",
    cleanup_scope = "none",
    uploaded_instance_uids = [],
  } = {}
) => {
  const response = await apiClient.post(
    `/studies/${encodeURIComponent(studyUid)}/pipeline/start`,
    {
      run_mode,
      cleanup_scope,
      uploaded_instance_uids,
    }
  );

  return {
    status: response.status,
    data: response.data,
    retryAfter: parseRetryAfter(response),
  };
};
