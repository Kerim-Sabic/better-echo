import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";
import { studyResultsKeys } from "@/features/study_results/tanstack/queryKeys";

export function usePanechoEchoprimeOverridesMutation(studyUid) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: overrides => studyResultsRepository.updatePanechoEchoprimeOverrides(studyUid, overrides),
    onSuccess: () => {
      if (!studyUid) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: studyResultsKeys.panecho(studyUid), exact: true });
    },
  });
}
