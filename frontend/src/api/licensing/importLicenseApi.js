import { apiClient } from "@/api/client";

export async function importLicenseApi(payload) {
  const response = await apiClient.post("/licensing/import", payload);
  return response.data;
}
