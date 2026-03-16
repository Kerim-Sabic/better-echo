import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardRepository } from "@/features/dashboard/model/dashboardRepository";

export function useDeleteStudyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyId }) => dashboardRepository.deleteStudy(studyId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });

      if (variables?.studyUid) {
        queryClient.removeQueries({
          queryKey: ["panechoEchoprimeCombinedResults", variables.studyUid],
          exact: true,
        });
      }
    },
  });
}
