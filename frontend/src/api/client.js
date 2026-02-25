import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

export const apiClient = axios.create({
    baseURL: API_URL,
    withCredentials: true,
});

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
