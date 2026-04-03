import { apiClient } from "../client";
import { persistDesktopAuthToken } from "../desktopAuth";

export const completeWebauthnAuthApi = async payload => {
  const { data } = await apiClient.post("/webauthn/authentication/complete", payload);
  persistDesktopAuthToken(data?.auth_token || "");
  return data;
};
