import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export const uploadDicomApi = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(
        `${API_URL}/upload-dicom`,
        formData,
        { withCredentials: true}
    );

    return response.data;
};