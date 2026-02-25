import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";
import { dashboardKeys } from "@/features/dashboard/tanstack/queryKeys";

/**
 * Hook to manage fetching and polling of the studies list.
 * Returns { studies, loading, refresh, setStudies }
 */
export function useStudiesListQuery() {
  const queryClient = useQueryClient();
  const queryKey = dashboardKeys.list();

  const query = useQuery({
    queryKey,
    queryFn: () => dashboardRepository.getStudies(),
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const setStudies = useCallback(
    updater => {
      queryClient.setQueryData(queryKey, prevStudies => {
        const safePrevStudies = Array.isArray(prevStudies) ? prevStudies : [];
        return typeof updater === "function" ? updater(safePrevStudies) : updater;
      });
    },
    [queryClient, queryKey]
  );

  return {
    ...query,
    studies: Array.isArray(query.data) ? query.data : [],
    loading: query.isLoading,
    refresh: query.refetch,
    setStudies,
  };
}
