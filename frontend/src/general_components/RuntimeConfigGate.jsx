import { useEffect, useState } from "react";
import { setApiClientBaseUrl } from "@/api/client";

const BACKEND_PORT = "8000";
const VIEWER_PORT = "3001";

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
        setServerAddress(
          toServerAddressInput(nextRuntimeConfig) ||
            normalizeBaseUrl(process.env.REACT_APP_API_URL)?.replace(/\/api$/i, "") ||
            ""
        );
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
  }, []);

  useEffect(() => {
    const runtimeApiBaseUrl = toApiBaseUrl(runtimeConfig?.backendBaseUrl);
    const envApiBaseUrl = normalizeBaseUrl(process.env.REACT_APP_API_URL);
    setApiClientBaseUrl(runtimeApiBaseUrl || envApiBaseUrl);
  }, [runtimeConfig]);

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
      setRuntimeConfig(nextRuntimeConfig);
    } catch (nextError) {
      setError(nextError?.message || "Failed to save runtime configuration.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return null;
  }

  if (!runtimeConfig || runtimeConfig.runtimeMode !== "client" || isConfiguredClientRuntime(runtimeConfig)) {
    return children;
  }

  const derivedUrls = deriveClientBaseUrls(serverAddress);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <form
        onSubmit={handleSave}
        className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/95 p-8 shadow-2xl"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Client Setup</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter the hospital server address for this workstation. The backend and viewer URLs will
          be set automatically.
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-200">
          Server Address
        </label>
        <input
          type="text"
          value={serverAddress}
          onChange={event => setServerAddress(event.target.value)}
          placeholder="server-host or 192.168.1.10"
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-slate-500"
          required
        />

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-300">
          <div className="font-medium text-slate-100">Derived URLs</div>
          <div className="mt-3 grid gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Backend</div>
              <div className="mt-1 break-all text-slate-200">
                {derivedUrls?.backendBaseUrl || "http://server-host:8000"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Viewer</div>
              <div className="mt-1 break-all text-slate-200">
                {derivedUrls?.viewerBaseUrl || "http://server-host:3001"}
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </form>
    </div>
  );
}
