import { apiClient } from "../client";

export const getStudyOverlaysApi = async (
  studyUid,
  { preview = true } = {}
) => {
  const response = await apiClient.get(
    `/studies/${encodeURIComponent(studyUid)}/overlays`,
    {
      params: { preview },
      validateStatus: s => (s >= 200 && s < 300) || s === 404,
    }
  );

  return {
    status: response.status,
    data: response.status === 404 ? null : response.data,
  };
};

export const getInstanceOverlayPayloadApi = async (
  sopInstanceUid,
  overlayType,
  { preview = true } = {}
) => {
  const response = await apiClient.get(
    `/instances/${encodeURIComponent(sopInstanceUid)}/overlays/${encodeURIComponent(overlayType)}/payload`,
    {
      params: { preview },
      validateStatus: s => (s >= 200 && s < 300) || s === 404,
    }
  );

  return {
    status: response.status,
    data: response.status === 404 ? null : response.data,
  };
};
