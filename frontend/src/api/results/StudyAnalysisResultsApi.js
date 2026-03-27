import { apiClient, parseRetryAfter } from "../client";

/**
 * One-shot GET for combined study analysis results.
 * Returns: { status, data, retryAfter }
 * - status: 200 (complete), 202 (pending), or 404 (not found)
 * - data: server JSON (CompleteResponse or PendingResponse shape)
 * - retryAfter: number (seconds) if provided by server (header or JSON), else null
 */
export const getStudyAnalysisCombinedResults = async (studyUid) => {
    const response = await apiClient.get(
        `/studies/${encodeURIComponent(studyUid)}/study-analysis-results`,
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

export const updateStudyAnalysisOverrides = async (studyUid, overrides) => {
    const response = await apiClient.patch(
        `/studies/${encodeURIComponent(studyUid)}/study-analysis-overrides`,
        { overrides }
    );
    return response.data;
};
