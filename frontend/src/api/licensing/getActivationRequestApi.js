import { apiClient } from "@/api/client";

export async function getActivationRequestApi() {
  const response = await apiClient.get("/licensing/activation-request");
  return response.data;
}
