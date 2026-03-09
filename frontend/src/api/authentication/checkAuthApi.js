import { apiClient } from "../client";

export const checkAuthApi = async () => {
  const { data } = await apiClient.get("/check-auth");
  return data;
};
