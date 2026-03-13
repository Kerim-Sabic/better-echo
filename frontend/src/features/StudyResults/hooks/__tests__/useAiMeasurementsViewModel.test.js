import { act, renderHook, waitFor } from "@testing-library/react";
import { useAiMeasurementsViewModel } from "../useAiMeasurementsViewModel";
import { updatePanechoEchoprimeOverrides } from "../../../../api/results/PanechoEchoprimeResultsApi";

jest.mock("../../../../api/results/PanechoEchoprimeResultsApi", () => ({
  updatePanechoEchoprimeOverrides: jest.fn(),
}));

const baseResults = {
  edit_baselines: {
    ejection_fraction: { rawValue: 60 },
    aortic_stenosis: { label: "Absent" },
    lvedv: { rawValue: 120 },
  },
  overrides: {},
  display: {
    mainMeasurements: [
      {
        key: "ejection_fraction",
        label: "Ejection Fraction (EF)",
        kind: "numeric",
        displayValue: "60.00",
        rawValue: 60,
        units: "%",
        probabilities: null,
        color: "green",
        discrepancy: false,
        isOverridden: false,
        editable: true,
        editType: "value",
        editOptions: null,
      },
    ],
    Measurements: [
      {
        section: "Valves",
        items: [
          {
            key: "aortic_stenosis",
            label: "Aortic Stenosis",
            kind: "categorical",
            displayValue: "Absent",
            rawValue: null,
            units: null,
            probabilities: null,
            color: "green",
            discrepancy: false,
            isOverridden: false,
            editable: true,
            editType: "label",
            editOptions: ["Absent", "Mild"],
          },
        ],
      },
      {
        section: "Left Heart",
        items: [
          {
            key: "lvedv",
            label: "LV End-Diastolic Volume",
            kind: "numeric",
            displayValue: "120.00",
            rawValue: 120,
            units: "mL",
            probabilities: null,
            color: "green",
            discrepancy: false,
            isOverridden: false,
            editable: true,
            editType: "value",
            editOptions: null,
          },
        ],
      },
    ],
    hasMainMeasurements: true,
    hasMeasurements: true,
    totalMeasurements: 3,
  },
};

describe("useAiMeasurementsViewModel", () => {
  beforeEach(() => {
    updatePanechoEchoprimeOverrides.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("uses edit_baselines for numeric edit start and unchanged diffing", () => {
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

    expect(result.current.draftOverrides.ejection_fraction).toEqual({ value: "60" });

    act(() => {
      result.current.onStopEdit("ejection_fraction");
    });

    expect(updatePanechoEchoprimeOverrides).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("uses edit_baselines for categorical edit start and unchanged diffing", () => {
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

    expect(result.current.draftOverrides.aortic_stenosis).toEqual({ label: "Absent" });

    act(() => {
      result.current.onStopEdit("aortic_stenosis");
    });

    expect(updatePanechoEchoprimeOverrides).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
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

  it("uses raw edit baselines for indexed numeric editing", () => {
    const refresh = jest.fn();
    const { result } = renderHook(() =>
      useAiMeasurementsViewModel({
        studyUid: "study-1",
        panechoEchoprimeResults: baseResults,
        panEchoEchoprimeState: "ready",
        studyInstanceKey: "1",
        patientHeightCm: 180,
        patientWeightKg: 80,
        refresh,
      })
    );

    const lvedvSection = result.current.Measurements.find((section) => section.section === "Left Heart");
    const target = lvedvSection.items.find((item) => item.key === "lvedv");
    const expectedIndexedValue = (120 / Math.sqrt((180 * 80) / 3600)).toString();

    act(() => {
      result.current.onStartEdit(target);
    });

    expect(Number(result.current.draftOverrides.lvedv.value)).toBeCloseTo(Number(expectedIndexedValue), 5);

    act(() => {
      result.current.onStopEdit("lvedv");
    });

    expect(updatePanechoEchoprimeOverrides).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
