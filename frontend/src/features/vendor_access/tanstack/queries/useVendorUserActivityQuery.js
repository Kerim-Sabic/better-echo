import { useQuery } from "@tanstack/react-query";
import { getVendorUserActivityApi } from "@/api/vendor_access";

export function useVendorUserActivityQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: ["vendorUserActivity"],
    enabled,
    queryFn: () => getVendorUserActivityApi(),
    staleTime: 0,
  });
}
