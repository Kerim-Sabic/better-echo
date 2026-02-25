import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "@/contexts/AuthenticationContext";
import { b64uToBuf, serializePublicKeyCredential } from "@/lib/webauthn";
import { loginRepository } from "@/features/login/model/loginRepository";
import { useLoginMutation } from "@/features/login/tanstack/mutations/useLoginMutation";
import { useBiometricLoginMutation } from "@/features/login/tanstack/mutations/useBiometricLoginMutation";

const SESSION_HINT_KEY = "authSessionHint";

function setSessionHint() {
  try {
    localStorage.setItem(SESSION_HINT_KEY, "1");
  } catch {
    // ignore storage errors
  }
}

export function useLoginPageViewModel() {
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);

  // --- Data Fetching & Mutations (Server State) ---
  const loginMutation = useLoginMutation();
  const biometricLoginMutation = useBiometricLoginMutation();

  // --- Local UI State ---
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // --- Actions / Handlers ---
  const handleSubmit = async event => {
    event.preventDefault();
    setError("");

    try {
      const formattedLoginResponse = await loginMutation.mutateAsync({ username, password });
      setUser(formattedLoginResponse.user);
      setSessionHint();
      navigate("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      const detailMessage = err?.response?.data?.detail;
      setError(detailMessage || "Login failed. Please try again.");
    }
  };

  const handleBiometricLogin = async () => {
    setError("");

    if (!window.PublicKeyCredential) {
      setError("Biometric login is not supported in this browser.");
      return;
    }

    try {
      const options = await loginRepository.getBiometricAuthOptions({ username: "" });
      const rawPublicKey = options.publicKey || {};

      const publicKey = {
        ...rawPublicKey,
        challenge: b64uToBuf(rawPublicKey.challenge),
        allowCredentials: (rawPublicKey.allowCredentials || []).map(credential => ({
          ...credential,
          id: b64uToBuf(credential.id),
        })),
      };

      const assertion = await navigator.credentials.get({ publicKey });
      const serializedCredential = serializePublicKeyCredential(assertion);

      const formattedLoginResponse = await biometricLoginMutation.mutateAsync({
        username: "",
        credential: serializedCredential,
      });

      setUser(formattedLoginResponse.user);
      setSessionHint();
      navigate("/dashboard");
    } catch (err) {
      console.error("Biometric login error:", err);
      if (err?.response?.status === 404) {
        setError(
          "Biometrics are not set up yet. Sign in with your username/password, then enroll biometrics from the Dashboard."
        );
        return;
      }
      const detailMessage = err?.response?.data?.detail;
      setError(detailMessage || "Biometric login failed. Please try again.");
    }
  };

  // --- Compose View Model ---
  return {
    username,
    password,
    error,
    isLoading: loginMutation.isPending,
    bioLoading: biometricLoginMutation.isPending,
    setUsername,
    setPassword,
    handleSubmit,
    handleBiometricLogin,
  };
}
