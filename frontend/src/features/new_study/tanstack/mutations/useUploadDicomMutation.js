import { useMutation } from "@tanstack/react-query";
import { newStudyRepository } from "@/features/new_study/model/newStudyRepository";

export function useUploadDicomMutation() {
  return useMutation({
    mutationFn: file => newStudyRepository.uploadDicom(file),
  });
}
