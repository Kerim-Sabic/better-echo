import { apiClient } from "../client";

export const getVendorUserActivityApi = async () => {
  const response = await apiClient.get("/vendor-access/users/activity");
  return response.data;
};
