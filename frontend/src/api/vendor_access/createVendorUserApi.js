import { apiClient } from "../client";

export const createVendorUserApi = async payload => {
  const response = await apiClient.post("/vendor-access/users", payload);
  return response.data;
};
