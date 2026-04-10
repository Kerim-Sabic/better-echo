import { apiClient } from "../client";

export const deleteVendorUserApi = async userId => {
  const response = await apiClient.delete(`/vendor-access/users/${userId}`);
  return response.data;
};
