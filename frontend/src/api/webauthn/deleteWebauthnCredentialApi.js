import { apiClient } from "../client";

export const deleteWebauthnCredentialApi = async credentialId => {
  const { data } = await apiClient.delete(`/auth/webauthn/credentials/${credentialId}`);
  return data;
};
