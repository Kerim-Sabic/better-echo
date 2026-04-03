import { apiClient } from "../client";
import { clearDesktopAuthToken } from "../desktopAuth";

export const logoutApi = async () => {
  try {
    const { data } = await apiClient.post("/logout", {});
    return data;
  } finally {
    clearDesktopAuthToken();
  }
};
