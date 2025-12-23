import { apiClient, parseRetryAfter } from "../shared/client";

/**
 * One-shot GET for LLM report results.
 * Returns: { status, data, retryAfter }
 * - status: 200 (complete), 202 (pending), or 404 (not found)
 * - data: server JSON (CompleteResponse or PendingResponse shape)
 * - retryAfter: number (seconds) if provided by server (header or JSON), else null
 */
export const getLlmReportResults = async (studyUid) => {
    const response = await apiClient.get(
        `/studies/${encodeURIComponent(studyUid)}/llm-report-results`,
        {
            // Allow 202/404 without throwing
            validateStatus: (s) => (s >= 200 && s < 300) || s === 202 || s === 404,
        }
    );

    return {
        status: response.status,
        data: response.data,
        retryAfter: parseRetryAfter(response),
    };
};

export const generateLlmReport = async (studyUid) => {
    const response = await apiClient.post(
        `/studies/${encodeURIComponent(studyUid)}/llm/report/generate`,
        {},
        {
            validateStatus: (s) => (s >= 200 && s < 300) || s === 409 || s === 502,
        }
    );
    return response;
};
