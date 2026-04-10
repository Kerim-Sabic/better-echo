import { apiClient } from "../client";

export const updateVendorUserApi = async (userId, payload) => {
  const response = await apiClient.put(`/vendor-access/users/${userId}`, payload);
  return response.data;
};
