import { useQuery } from "@tanstack/react-query";
import { getVendorLogTailApi } from "@/api/vendor_access";

const POLL_INTERVAL_MS = 5000;

export function useVendorLogTailQuery({ lines = 200, enabled = true } = {}) {
  return useQuery({
    queryKey: ["vendorLogTail", lines],
    enabled,
    queryFn: () => getVendorLogTailApi({ lines }),
    staleTime: 0,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
}
