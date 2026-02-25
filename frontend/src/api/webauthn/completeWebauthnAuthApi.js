import { apiClient } from "../client";

export const completeWebauthnAuthApi = async payload => {
  const { data } = await apiClient.post("/auth/webauthn/authenticate", payload);
  return data;
};
