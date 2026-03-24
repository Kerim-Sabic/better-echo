import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studyResultsRepository } from "@/features/study_results/model/studyResultsRepository";

export function useGenerateLlmReportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyUid }) =>
      studyResultsRepository.generateLlmReport(studyUid),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["llmReportResults", variables.studyUid],
      });
    },
  });
}
