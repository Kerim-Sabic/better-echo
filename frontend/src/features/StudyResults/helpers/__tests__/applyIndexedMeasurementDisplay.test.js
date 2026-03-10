import { applyIndexedMeasurementDisplay } from "../applyIndexedMeasurementDisplay";

describe("applyIndexedMeasurementDisplay", () => {
    it("indexes supported numeric measurements when bsa is available", () => {
        const display = {
            mainMeasurements: [
                {
                    key: "lvedv",
                    label: "LV End-Diastolic Volume (LVEDV)",
                    kind: "numeric",
                    displayValue: "120.00",
                    rawValue: 120,
                    units: "mL",
                },
            ],
            Measurements: [],
        };

        const result = applyIndexedMeasurementDisplay(display, {
            isIndexedMode: true,
            bsa: 2,
        });

        expect(result.mainMeasurements[0]).toMatchObject({
            displayValue: "60.00",
            units: "mL/m^2",
            isIndexed: true,
        });
    });

    it("leaves unsupported measurements unchanged", () => {
        const display = {
            mainMeasurements: [
                {
                    key: "ejection_fraction",
                    label: "Ejection Fraction (EF)",
                    kind: "numeric",
                    displayValue: "60.00",
                    rawValue: 60,
                    units: "%",
                },
            ],
            Measurements: [],
        };

        const result = applyIndexedMeasurementDisplay(display, {
            isIndexedMode: true,
            bsa: 2,
        });

        expect(result.mainMeasurements[0]).toMatchObject({
            displayValue: "60.00",
            units: "%",
        });
    });
});
