import { apiClient } from "./shared/client";

export const loginApi = async (username, password) => {
    const { data } = await apiClient.post("/login", { username, password });
    return data;
};

export const logoutApi = async () => {
    const { data } = await apiClient.post("/logout", {});
    return data;
};

export const checkAuthApi = async () => {
    const { data } = await apiClient.get("/check-auth");
    return data;
};

export const getWebauthnStatusApi = async () => {
    const { data } = await apiClient.get("/webauthn/status");
    return data;
};

export const getWebauthnRegisterOptionsApi = async () => {
    const { data } = await apiClient.post("/webauthn/registration/start");
    return data;
};

export const completeWebauthnRegisterApi = async (payload) => {
    const { data } = await apiClient.post("/webauthn/registration/complete", payload);
    return data;
};

export const deleteWebauthnCredentialApi = async (credentialId) => {
    const { data } = await apiClient.delete(`/webauthn/credentials/${credentialId}`);
    return data;
};

export const getWebauthnAuthOptionsApi = async (username) => {
    const { data } = await apiClient.post("/webauthn/authentication/start", { username });
    return data;
};

export const completeWebauthnAuthApi = async (payload) => {
    const { data } = await apiClient.post("/webauthn/authentication/complete", payload);
    return data;
};
