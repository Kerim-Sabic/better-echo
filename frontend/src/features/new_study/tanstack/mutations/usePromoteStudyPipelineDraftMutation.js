import { useMutation, useQueryClient } from "@tanstack/react-query";
import { newStudyRepository } from "@/features/new_study/model/newStudyRepository";

export function usePromoteStudyPipelineDraftMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: studyUid => newStudyRepository.promoteStudyPipelineDraft(studyUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    },
  });
}
