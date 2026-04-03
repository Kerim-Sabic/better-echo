import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthContext } from "@/contexts/AuthenticationContext";
import { useElectronRuntimeConfig } from "@/hooks/useElectronRuntimeConfig";
import {
  bootstrapAdminApi,
  createAdminUserApi,
  deleteAdminUserApi,
  getAdminSetupStatusApi,
  getAdminUsersApi,
  updateAdminUserApi,
} from "@/api/admin";
import {
  getActivationRequestApi,
  getLicenseStatusApi,
  importLicenseApi,
} from "@/api/licensing";

function readErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || error?.message || fallbackMessage;
}

function normalizeLicenseEnvelope(rawValue) {
  const parsed = JSON.parse(rawValue);

  const normalizedLicense = parsed?.license || parsed?.payload;
  if (!normalizedLicense || !parsed?.signature) {
    throw new Error("License file must contain license/payload and signature.");
  }

  return {
    license: normalizedLicense,
    signature: parsed.signature,
  };
}

function downloadJsonFallback(fileName, value) {
  const blob = new Blob([value], { type: "application/json;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

export function useServerAdminPageViewModel() {
  const navigate = useNavigate();
  const { user, login, logout } = useContext(AuthContext);
  const { runtimeConfig, loading: isRuntimeLoading } = useElectronRuntimeConfig();
  const importInputRef = useRef(null);

  const [setupStatus, setSetupStatus] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [users, setUsers] = useState([]);

  const [bootstrapForm, setBootstrapForm] = useState({
    username: "",
    password: "",
    fullName: "",
  });
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "doctor",
  });
  const [editForm, setEditForm] = useState({
    userId: null,
    username: "",
    fullName: "",
    role: "doctor",
    password: "",
  });
  const [loadingState, setLoadingState] = useState({
    page: true,
    bootstrap: false,
    exportLicense: false,
    importLicense: false,
    createUser: false,
    updateUser: false,
    deleteUserId: null,
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isServerRuntime = runtimeConfig?.runtimeMode === "server";
  const isAdmin = user?.role === "admin";
  const bootstrapRequired = Boolean(setupStatus?.bootstrap_required);
  const seatUsageLabel = setupStatus
    ? `${setupStatus.total_users} / ${setupStatus.max_users} users used`
    : "";

  const clearNotice = useCallback(() => {
    setErrorMessage("");
    setSuccessMessage("");
  }, []);

  const loadSetupState = useCallback(async () => {
    const [nextSetupStatus, nextLicenseStatus] = await Promise.all([
      getAdminSetupStatusApi(),
      getLicenseStatusApi(),
    ]);
    setSetupStatus(nextSetupStatus);
    setLicenseStatus(nextLicenseStatus);
    return nextSetupStatus;
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }

    const response = await getAdminUsersApi();
    setUsers(response.users || []);
  }, [isAdmin]);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      if (isRuntimeLoading) {
        return;
      }

      if (!isServerRuntime) {
        setLoadingState(current => ({ ...current, page: false }));
        return;
      }

      setLoadingState(current => ({ ...current, page: true }));
      try {
        const nextSetupStatus = await loadSetupState();
        if (!active) {
          return;
        }

        if (!nextSetupStatus.bootstrap_required && user?.role === "admin") {
          await loadUsers();
        } else if (active) {
          setUsers([]);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(readErrorMessage(error, "Failed to load server admin state."));
        }
      } finally {
        if (active) {
          setLoadingState(current => ({ ...current, page: false }));
        }
      }
    }

    loadPage();

    return () => {
      active = false;
    };
  }, [isRuntimeLoading, isServerRuntime, loadSetupState, loadUsers, user?.role]);

  const onBootstrapFieldChange = useCallback((field, value) => {
    setBootstrapForm(current => ({ ...current, [field]: value }));
  }, []);

  const onCreateFieldChange = useCallback((field, value) => {
    setCreateForm(current => ({ ...current, [field]: value }));
  }, []);

  const onEditFieldChange = useCallback((field, value) => {
    setEditForm(current => ({ ...current, [field]: value }));
  }, []);

  const onSelectEditUser = useCallback((userRecord) => {
    setEditForm({
      userId: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.full_name,
      role: userRecord.role,
      password: "",
    });
    clearNotice();
  }, [clearNotice]);

  const onCancelEdit = useCallback(() => {
    setEditForm({
      userId: null,
      username: "",
      fullName: "",
      role: "doctor",
      password: "",
    });
  }, []);

  const onBootstrapSubmit = useCallback(async (event) => {
    event.preventDefault();
    clearNotice();
    setLoadingState(current => ({ ...current, bootstrap: true }));

    try {
      await bootstrapAdminApi({
        username: bootstrapForm.username,
        password: bootstrapForm.password,
        full_name: bootstrapForm.fullName,
      });
      await login(bootstrapForm.username, bootstrapForm.password);
      const nextSetupStatus = await loadSetupState();
      if (!nextSetupStatus.bootstrap_required) {
        await loadUsers();
      }
      setBootstrapForm({ username: "", password: "", fullName: "" });
      setSuccessMessage("First admin created successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to bootstrap the first admin."));
    } finally {
      setLoadingState(current => ({ ...current, bootstrap: false }));
    }
  }, [bootstrapForm, clearNotice, loadSetupState, loadUsers, login]);

  const onExportActivationRequest = useCallback(async () => {
    clearNotice();
    setLoadingState(current => ({ ...current, exportLicense: true }));

    try {
      const activationRequest = await getActivationRequestApi();
      const contents = JSON.stringify(activationRequest, null, 2);

      if (window.electronAPI?.saveTextFile) {
        const result = await window.electronAPI.saveTextFile({
          title: "Export Activation Request",
          suggestedName: "activation-request.json",
          contents,
        });
        if (!result.canceled) {
          setSuccessMessage(`Activation request exported to ${result.filePath}.`);
        }
      } else {
        downloadJsonFallback("activation-request.json", contents);
        setSuccessMessage("Activation request exported.");
      }
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to export activation request."));
    } finally {
      setLoadingState(current => ({ ...current, exportLicense: false }));
    }
  }, [clearNotice]);

  const onChooseLicenseFile = useCallback(() => {
    clearNotice();
    importInputRef.current?.click();
  }, [clearNotice]);

  const onImportLicenseFile = useCallback(async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    clearNotice();
    setLoadingState(current => ({ ...current, importLicense: true }));

    try {
      const parsedPayload = normalizeLicenseEnvelope(await selectedFile.text());
      const nextLicenseStatus = await importLicenseApi(parsedPayload);
      setLicenseStatus(nextLicenseStatus);
      setSuccessMessage("License imported successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to import license file."));
    } finally {
      event.target.value = "";
      setLoadingState(current => ({ ...current, importLicense: false }));
    }
  }, [clearNotice]);

  const onCreateUserSubmit = useCallback(async (event) => {
    event.preventDefault();
    clearNotice();
    setLoadingState(current => ({ ...current, createUser: true }));

    try {
      await createAdminUserApi({
        username: createForm.username,
        password: createForm.password,
        full_name: createForm.fullName,
        role: createForm.role,
      });
      await Promise.all([loadSetupState(), loadUsers()]);
      setCreateForm({ username: "", password: "", fullName: "", role: "doctor" });
      setSuccessMessage("User created successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to create user."));
    } finally {
      setLoadingState(current => ({ ...current, createUser: false }));
    }
  }, [clearNotice, createForm, loadSetupState, loadUsers]);

  const onUpdateUserSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!editForm.userId) {
      return;
    }

    clearNotice();
    setLoadingState(current => ({ ...current, updateUser: true }));

    try {
      await updateAdminUserApi(editForm.userId, {
        username: editForm.username,
        full_name: editForm.fullName,
        role: editForm.role,
        ...(editForm.password.trim() ? { password: editForm.password } : {}),
      });
      await Promise.all([loadSetupState(), loadUsers()]);
      onCancelEdit();
      setSuccessMessage("User updated successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to update user."));
    } finally {
      setLoadingState(current => ({ ...current, updateUser: false }));
    }
  }, [clearNotice, editForm, loadSetupState, loadUsers, onCancelEdit]);

  const onDeleteUser = useCallback(async (userId) => {
    clearNotice();
    setLoadingState(current => ({ ...current, deleteUserId: userId }));

    try {
      await deleteAdminUserApi(userId);
      await Promise.all([loadSetupState(), loadUsers()]);
      if (editForm.userId === userId) {
        onCancelEdit();
      }
      setSuccessMessage("User deleted successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to delete user."));
    } finally {
      setLoadingState(current => ({ ...current, deleteUserId: null }));
    }
  }, [clearNotice, editForm.userId, loadSetupState, loadUsers, onCancelEdit]);

  const onGoToLogin = useCallback(() => {
    navigate("/login", { state: { from: { pathname: "/server-admin" } } });
  }, [navigate]);

  const onReturnToDashboard = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const onLogout = useCallback(async () => {
    clearNotice();
    await logout();
    setUsers([]);
    navigate("/login", { replace: true, state: { from: { pathname: "/server-admin" } } });
  }, [clearNotice, logout, navigate]);

  const canManageUsers = useMemo(
    () => isServerRuntime && !bootstrapRequired && isAdmin,
    [bootstrapRequired, isAdmin, isServerRuntime]
  );

  return {
    isRuntimeLoading,
    isServerRuntime,
    isPageLoading: loadingState.page,
    setupStatus,
    licenseStatus,
    users,
    seatUsageLabel,
    bootstrapRequired,
    isAdmin,
    user,
    errorMessage,
    successMessage,
    bootstrapForm,
    createForm,
    editForm,
    importInputRef,
    isBootstrapping: loadingState.bootstrap,
    isExportingActivationRequest: loadingState.exportLicense,
    isImportingLicense: loadingState.importLicense,
    isCreatingUser: loadingState.createUser,
    isUpdatingUser: loadingState.updateUser,
    deletingUserId: loadingState.deleteUserId,
    canManageUsers,
    onBootstrapFieldChange,
    onCreateFieldChange,
    onEditFieldChange,
    onSelectEditUser,
    onCancelEdit,
    onBootstrapSubmit,
    onExportActivationRequest,
    onChooseLicenseFile,
    onImportLicenseFile,
    onCreateUserSubmit,
    onUpdateUserSubmit,
    onDeleteUser,
    onGoToLogin,
    onReturnToDashboard,
    onLogout,
  };
}
