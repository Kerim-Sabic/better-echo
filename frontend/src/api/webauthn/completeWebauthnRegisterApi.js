import { apiClient } from "../client";

export const completeWebauthnRegisterApi = async payload => {
  const { data } = await apiClient.post("/webauthn/registration/complete", payload);
  return data;
};
