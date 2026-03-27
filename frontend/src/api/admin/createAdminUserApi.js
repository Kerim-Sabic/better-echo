import { apiClient } from "@/api/client";

export async function createAdminUserApi(payload) {
  const response = await apiClient.post("/admin/users", payload);
  return response.data;
}
