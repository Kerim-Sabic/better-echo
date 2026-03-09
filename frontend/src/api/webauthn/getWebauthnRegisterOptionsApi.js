import { apiClient } from "../client";

export const getWebauthnRegisterOptionsApi = async () => {
  const { data } = await apiClient.post("/auth/webauthn/options/register");
  return data;
};
