import { apiClient } from "../client";

export const completeWebauthnAuthApi = async payload => {
  const { data } = await apiClient.post("/webauthn/authentication/complete", payload);
  return data;
};
