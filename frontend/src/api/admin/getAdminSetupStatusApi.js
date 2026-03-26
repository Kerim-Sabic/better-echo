import { apiClient } from "@/api/client";

export async function getAdminSetupStatusApi() {
  const response = await apiClient.get("/admin/setup-status");
  return response.data;
}
