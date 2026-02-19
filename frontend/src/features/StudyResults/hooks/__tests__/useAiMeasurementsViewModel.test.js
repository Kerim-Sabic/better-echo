import { act, renderHook, waitFor } from "@testing-library/react";
import { useAiMeasurementsViewModel } from "../useAiMeasurementsViewModel";
import { updatePanechoEchoprimeOverrides } from "../../../../api/orchestration_apis/PanechoEchoprimeResultsApi";

jest.mock("../../../../api/orchestration_apis/PanechoEchoprimeResultsApi", () => ({
    updatePanechoEchoprimeOverrides: jest.fn(),
}));

const baseResults = {
    integrated_tasks: {
        ejection_fraction: {
            integrated_value: 60,
            panecho_value_or_prob: 55,
            echoprime_value_or_prob: 65,
            units: "%",
            discrepancy: false,
        },
        aortic_stenosis: {
            integrated_label: "Absent",
            integrated_value: 1,
            units: null,
            discrepancy: false,
        },
    },
    overrides: {},
};

describe("useAiMeasurementsViewModel", () => {
    beforeEach(() => {
        updatePanechoEchoprimeOverrides.mockResolvedValue({ status: 200 });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("persists numeric overrides", async () => {
        const refresh = jest.fn();
        const { result } = renderHook(() =>
            useAiMeasurementsViewModel({
                studyUid: "study-1",
                panechoEchoprimeResults: baseResults,
                panEchoEchoprimeState: "ready",
                studyInstanceKey: "1",
                refresh,
            })
        );

        const target = result.current.mainMeasurements.find((item) => item.key === "ejection_fraction");
        act(() => {
            result.current.onStartEdit(target);
        });
        act(() => {
            result.current.onChangeValue("ejection_fraction", "70");
        });
        act(() => {
            result.current.onStopEdit("ejection_fraction");
        });

        expect(updatePanechoEchoprimeOverrides).toHaveBeenCalledWith("study-1", {
            ejection_fraction: { value: 70 },
        });

        await waitFor(() => {
            expect(refresh).toHaveBeenCalled();
        });
    });

    it("persists label overrides", async () => {
        const refresh = jest.fn();
        const { result } = renderHook(() =>
            useAiMeasurementsViewModel({
                studyUid: "study-1",
                panechoEchoprimeResults: baseResults,
                panEchoEchoprimeState: "ready",
                studyInstanceKey: "1",
                refresh,
            })
        );

        const valves = result.current.Measurements.find((section) => section.section === "Valves");
        const target = valves.items.find((item) => item.key === "aortic_stenosis");
        act(() => {
            result.current.onStartEdit(target);
        });
        act(() => {
            result.current.onChangeLabel("aortic_stenosis", "Mild");
        });
        act(() => {
            result.current.onStopEdit("aortic_stenosis");
        });

        expect(updatePanechoEchoprimeOverrides).toHaveBeenCalledWith("study-1", {
            aortic_stenosis: { label: "Mild" },
        });

        await waitFor(() => {
            expect(refresh).toHaveBeenCalled();
        });
    });
});
