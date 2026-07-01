import axios from "axios";
import {
    DESKTOP_CLIENT_HEADER,
    getDesktopAuthToken,
    isDesktopAuthRuntime,
} from "./desktopAuth";
import { notifyAuthSessionExpired } from "./authSession";

const AUTH_EXPIRY_EXCLUDED_PATHS = new Set([
    "/login",
    "/check-auth",
    "/logout",
]);

function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

// Initial baseURL. Real value is set by RuntimeConfigGate as soon as the
// Electron runtime config (LAN host or cloud URL) is loaded, before any
// authenticated request fires. We intentionally do NOT fall back to
// http://localhost:8000 here: in a built client app no backend runs locally,
// so a stray pre-config request should fail loudly rather than silently hit
// the doctor's own machine.
const DEFAULT_API_URL = normalizeBaseUrl(process.env.REACT_APP_API_URL);

export const apiClient = axios.create({
    baseURL: DEFAULT_API_URL,
    withCredentials: true,
});

function requestPath(config) {
    const rawUrl = String(config?.url || "");
    const fallbackOrigin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost";

    try {
        const parsedUrl = new URL(
            rawUrl,
            config?.baseURL || apiClient.defaults.baseURL || fallbackOrigin
        );
        return parsedUrl.pathname.replace(/^\/api(?=\/)/i, "") || "/";
    } catch {
        return rawUrl.split("?")[0].replace(/^\/api(?=\/)/i, "") || "/";
    }
}

function shouldNotifyAuthExpired(response) {
    if (response?.status !== 401) {
        return false;
    }

    return !AUTH_EXPIRY_EXCLUDED_PATHS.has(requestPath(response.config));
}

apiClient.interceptors.request.use(config => {
    if (!isDesktopAuthRuntime()) {
        return config;
    }

    const nextHeaders = {
        ...(config.headers || {}),
        [DESKTOP_CLIENT_HEADER]: "1",
    };
    const desktopAuthToken = getDesktopAuthToken();
    if (desktopAuthToken) {
        nextHeaders.Authorization = `Bearer ${desktopAuthToken}`;
    }

    return {
        ...config,
        headers: nextHeaders,
    };
});

apiClient.interceptors.response.use(
    response => {
        if (shouldNotifyAuthExpired(response)) {
            notifyAuthSessionExpired();
        }

        return response;
    },
    error => {
        if (shouldNotifyAuthExpired(error?.response)) {
            notifyAuthSessionExpired();
        }

        return Promise.reject(error);
    }
);

export const setApiClientBaseUrl = (value) => {
    const nextBaseUrl = normalizeBaseUrl(value) || DEFAULT_API_URL;
    apiClient.defaults.baseURL = nextBaseUrl;
    return nextBaseUrl;
};

export const parseRetryAfter = (response) => {
    const headerValue = response?.headers?.["retry-after"];
    const headerRetry = headerValue != null ? Number(headerValue) : null;

    const bodyRetry =
        response?.data && typeof response.data.retry_after === "number"
            ? response.data.retry_after
            : null;

    if (Number.isFinite(headerRetry) && headerRetry > 0) {
        return headerRetry;
    }
    if (Number.isFinite(bodyRetry) && bodyRetry > 0) {
        return bodyRetry;
    }
    return null;
};
