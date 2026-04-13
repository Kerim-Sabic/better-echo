import { useQuery } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";

export function useStudiesListQuery({ pollingEnabled = true } = {}) {
  return useQuery({
    queryKey: ["studies"],
    queryFn: () => dashboardRepository.getStudies(),
    staleTime: 1000 * 10,
    refetchInterval: pollingEnabled ? 3000 : false,
    refetchIntervalInBackground: pollingEnabled,
  });
}
