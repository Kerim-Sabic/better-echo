import { apiClient } from "./shared/client";

export const listStudiesApi = async () => {
    const { data } = await apiClient.get("/studies");
    return data;
};

export const patchStudyApi = async (id, payload) => {
    const { data } = await apiClient.patch(`/studies/${id}`, payload);
    return data;
};

export const deleteStudyApi = async (id) => {
    const { data } = await apiClient.delete(`/studies/${id}`);
    return data;
};

