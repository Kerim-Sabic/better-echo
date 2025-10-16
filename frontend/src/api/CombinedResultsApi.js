import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;

const endpoint = (studyUid) =>
    `${API_URL}/studies/${encodeURIComponent(
        studyUid
    )}/PanEcho-EchoPrime-combined-results`;

/**
 * Simple one-shot GET for combined results.
 * Returns: { status, data, retryAfter }
 * - status: 200 (complete), 202 (pending), or 404 (not found)
 * - data: server JSON (CompleteResponse or PendingResponse shape)
 * - retryAfter: number (seconds) if provided by server (header or JSON)
 */

export const getPanechoEchoprimeCombinedResults = async (studyUid) => {
    const response = await axios.get(endpoint(studyUid), {
        withCredentials: true,
        // Allow 202/404 without throwing
        validateStatus: (s) => (s >= 200 && s < 300) || s === 202 || s === 404,
    });

    const headerRetry = 
        response.headers && response.headers["retry-after"]
        ? Number(response.headers["retry-after"])
        : null;

    const bodyRetry = 
        response.data && typeof response.data.retry_after === "number"
        ? response.data.retry_after
        : null;
    
    return {
        status: response.status,
        data: response.data,
        retryAfter:
            (Number.isFinite(headerRetry) && headerRetry > 0 && headerRetry) ||
            (Number.isFinite(bodyRetry) && bodyRetry > 0 && bodyRetry) ||
            null,
    };
};