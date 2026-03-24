import { apiClient } from "../client";

export const patchPanechoEchoprimeOverridesApi = async (
  studyUid,
  overrides
) => {
  const response = await apiClient.patch(
    `/studies/${encodeURIComponent(studyUid)}/PanEcho-EchoPrime-overrides`,
    { overrides }
  );

  return {
    status: response.status,
    data: response.data,
  };
};
