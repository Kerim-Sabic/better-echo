import { apiClient } from "../client";

export const patchStudyApi = async (id, payload) => {
  const { data } = await apiClient.patch(`/studies/${id}`, payload);
  return data;
};
