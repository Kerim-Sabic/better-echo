import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export const inferEfApi = async ({ study_uid, instance_id }) => {
    const response = await axios.get(
        `${API_URL}/infer/ef`,
        {
            params: study_uid ? {study_uid} : { instance_id },
            withCredentials: true,
        }
    );

    return response.data
};