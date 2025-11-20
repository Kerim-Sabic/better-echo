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
