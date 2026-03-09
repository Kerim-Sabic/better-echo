import { useMutation } from "@tanstack/react-query";
import { loginRepository } from "@/features/login/model/loginRepository";

export function useLoginMutation() {
  return useMutation({
    mutationFn: ({ username, password }) =>
      loginRepository.loginWithPassword({ username, password }),
  });
}
