import { apiClient } from "../client";

export const listStudiesApi = async () => {
  const { data } = await apiClient.get("/studies");
  return data;
};
