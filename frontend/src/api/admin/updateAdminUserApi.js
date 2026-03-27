import { apiClient } from "@/api/client";

export async function updateAdminUserApi(userId, payload) {
  const response = await apiClient.put(`/admin/users/${userId}`, payload);
  return response.data;
}
