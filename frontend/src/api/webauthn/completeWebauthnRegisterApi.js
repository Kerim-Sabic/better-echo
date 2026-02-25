import { apiClient } from "../client";

export const completeWebauthnRegisterApi = async payload => {
  const { data } = await apiClient.post("/auth/webauthn/register", payload);
  return data;
};
