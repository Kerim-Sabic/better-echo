import { useQuery } from "@tanstack/react-query";
import { getVendorStudiesApi } from "@/api/vendor_access";

export function useVendorStudiesQuery({ page, pageSize, enabled = true }) {
  return useQuery({
    queryKey: ["vendorStudies", page, pageSize],
    enabled,
    queryFn: () => getVendorStudiesApi({ page, pageSize }),
    staleTime: 0,
  });
}
