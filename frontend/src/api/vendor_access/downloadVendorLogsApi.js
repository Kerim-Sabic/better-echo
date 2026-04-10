import { apiClient } from "../client";

export const downloadVendorLogsApi = async () => {
  const response = await apiClient.get("/vendor-access/logs/download", {
    responseType: "blob",
  });
  return response;
};
