import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export const inferPanEchoApi = async ({ study_uid, instance_id }) => {
    const response = await axios.get(
        `${API_URL}/infer/panecho`,
        {
            params: study_uid ? {study_uid} : { instance_id },
            withCredentials: true,
        }
    );

    return response.data
};

export const inferEchoPrimeApi = async (study_uid) => {
    const response = await axios.get(
        `${API_URL}/infer/echoprime`,
        {
            params: { study_uid },
            withCredentials: true,
        }
    );
    
    return response.data
};

export const inferEchonetDynamicLVSegmentationApi = async (sopInstanceUID) => {
    const response = await axios.post(
        `${API_URL}/infer/echonet-dynamic/LV-segmentation`,
        {},
        {
            params: { sop_instance_uid: sopInstanceUID }, // goes into query string
            withCredentials: true,
        }
    );

    return response.data;
};

export const inferMeasurements2DApi = async (sopInstanceUID, modelWeights, force = false) => {
    const response = await axios.post(
        `${API_URL}/infer/measurements/2d`,
        {},
        {
            params: { sop_instance_uid: sopInstanceUID, model_weights: modelWeights, force },
            withCredentials: true,
        }
    );
    return response.data;
};
