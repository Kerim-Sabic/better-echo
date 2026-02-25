import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";
import { dashboardKeys } from "@/features/dashboard/tanstack/queryKeys";

export function useUpdateStudyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyId, patchData }) => dashboardRepository.updateStudy(studyId, patchData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.list() });
    },
  });
}
