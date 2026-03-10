import { apiClient } from "../client";

export const getWebauthnStatusApi = async () => {
  const { data } = await apiClient.get("/webauthn/status");
  return data;
};
