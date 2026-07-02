import { apiClient } from "../client";

export const uploadDicomApi = async (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await apiClient.post("/upload-dicom", formData, { onUploadProgress });
    return data;
};
