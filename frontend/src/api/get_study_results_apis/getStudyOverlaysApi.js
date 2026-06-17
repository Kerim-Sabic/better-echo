import { apiClient } from "../client";

function normalizeOverlayPayloadUrl(payloadUrl) {
  const value = String(payloadUrl || "").trim();
  if (value.startsWith("/api/")) {
    return value.slice(4);
  }
  return value;
}

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

export const getOverlayPayloadByUrlApi = async (
  payloadUrl,
  { preview = true } = {}
) => {
  const response = await apiClient.get(
    normalizeOverlayPayloadUrl(payloadUrl),
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
