import { useMutation, useQueryClient } from "@tanstack/react-query";
import { newStudyRepository } from "@/features/new_study/model/newStudyRepository";

export function useCancelStudyPipelineMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: studyUid => newStudyRepository.cancelStudyPipeline(studyUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    },
  });
}
