import { renderHook } from "@testing-library/react";
import { useStudyResultsData } from "../useStudyResultsData";
import { printMeasurements } from "../../helpers/printMeasurements";
import { usePanechoEchoprimeResultsQuery } from "../queries/usePanechoEchoprimeResultsQuery";
import { useDynamicMeasurementsResultsQuery } from "../queries/useDynamicMeasurementsResultsQuery";
import { useLlmReportResultsQuery } from "../queries/useLlmReportResultsQuery";
import { useStudyMetaQuery } from "../queries/useStudyMetaQuery";
import { usePipelineStatusQuery } from "../queries/usePipelineStatusQuery";
import { startStudyPipeline } from "../../../../api/pipeline/PipelineApi";

jest.mock("../../helpers/printMeasurements", () => ({
    printMeasurements: jest.fn(),
}));
jest.mock("../queries/usePanechoEchoprimeResultsQuery", () => ({
    usePanechoEchoprimeResultsQuery: jest.fn(),
}));
jest.mock("../queries/useDynamicMeasurementsResultsQuery", () => ({
    useDynamicMeasurementsResultsQuery: jest.fn(),
}));
jest.mock("../queries/useLlmReportResultsQuery", () => ({
    useLlmReportResultsQuery: jest.fn(),
}));
jest.mock("../queries/useStudyMetaQuery", () => ({
    useStudyMetaQuery: jest.fn(),
}));
jest.mock("../queries/usePipelineStatusQuery", () => ({
    usePipelineStatusQuery: jest.fn(),
}));
jest.mock("../../../../api/pipeline/PipelineApi", () => ({
    startStudyPipeline: jest.fn(),
}));

const makeQuery = (data, opts = {}) => ({
    data,
    isFetching: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    ...opts,
});

describe("useStudyResultsData", () => {
    const originalEnv = process.env.REACT_APP_ENABLE_LLM;

    afterEach(() => {
        process.env.REACT_APP_ENABLE_LLM = originalEnv;
        jest.clearAllMocks();
    });

    it("returns ready state with derived results", () => {
        process.env.REACT_APP_ENABLE_LLM = "true";

        const panechoResults = { integrated_tasks: {}, overrides: {}, overrides_updated_at: "2025-01-01T00:00:00Z" };
        const panechoResponse = {
            status: 200,
            data: { status: "complete", panecho_echoprime_results: panechoResults },
            results: panechoResults,
            isPending: false,
            isComplete: true,
        };
        const dynamicResults = { instances: [] };
        const dynamicResponse = {
            status: 200,
            data: { status: "complete", dynamic_measurements_results: dynamicResults },
            results: dynamicResults,
            isPending: false,
            isComplete: true,
        };
        const llmResults = { report_md: "ok" };
        const llmResponse = {
            status: 200,
            data: { status: "complete", llm_report: llmResults },
            results: llmResults,
            isPending: false,
            isComplete: true,
        };

        usePanechoEchoprimeResultsQuery.mockReturnValue(makeQuery(panechoResponse));
        useDynamicMeasurementsResultsQuery.mockReturnValue(makeQuery(dynamicResponse));
        useLlmReportResultsQuery.mockReturnValue(makeQuery(llmResponse));
        usePipelineStatusQuery.mockReturnValue({
            data: { hasJob: true, pipelineStatus: "completed", isActive: false },
            isLoading: false,
            refetch: jest.fn(),
        });
        useStudyMetaQuery.mockReturnValue({
            data: { data: { id: 1 }, patientName: "Alex" },
            isLoading: false,
            isError: false,
            error: null,
            refetch: jest.fn(),
        });

        const { result } = renderHook(() => useStudyResultsData("study-1"));

        expect(result.current.state).toBe("ready");
        expect(result.current.panEchoEchoprimeState).toBe("ready");
        expect(result.current.dynamicMeasurementsState).toBe("ready");
        expect(result.current.llmReportState).toBe("ready");
        expect(result.current.patientName).toBe("Alex");
        expect(result.current.hasMeasurements).toBe(true);
        expect(result.current.anyLoading).toBe(false);
        expect(result.current.latestOverrideAt).toBe("2025-01-01T00:00:00.000Z");
        expect(startStudyPipeline).not.toHaveBeenCalled();
    });

    it("disables llm state when env flag is false", () => {
        process.env.REACT_APP_ENABLE_LLM = "false";

        usePanechoEchoprimeResultsQuery.mockReturnValue(makeQuery({ status: 404 }));
        useDynamicMeasurementsResultsQuery.mockReturnValue(makeQuery({ status: 404 }));
        useLlmReportResultsQuery.mockReturnValue(makeQuery({ status: 404 }));
        usePipelineStatusQuery.mockReturnValue({
            data: { hasJob: true, pipelineStatus: "completed", isActive: false },
            isLoading: false,
            refetch: jest.fn(),
        });
        useStudyMetaQuery.mockReturnValue({
            data: { data: { id: 1 }, patientName: "Alex" },
            isLoading: false,
            isError: false,
            error: null,
            refetch: jest.fn(),
        });

        const { result } = renderHook(() => useStudyResultsData("study-1"));

        expect(result.current.llmReportState).toBeUndefined();
    });
});
