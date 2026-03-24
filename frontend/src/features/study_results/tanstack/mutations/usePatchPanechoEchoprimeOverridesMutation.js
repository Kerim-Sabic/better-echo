import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

export function usePatchPanechoEchoprimeOverridesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyUid, overrides }) =>
      studyResultsRepository.patchPanechoEchoprimeOverrides(
        studyUid,
        overrides
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["panechoEchoprimeCombinedResults", variables.studyUid],
      });

      queryClient.invalidateQueries({
        queryKey: ["llmReportResults", variables.studyUid],
      });
    },
  });
}
