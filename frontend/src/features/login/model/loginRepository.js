import { loginApi } from "@/api/authentication";
import {
  getWebauthnAuthOptionsApi,
  completeWebauthnAuthApi,
} from "@/api/webauthn";
import {
  formatAuthResponse,
  formatWebauthnAuthOptionsDto,
} from "./login.dto";

export const loginRepository = {
  async loginWithPassword({ username, password }) {
    const rawLoginResponse = await loginApi(username, password);
    const formattedLoginResponse = formatAuthResponse(rawLoginResponse);
    return formattedLoginResponse;
  },

  async getBiometricAuthOptions({ username = "" } = {}) {
    const rawOptionsResponse = await getWebauthnAuthOptionsApi(username);
    const formattedOptionsResponse = formatWebauthnAuthOptionsDto(rawOptionsResponse);
    return formattedOptionsResponse;
  },

  async completeBiometricLogin(payload) {
    const rawLoginResponse = await completeWebauthnAuthApi(payload);
    const formattedLoginResponse = formatAuthResponse(rawLoginResponse);
    return formattedLoginResponse;
  },
};
