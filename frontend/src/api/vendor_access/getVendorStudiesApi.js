import { apiClient } from "../client";

export const getVendorStudiesApi = async ({ page = 1, pageSize = 5 } = {}) => {
  const response = await apiClient.get("/vendor-access/studies", {
    params: {
      page,
      page_size: pageSize,
    },
  });
  return response.data;
};
