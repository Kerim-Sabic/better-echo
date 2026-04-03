import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "@/contexts/AuthenticationContext";
import {
  getWebauthnStatusApi,
  getWebauthnRegisterOptionsApi,
  completeWebauthnRegisterApi,
  deleteWebauthnCredentialApi,
} from "@/api/webauthn";
import { b64uToBuf, serializePublicKeyCredential } from "@/lib/webauthn";
import { getStoredTheme, setStoredTheme } from "@/lib/theme";
import { useElectronRuntimeConfig } from "@/hooks/useElectronRuntimeConfig";

export function useDashboardHeaderViewModel() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const { runtimeConfig } = useElectronRuntimeConfig();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBiometricStatusLoading, setIsBiometricStatusLoading] = useState(false);
  const [isBiometricRemoving, setIsBiometricRemoving] = useState(false);
  const [biometricErrorMessage, setBiometricErrorMessage] = useState("");
  const [themeMode, setThemeMode] = useState(() => getStoredTheme());
  const [biometricStatus, setBiometricStatus] = useState({
    enrolled: false,
    credentialIds: [],
    credentialCount: 0,
  });

  const fetchBiometricStatus = useCallback(async () => {
    setIsBiometricStatusLoading(true);
    try {
      const response = await getWebauthnStatusApi();

      setBiometricStatus({
        enrolled: Boolean(response?.enrolled),
        credentialIds: Array.isArray(response?.credential_ids) ? response.credential_ids : [],
        credentialCount: Number(response?.credential_count ?? 0),
      });
      setBiometricErrorMessage("");
    } catch (error) {
      setBiometricErrorMessage("Unable to load biometric status.");
    } finally {
      setIsBiometricStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    fetchBiometricStatus();
  }, [isUserMenuOpen, fetchBiometricStatus]);

  const closeUserMenu = useCallback(() => {
    setIsUserMenuOpen(false);
  }, []);

  const onToggleUserMenu = useCallback(() => {
    setIsUserMenuOpen(previousValue => !previousValue);
  }, []);

  const onLogout = useCallback(async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.warn("Logout failed:", error);
    } finally {
      closeUserMenu();
    }
  }, [closeUserMenu, logout, navigate]);

  const onOpenServerAdmin = useCallback(() => {
    navigate("/server-admin");
    closeUserMenu();
  }, [closeUserMenu, navigate]);

  const onEnrollBiometrics = useCallback(async () => {
    if (!window.PublicKeyCredential) {
      setBiometricErrorMessage("WebAuthn is not supported on this browser.");
      return;
    }

    setBiometricErrorMessage("");
    setIsBiometricStatusLoading(true);

    try {
      const optionsResponse = await getWebauthnRegisterOptionsApi();

      if (!optionsResponse?.publicKey) {
        throw new Error("Missing publicKey options from backend.");
      }

      const publicKeyOptions = {
        ...optionsResponse.publicKey,
        challenge: b64uToBuf(optionsResponse.publicKey.challenge),
        user: {
          ...optionsResponse.publicKey.user,
          id: b64uToBuf(optionsResponse.publicKey.user.id),
        },
        excludeCredentials: (optionsResponse.publicKey.excludeCredentials || []).map(credential => ({
          ...credential,
          id: b64uToBuf(credential.id),
        })),
      };

      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
      const serializedCredential = serializePublicKeyCredential(credential);

      await completeWebauthnRegisterApi({ credential: serializedCredential });
      await fetchBiometricStatus();
    } catch (error) {
      const backendMessage = error?.response?.data?.detail;
      const fallbackMessage = error?.message || "Biometric enrollment failed.";
      setBiometricErrorMessage(backendMessage || fallbackMessage);
    } finally {
      setIsBiometricStatusLoading(false);
    }
  }, [fetchBiometricStatus]);

  const onRemoveBiometrics = useCallback(async () => {
    const credentialId = biometricStatus.credentialIds?.[0];

    if (!credentialId) {
      setBiometricErrorMessage("No biometric credential found.");
      return;
    }

    setBiometricErrorMessage("");
    setIsBiometricRemoving(true);

    try {
      await deleteWebauthnCredentialApi(credentialId);
      await fetchBiometricStatus();
    } catch (error) {
      setBiometricErrorMessage("Failed to remove biometric credential.");
    } finally {
      setIsBiometricRemoving(false);
    }
  }, [biometricStatus.credentialIds, fetchBiometricStatus]);

  const onToggleTheme = useCallback(() => {
    const nextTheme = themeMode === "dark" ? "light" : "dark";
    const storedTheme = setStoredTheme(nextTheme);
    setThemeMode(storedTheme);
  }, [themeMode]);

  const userDisplayName = useMemo(() => {
    return user?.fullName || user?.full_name || user?.username || "User";
  }, [user]);

  const userRoleLabel = useMemo(() => {
    return user?.role || "Doctor";
  }, [user]);

  const userInitials = useMemo(() => {
    return userDisplayName
      .split(" ")
      .map(part => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [userDisplayName]);

  return {
    hasAuthenticatedUser: Boolean(user),

    userDisplayName,
    userRoleLabel,
    userInitials,

    isUserMenuOpen,
    onToggleUserMenu,
    closeUserMenu,

    isBiometricEnrolled: biometricStatus.enrolled,
    biometricCredentialCount: biometricStatus.credentialCount,
    isBiometricStatusLoading,
    isBiometricRemoving,
    biometricErrorMessage,
    onEnrollBiometrics,
    onRemoveBiometrics,

    isDarkTheme: themeMode === "dark",
    onToggleTheme,

    canOpenServerAdmin: runtimeConfig?.runtimeMode === "server" && user?.role === "admin",
    onOpenServerAdmin,
    onLogout,
  };
}
