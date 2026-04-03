import { apiClient } from "../client";

export const getStudiesApi = async () => {
  const { data } = await apiClient.get("/studies");
  return data;
};
