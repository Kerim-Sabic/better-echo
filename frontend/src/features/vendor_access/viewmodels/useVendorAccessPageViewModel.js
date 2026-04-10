import { useCallback, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthContext } from "@/contexts/AuthenticationContext";
import { useElectronRuntimeConfig } from "@/hooks/useElectronRuntimeConfig";
import { formatDateTime } from "@/general_components/utility/dateUtils";
import {
  createVendorUserApi,
  deleteVendorUserApi,
  downloadVendorLogsApi,
  downloadVendorStudiesExportApi,
  updateVendorUserApi,
} from "@/api/vendor_access";
import { useVendorStudiesQuery } from "@/features/vendor_access/tanstack/queries/useVendorStudiesQuery";
import { useVendorUserActivityQuery } from "@/features/vendor_access/tanstack/queries/useVendorUserActivityQuery";
import { useVendorLogTailQuery } from "@/features/vendor_access/tanstack/queries/useVendorLogTailQuery";

const DEFAULT_PAGE_SIZE = 5;

function normalizePrincipalType(user) {
  return user?.principalType || user?.principal_type || "user";
}

function readErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || error?.message || fallbackMessage;
}

function extractDownloadFileName(headers, fallbackName) {
  const headerValue =
    headers?.["content-disposition"] || headers?.["Content-Disposition"] || "";
  const match =
    /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(String(headerValue)) || [];
  return decodeURIComponent(match[1] || match[2] || fallbackName);
}

function downloadBlobFallback(fileName, blob) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to convert download payload."));
    reader.readAsDataURL(blob);
  });
}

async function saveBlobToDisk({
  blob,
  suggestedName,
  title,
  filters,
}) {
  if (window.electronAPI?.saveBinaryFile) {
    const base64Contents = await blobToBase64(blob);
    return window.electronAPI.saveBinaryFile({
      suggestedName,
      base64Contents,
      title,
      filters,
    });
  }

  downloadBlobFallback(suggestedName, blob);
  return { canceled: false };
}

export function useVendorAccessPageViewModel() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { runtimeConfig, loading: isRuntimeLoading } = useElectronRuntimeConfig();
  const [page, setPage] = useState(1);
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
    exportStudies: false,
    exportLogs: false,
    createUser: false,
    updateUser: false,
    deleteUserId: null,
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const principalType = normalizePrincipalType(user);
  const isServerRuntime = runtimeConfig?.runtimeMode === "server";
  const isVendor = principalType === "vendor";
  const isAdmin = user?.role === "admin";
  const queriesEnabled = Boolean(!isRuntimeLoading && isServerRuntime && isVendor);

  const studiesQuery = useVendorStudiesQuery({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    enabled: queriesEnabled,
  });
  const userActivityQuery = useVendorUserActivityQuery({ enabled: queriesEnabled });
  const logTailQuery = useVendorLogTailQuery({ lines: 200, enabled: queriesEnabled });

  const studiesPage = studiesQuery.data || {
    items: [],
    page,
    page_size: DEFAULT_PAGE_SIZE,
    total_items: 0,
    total_pages: 0,
  };
  const userActivity = userActivityQuery.data?.users || [];
  const logTail = logTailQuery.data || {
    file_path: "",
    updated_at: null,
    lines: [],
  };

  const clearNotice = useCallback(() => {
    setErrorMessage("");
    setSuccessMessage("");
  }, []);

  const pageTitle = useMemo(() => {
    return user?.fullName || user?.full_name || user?.username || "Vendor Access";
  }, [user]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      studiesQuery.refetch(),
      userActivityQuery.refetch(),
      logTailQuery.refetch(),
    ]);
  }, [logTailQuery, studiesQuery, userActivityQuery]);

  const onOpenStudy = useCallback(
    studyUid => {
      navigate(`/vendor-admin/studies/${encodeURIComponent(studyUid)}`);
    },
    [navigate]
  );

  const onPreviousPage = useCallback(() => {
    setPage(current => Math.max(current - 1, 1));
  }, []);

  const onNextPage = useCallback(() => {
    setPage(current => {
      const totalPages = Number(studiesPage.total_pages || 0);
      if (!totalPages) {
        return current + 1;
      }
      return Math.min(current + 1, totalPages);
    });
  }, [studiesPage.total_pages]);

  const onLogout = useCallback(async () => {
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const onRefresh = useCallback(async () => {
    clearNotice();
    await refetchAll();
  }, [clearNotice, refetchAll]);

  const onCreateFieldChange = useCallback((field, value) => {
    setCreateForm(current => ({ ...current, [field]: value }));
  }, []);

  const onEditFieldChange = useCallback((field, value) => {
    setEditForm(current => ({ ...current, [field]: value }));
  }, []);

  const onSelectEditUser = useCallback(userRecord => {
    setEditForm({
      userId: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.full_name || userRecord.fullName || "",
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

  const onDownloadStudiesExport = useCallback(async () => {
    clearNotice();
    setLoadingState(current => ({ ...current, exportStudies: true }));

    try {
      const response = await downloadVendorStudiesExportApi();
      const fileName = extractDownloadFileName(
        response.headers,
        "horalix-studies-export.zip"
      );
      const result = await saveBlobToDisk({
        blob: response.data,
        suggestedName: fileName,
        title: "Save Studies Export",
        filters: [{ name: "ZIP Files", extensions: ["zip"] }],
      });
      if (!result.canceled) {
        setSuccessMessage("Studies export downloaded successfully.");
      }
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to download studies export."));
    } finally {
      setLoadingState(current => ({ ...current, exportStudies: false }));
    }
  }, [clearNotice]);

  const onDownloadLogs = useCallback(async () => {
    clearNotice();
    setLoadingState(current => ({ ...current, exportLogs: true }));

    try {
      const response = await downloadVendorLogsApi();
      const fileName = extractDownloadFileName(response.headers, "horalix.log");
      const result = await saveBlobToDisk({
        blob: response.data,
        suggestedName: fileName,
        title: "Save Backend Logs",
        filters: [{ name: "Log Files", extensions: ["log", "txt"] }],
      });
      if (!result.canceled) {
        setSuccessMessage("Backend logs downloaded successfully.");
      }
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to download backend logs."));
    } finally {
      setLoadingState(current => ({ ...current, exportLogs: false }));
    }
  }, [clearNotice]);

  const onCreateUserSubmit = useCallback(async event => {
    event.preventDefault();
    clearNotice();
    setLoadingState(current => ({ ...current, createUser: true }));

    try {
      await createVendorUserApi({
        username: createForm.username,
        password: createForm.password,
        full_name: createForm.fullName,
        role: createForm.role,
      });
      await userActivityQuery.refetch();
      setCreateForm({
        username: "",
        password: "",
        fullName: "",
        role: "doctor",
      });
      setSuccessMessage("User created successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to create user."));
    } finally {
      setLoadingState(current => ({ ...current, createUser: false }));
    }
  }, [clearNotice, createForm, userActivityQuery]);

  const onUpdateUserSubmit = useCallback(async event => {
    event.preventDefault();
    if (!editForm.userId) {
      return;
    }

    clearNotice();
    setLoadingState(current => ({ ...current, updateUser: true }));

    try {
      await updateVendorUserApi(editForm.userId, {
        username: editForm.username,
        full_name: editForm.fullName,
        role: editForm.role,
        ...(editForm.password.trim() ? { password: editForm.password } : {}),
      });
      await userActivityQuery.refetch();
      onCancelEdit();
      setSuccessMessage("User updated successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to update user."));
    } finally {
      setLoadingState(current => ({ ...current, updateUser: false }));
    }
  }, [clearNotice, editForm, onCancelEdit, userActivityQuery]);

  const onDeleteUser = useCallback(async userId => {
    clearNotice();
    setLoadingState(current => ({ ...current, deleteUserId: userId }));

    try {
      await deleteVendorUserApi(userId);
      await userActivityQuery.refetch();
      if (editForm.userId === userId) {
        onCancelEdit();
      }
      setSuccessMessage("User deleted successfully.");
    } catch (error) {
      setErrorMessage(readErrorMessage(error, "Failed to delete user."));
    } finally {
      setLoadingState(current => ({ ...current, deleteUserId: null }));
    }
  }, [clearNotice, editForm.userId, onCancelEdit, userActivityQuery]);

  return {
    isRuntimeLoading,
    isServerRuntime,
    isVendor,
    isAdmin,
    hasAuthenticatedUser: Boolean(user),
    pageTitle,
    errorMessage,
    successMessage,
    isPageLoading:
      studiesQuery.isLoading || userActivityQuery.isLoading || logTailQuery.isLoading,
    isRefreshing:
      studiesQuery.isFetching || userActivityQuery.isFetching || logTailQuery.isFetching,
    isDownloadingStudiesExport: loadingState.exportStudies,
    isDownloadingLogs: loadingState.exportLogs,
    isCreatingUser: loadingState.createUser,
    isUpdatingUser: loadingState.updateUser,
    deletingUserId: loadingState.deleteUserId,
    studies: studiesPage.items || [],
    page: studiesPage.page || page,
    pageSize: studiesPage.page_size || DEFAULT_PAGE_SIZE,
    totalItems: studiesPage.total_items || 0,
    totalPages: studiesPage.total_pages || 0,
    users: userActivity,
    logsPath: logTail.file_path || "",
    logsUpdatedAt: logTail.updated_at ? formatDateTime(logTail.updated_at) : null,
    logLines: logTail.lines || [],
    createForm,
    editForm,
    onCreateFieldChange,
    onEditFieldChange,
    onSelectEditUser,
    onCancelEdit,
    onCreateUserSubmit,
    onUpdateUserSubmit,
    onDeleteUser,
    onOpenStudy,
    onPreviousPage,
    onNextPage,
    onDownloadStudiesExport,
    onDownloadLogs,
    onLogout,
    onRefresh,
  };
}
