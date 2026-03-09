import { apiClient } from "../client";

export const getWebauthnStatusApi = async () => {
  const { data } = await apiClient.get("/auth/webauthn/status");
  return data;
};
