import { apiClient } from "../client";

export const getVendorLogTailApi = async ({ lines = 200 } = {}) => {
  const response = await apiClient.get("/vendor-access/logs/tail", {
    params: { lines },
  });
  return response.data;
};
