import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/general_components/ui/button";
import { setApiClientBaseUrl } from "@/api/client";
import { clearDesktopAuthToken } from "@/api/desktopAuth";
import { resetResolvedApiUrls } from "@/config/api";
import { ElectronRuntimeConfigProvider } from "@/hooks/useElectronRuntimeConfig";

const BACKEND_PORT = "8000";
const VIEWER_PORT = "3001";
const SESSION_HINT_KEY = "authSessionHint";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function toApiBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    return "";
  }

  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

function isConfiguredClientRuntime(runtimeConfig) {
  return (
    runtimeConfig?.runtimeMode === "client" &&
    Boolean(runtimeConfig?.backendBaseUrl) &&
    Boolean(runtimeConfig?.viewerBaseUrl)
  );
}

function parseServerAddress(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawValue)
    ? rawValue
    : `http://${rawValue}`;

  try {
    const parsedUrl = new URL(withProtocol);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl;
  } catch {
    return null;
  }
}

function toServerAddressInput(runtimeConfig) {
  const parsedUrl = parseServerAddress(runtimeConfig?.backendBaseUrl);
  if (!parsedUrl) {
    return "";
  }

  const protocol = parsedUrl.protocol;
  const hostname = parsedUrl.hostname;
  const portSuffix =
    parsedUrl.port && parsedUrl.port !== BACKEND_PORT ? `:${parsedUrl.port}` : "";

  return `${protocol}//${hostname}${portSuffix}`;
}

function deriveClientBaseUrls(serverAddress) {
  const parsedUrl = parseServerAddress(serverAddress);
  if (!parsedUrl) {
    return null;
  }

  const protocol = parsedUrl.protocol;
  const hostname = parsedUrl.hostname;

  return {
    backendBaseUrl: `${protocol}//${hostname}:${BACKEND_PORT}`,
    viewerBaseUrl: `${protocol}//${hostname}:${VIEWER_PORT}`,
  };
}

export default function RuntimeConfigGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [serverAddress, setServerAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isClientRuntimeConfigEditorOpen, setIsClientRuntimeConfigEditorOpen] = useState(false);

  const syncServerAddress = useCallback((nextRuntimeConfig) => {
    setServerAddress(
      toServerAddressInput(nextRuntimeConfig) ||
        normalizeBaseUrl(process.env.REACT_APP_API_URL)?.replace(/\/api$/i, "") ||
        ""
    );
  }, []);

  const resetClientAuthState = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      // Ignore storage errors in desktop mode.
    }
    clearDesktopAuthToken();
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadRuntimeConfig() {
      if (!window.electronAPI?.getRuntimeConfig) {
        if (isActive) {
          setLoading(false);
        }
        return;
      }

      try {
        const nextRuntimeConfig = await window.electronAPI.getRuntimeConfig();
        if (!isActive) {
          return;
        }

        setRuntimeConfig(nextRuntimeConfig);
        syncServerAddress(nextRuntimeConfig);
      } catch (nextError) {
        if (isActive) {
          setError(nextError?.message || "Failed to load runtime configuration.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadRuntimeConfig();

    return () => {
      isActive = false;
    };
  }, [syncServerAddress]);

  useEffect(() => {
    const runtimeApiBaseUrl = toApiBaseUrl(runtimeConfig?.backendBaseUrl);
    const envApiBaseUrl = normalizeBaseUrl(process.env.REACT_APP_API_URL);
    setApiClientBaseUrl(runtimeApiBaseUrl || envApiBaseUrl);
  }, [runtimeConfig]);

  const openClientRuntimeConfigEditor = useCallback(() => {
    if (!runtimeConfig || runtimeConfig.runtimeMode !== "client") {
      return;
    }

    syncServerAddress(runtimeConfig);
    setError("");
    setIsClientRuntimeConfigEditorOpen(true);
  }, [runtimeConfig, syncServerAddress]);

  const closeClientRuntimeConfigEditor = useCallback(() => {
    syncServerAddress(runtimeConfig);
    setError("");
    setIsClientRuntimeConfigEditorOpen(false);
  }, [runtimeConfig, syncServerAddress]);

  async function handleSave(event) {
    event.preventDefault();

    if (!window.electronAPI?.saveRuntimeConfig) {
      return;
    }

    const derivedUrls = deriveClientBaseUrls(serverAddress);
    if (!derivedUrls) {
      setError("Enter a valid server address or hostname.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const nextRuntimeConfig = await window.electronAPI.saveRuntimeConfig({
        serverBaseUrl: derivedUrls.backendBaseUrl,
        viewerBaseUrl: derivedUrls.viewerBaseUrl,
      });
      resetResolvedApiUrls();
      resetClientAuthState();
      setRuntimeConfig(nextRuntimeConfig);
      syncServerAddress(nextRuntimeConfig);
      setIsClientRuntimeConfigEditorOpen(false);
    } catch (nextError) {
      setError(nextError?.message || "Failed to save runtime configuration.");
    } finally {
      setSaving(false);
    }
  }

  const derivedUrls = deriveClientBaseUrls(serverAddress);
  const requiresClientRuntimeSetup =
    runtimeConfig?.runtimeMode === "client" && !isConfiguredClientRuntime(runtimeConfig);
  const showClientRuntimeConfig = requiresClientRuntimeSetup || isClientRuntimeConfigEditorOpen;

  const runtimeConfigContextValue = useMemo(
    () => ({
      runtimeConfig,
      loading,
      isClientRuntimeConfigEditorOpen,
      openClientRuntimeConfigEditor,
      closeClientRuntimeConfigEditor,
    }),
    [
      closeClientRuntimeConfigEditor,
      isClientRuntimeConfigEditorOpen,
      loading,
      openClientRuntimeConfigEditor,
      runtimeConfig,
    ]
  );

  function renderClientConfigForm({ modal }) {
    return (
      <div
        className={
          modal
            ? "fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-6 py-10"
            : "flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground"
        }
      >
        <form
          onSubmit={handleSave}
          className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-2xl"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            {modal ? "Connection Settings" : "Client Setup"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the hospital server address for this workstation. The backend and viewer URLs will
            be set automatically.
          </p>

          <label className="mt-6 block text-sm font-medium text-foreground">
            Server Address
          </label>
          <input
            type="text"
            value={serverAddress}
            onChange={event => setServerAddress(event.target.value)}
            placeholder="server-host or 192.168.1.10"
            className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary"
            required
          />

          <div className="mt-5 rounded-xl border border-border bg-muted px-4 py-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Derived URLs</div>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Backend</div>
                <div className="mt-1 break-all text-foreground">
                  {derivedUrls?.backendBaseUrl || "http://server-host:8000"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Viewer</div>
                <div className="mt-1 break-all text-foreground">
                  {derivedUrls?.viewerBaseUrl || "http://server-host:3001"}
                </div>
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-rose-500">{error}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit" variant="clinical" disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
            {modal ? (
              <Button type="button" variant="outline" onClick={closeClientRuntimeConfigEditor}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <ElectronRuntimeConfigProvider value={runtimeConfigContextValue}>
        {null}
      </ElectronRuntimeConfigProvider>
    );
  }

  return (
    <ElectronRuntimeConfigProvider value={runtimeConfigContextValue}>
      {requiresClientRuntimeSetup ? renderClientConfigForm({ modal: false }) : children}
      {!requiresClientRuntimeSetup && showClientRuntimeConfig
        ? renderClientConfigForm({ modal: true })
        : null}
    </ElectronRuntimeConfigProvider>
  );
}
