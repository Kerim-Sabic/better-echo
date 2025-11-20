import { apiClient } from "./shared/client";

export const uploadDicomApi = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await apiClient.post("/upload-dicom", formData);
    return data;
};
