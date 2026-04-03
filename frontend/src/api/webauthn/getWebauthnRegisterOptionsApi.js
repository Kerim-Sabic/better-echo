import { apiClient } from "../client";

export const getWebauthnRegisterOptionsApi = async () => {
  const { data } = await apiClient.post("/webauthn/registration/start");
  return data;
};
