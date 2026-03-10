import { apiClient } from "../client";

export const deleteWebauthnCredentialApi = async credentialId => {
  const { data } = await apiClient.delete(`/webauthn/credentials/${credentialId}`);
  return data;
};
