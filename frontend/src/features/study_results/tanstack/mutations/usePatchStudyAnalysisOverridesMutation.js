import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

export function usePatchStudyAnalysisOverridesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyUid, overrides }) =>
      studyResultsRepository.patchStudyAnalysisOverrides(
        studyUid,
        overrides
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["studyAnalysisCombinedResults", variables.studyUid],
      });

      queryClient.invalidateQueries({
        queryKey: ["llmReportResults", variables.studyUid],
      });
    },
  });
}
