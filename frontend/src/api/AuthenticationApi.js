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
    const { data } = await apiClient.get("/auth/webauthn/status");
    return data;
};

export const getWebauthnRegisterOptionsApi = async () => {
    const { data } = await apiClient.post("/auth/webauthn/options/register");
    return data;
};

export const completeWebauthnRegisterApi = async (payload) => {
    const { data } = await apiClient.post("/auth/webauthn/register", payload);
    return data;
};

export const deleteWebauthnCredentialApi = async (credentialId) => {
    const { data } = await apiClient.delete(`/auth/webauthn/credentials/${credentialId}`);
    return data;
};

export const getWebauthnAuthOptionsApi = async (username) => {
    const { data } = await apiClient.post("/auth/webauthn/options/authenticate", { username });
    return data;
};

export const completeWebauthnAuthApi = async (payload) => {
    const { data } = await apiClient.post("/auth/webauthn/authenticate", payload);
    return data;
};
