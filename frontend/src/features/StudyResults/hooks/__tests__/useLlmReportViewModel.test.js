import { act, renderHook, waitFor } from "@testing-library/react";
import { useLlmReportViewModel } from "../useLlmReportViewModel";
import { generateLlmReport } from "../../../../api/results/LlmReportResultsApi";

jest.mock("../../../../api/results/LlmReportResultsApi", () => ({
    generateLlmReport: jest.fn(),
}));

describe("useLlmReportViewModel", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it("flags reports as out of date", () => {
        const { result } = renderHook(() =>
            useLlmReportViewModel({
                state: "ready",
                llmReportResults: {
                    report_generated_at: "2025-01-01T00:00:00Z",
                    diagnoses_json: ["A"],
                },
                studyUID: "study-1",
                latestOverrideAt: "2025-01-02T00:00:00Z",
                onRefresh: jest.fn(),
            })
        );

        expect(result.current.isOutOfDate).toBe(true);
        expect(result.current.diagnosesCount).toBe(1);
        expect(result.current.isEmpty).toBe(false);
    });

    it("regenerates report and refreshes", async () => {
        generateLlmReport.mockResolvedValue({ status: 200 });
        const refresh = jest.fn();
        const { result } = renderHook(() =>
            useLlmReportViewModel({
                state: "ready",
                llmReportResults: { report_generated_at: "2025-01-01T00:00:00Z" },
                studyUID: "study-1",
                latestOverrideAt: null,
                onRefresh: refresh,
            })
        );

        await act(async () => {
            await result.current.onRegenerate();
        });

        expect(generateLlmReport).toHaveBeenCalledWith("study-1");
        await waitFor(() => {
            expect(refresh).toHaveBeenCalled();
        });
    });
});
