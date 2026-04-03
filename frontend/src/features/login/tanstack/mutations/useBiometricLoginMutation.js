import { useMutation } from "@tanstack/react-query";
import { loginRepository } from "@/features/login/model/loginRepository";

export function useBiometricLoginMutation() {
  return useMutation({
    mutationFn: payload => loginRepository.completeBiometricLogin(payload),
  });
}
