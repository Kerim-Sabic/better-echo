import { apiClient } from "@/api/client";

export async function deleteAdminUserApi(userId) {
  const response = await apiClient.delete(`/admin/users/${userId}`);
  return response.data;
}
