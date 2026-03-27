import { apiClient } from "../client";
import { persistDesktopAuthToken } from "../desktopAuth";

export const loginApi = async (username, password) => {
  const { data } = await apiClient.post("/login", { username, password });
  persistDesktopAuthToken(data?.auth_token || "");
  return data;
};
