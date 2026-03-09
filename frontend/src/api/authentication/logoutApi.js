import { apiClient } from "../client";

export const logoutApi = async () => {
  const { data } = await apiClient.post("/logout", {});
  return data;
};
