import { apiClient } from "@/api/client";

export async function getAdminUsersApi() {
  const response = await apiClient.get("/admin/users");
  return response.data;
}
