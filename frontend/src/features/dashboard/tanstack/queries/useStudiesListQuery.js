import { useQuery } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";

export function useStudiesListQuery() {
  return useQuery({
    queryKey: ["studies"],
    queryFn: () => dashboardRepository.getStudies(),
    staleTime: 1000 * 10,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
}
