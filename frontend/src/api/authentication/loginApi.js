import { apiClient } from "../client";

export const loginApi = async (username, password) => {
  const { data } = await apiClient.post("/login", { username, password });
  return data;
};
