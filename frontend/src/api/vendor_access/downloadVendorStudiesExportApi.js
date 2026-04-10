import { apiClient } from "../client";

export const downloadVendorStudiesExportApi = async () => {
  const response = await apiClient.get("/vendor-access/exports/studies", {
    responseType: "blob",
  });
  return response;
};
