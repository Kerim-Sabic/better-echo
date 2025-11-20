import { apiClient } from "./shared/client";

export const inferPanEchoApi = async ({ study_uid, instance_id }) => {
    const { data } = await apiClient.get("/infer/panecho", {
        params: study_uid ? { study_uid } : { instance_id },
    });
    return data;
};

export const inferEchoPrimeApi = async (study_uid) => {
    const { data } = await apiClient.get("/infer/echoprime", {
        params: { study_uid },
    });
    return data;
};

export const inferEchonetDynamicLVSegmentationApi = async (sopInstanceUID) => {
    const { data } = await apiClient.post(
        "/infer/echonet-dynamic/LV-segmentation",
        {},
        {
            params: { sop_instance_uid: sopInstanceUID }, // goes into query string
        }
    );
    return data;
};

export const inferMeasurements2DApi = async (sopInstanceUID, modelWeights, force = false) => {
    const { data } = await apiClient.post(
        "/infer/measurements/2d",
        {},
        {
            params: {
                sop_instance_uid: sopInstanceUID,
                model_weights: modelWeights,
                force,
            },
        }
    );
    return data;
};
