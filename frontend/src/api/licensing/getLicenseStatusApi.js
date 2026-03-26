import { apiClient } from "@/api/client";

export async function getLicenseStatusApi() {
  const response = await apiClient.get("/licensing/status");
  return response.data;
}
