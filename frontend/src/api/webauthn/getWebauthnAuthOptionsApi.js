import { apiClient } from "../client";

export const getWebauthnAuthOptionsApi = async username => {
  const { data } = await apiClient.post("/auth/webauthn/options/authenticate", { username });
  return data;
};
