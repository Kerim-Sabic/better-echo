import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAdminSetupStatusApi } from "@/api/admin";
import { AuthContext } from "@/contexts/AuthenticationContext";
import { b64uToBuf, serializePublicKeyCredential } from "@/lib/webauthn";

import { loginRepository } from "@/features/login/model/loginRepository";
import { useLoginMutation } from "@/features/login/tanstack/mutations/useLoginMutation";
import { useBiometricLoginMutation } from "@/features/login/tanstack/mutations/useBiometricLoginMutation";
import { useElectronRuntimeConfig } from "@/hooks/useElectronRuntimeConfig";

const SESSION_HINT_KEY = "authSessionHint";

function persistSessionHint() {
  try {
    localStorage.setItem(SESSION_HINT_KEY, "1");
  } catch {
    // Ignore storage errors
  }
}

export function getPostLoginRoute(user, runtimeMode) {
  if (user?.principalType === "vendor") {
    return "/vendor-admin";
  }

  if (user?.role === "admin" && runtimeMode === "server") {
    return "/server-admin";
  }

  return "/dashboard";
}

export function useLoginPageViewModel() {
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);
  const { runtimeConfig, openClientRuntimeConfigEditor } = useElectronRuntimeConfig();

  // 1. Data Fetching & Mutations (Server State)
  const loginMutation = useLoginMutation();
  const biometricLoginMutation = useBiometricLoginMutation();

  // 2. Local UI State
  // 2.1 Credential Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // 2.2 Error Feedback State
  const [error, setError] = useState("");
  const [canOpenServerAdmin, setCanOpenServerAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSetupStatus() {
      if (runtimeConfig?.runtimeMode !== "server") {
        setCanOpenServerAdmin(false);
        return;
      }

      try {
        const setupStatus = await getAdminSetupStatusApi();
        if (active) {
          setCanOpenServerAdmin(Boolean(setupStatus?.bootstrap_required));
        }
      } catch {
        if (active) {
          setCanOpenServerAdmin(false);
        }
      }
    }

    loadSetupStatus();

    return () => {
      active = false;
    };
  }, [runtimeConfig?.runtimeMode]);

  // 3. Handlers
  // 3.1 Shared success handler
  const handleLoginSuccess = (formattedLoginResponse) => {
    setUser(formattedLoginResponse.user);
    persistSessionHint();
    navigate(
      getPostLoginRoute(formattedLoginResponse.user, runtimeConfig?.runtimeMode),
      { replace: true }
    );
  };

  // 3.2 Credential login handler
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const formattedLoginResponse = await loginMutation.mutateAsync({
        username,
        password,
      });

      handleLoginSuccess(formattedLoginResponse);
    } catch (err) {
      console.error("Login error:", err);
      const detailMessage = err?.response?.data?.detail;
      setError(detailMessage || "Login failed. Please try again.");
    }
  };

  // 3.3 Biometric login handler
  const handleBiometricLogin = async () => {
    setError("");

    if (!window.PublicKeyCredential) {
      setError("Biometric login is not supported in this browser.");
      return;
    }

    try {
      const rawOptions = await loginRepository.getBiometricAuthOptions({ username: "" });
      const rawPublicKey = rawOptions?.publicKey || {};

      const publicKey = {
        ...rawPublicKey,
        challenge: b64uToBuf(rawPublicKey.challenge),
        allowCredentials: (rawPublicKey.allowCredentials || []).map((rawCredential) => ({
          ...rawCredential,
          id: b64uToBuf(rawCredential.id),
        })),
      };

      const assertion = await navigator.credentials.get({ publicKey });
      const serializedCredential = serializePublicKeyCredential(assertion);

      const formattedLoginResponse = await biometricLoginMutation.mutateAsync({
        username: "",
        credential: serializedCredential,
      });

      handleLoginSuccess(formattedLoginResponse);
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

  return {
    // 1. Data
    username,
    password,
    error,

    // 2. TanStack Loading State
    isLoading: loginMutation.isPending,
    bioLoading: biometricLoginMutation.isPending,

    // 3. Form Handlers
    setUsername,
    setPassword,
    handleSubmit,
    handleBiometricLogin,
    canOpenServerAdmin,
    onOpenServerAdmin: () => navigate("/server-admin"),
    canReconfigureClientRuntime: runtimeConfig?.runtimeMode === "client",
    onOpenClientRuntimeConfigEditor: openClientRuntimeConfigEditor,
  };
}
