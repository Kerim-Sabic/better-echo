import { useMutation, useQueryClient } from "@tanstack/react-query";
import { newStudyRepository } from "@/features/new_study/model/newStudyRepository";

export function useStartStudyPipelineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      studyUid,
      runMode = "upload_preview",
      cleanupScope = "new_study",
      uploadedInstanceUids = [],
    }) =>
      newStudyRepository.startStudyPipeline(studyUid, {
        runMode,
        cleanupScope,
        uploadedInstanceUids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });
    },
  });
}
