import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";
import { dashboardKeys } from "@/features/dashboard/tanstack/queryKeys";

export function useDeleteStudyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyId }) => dashboardRepository.deleteStudy(studyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.list() });
    },
  });
}
