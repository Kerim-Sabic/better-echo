import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";

export function useUpdateStudyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyId, patchData }) => dashboardRepository.updateStudy(studyId, patchData),
    onSuccess: () => {
      queryClient.invalidateQueries(["studies"]);
    },
  });
}
