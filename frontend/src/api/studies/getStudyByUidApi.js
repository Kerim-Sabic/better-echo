import { apiClient } from "../client";

export const getStudyByUidApi = async studyUid => {
  const { data } = await apiClient.get(`/studies/${encodeURIComponent(studyUid)}`);
  return data;
};
