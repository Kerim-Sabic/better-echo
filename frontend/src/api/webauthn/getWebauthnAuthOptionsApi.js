import { apiClient } from "../client";

export const getWebauthnAuthOptionsApi = async username => {
  const { data } = await apiClient.post("/webauthn/authentication/start", { username });
  return data;
};
