import { apiClient } from "../client";

export const deleteStudyApi = async id => {
  const { data } = await apiClient.delete(`/studies/${id}`);
  return data;
};
