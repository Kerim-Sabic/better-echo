import { apiClient } from "@/api/client";

export async function bootstrapAdminApi(payload) {
  const response = await apiClient.post("/admin/bootstrap-user", payload);
  return response.data;
}
