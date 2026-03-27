import axios from "axios";
import {
    DESKTOP_CLIENT_HEADER,
    getDesktopAuthToken,
    isDesktopAuthRuntime,
} from "./desktopAuth";

function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

const DEFAULT_API_URL =
    normalizeBaseUrl(process.env.REACT_APP_API_URL) || "http://localhost:8000/api";

export const apiClient = axios.create({
    baseURL: DEFAULT_API_URL,
    withCredentials: true,
});

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
