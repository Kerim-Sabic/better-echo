import { INDEXABLE_KEYS } from "./aiMeasurementsConstants";

const EMPTY_DISPLAY = {
    mainMeasurements: [],
    Measurements: [],
    hasMainMeasurements: false,
    hasMeasurements: false,
    totalMeasurements: 0,
};

function normalizeDisplayValue(value) {
    return Number.isFinite(value) ? value.toFixed(2) : null;
}

function maybeIndexItem(item, isIndexedMode, bsa) {
    if (!item || !isIndexedMode || !Number.isFinite(bsa)) {
        return item;
    }
    if (!INDEXABLE_KEYS.has(item.key) || !Number.isFinite(item.rawValue)) {
        return item;
    }

    const indexedValue = item.rawValue / bsa;
    return {
        ...item,
        displayValue: normalizeDisplayValue(indexedValue),
        units: "mL/m^2",
        isIndexed: true,
    };
}

export function applyIndexedMeasurementDisplay(display, { isIndexedMode = false, bsa = null } = {}) {
    if (!display) {
        return EMPTY_DISPLAY;
    }

    const mainMeasurements = Array.isArray(display.mainMeasurements)
        ? display.mainMeasurements.map((item) => maybeIndexItem(item, isIndexedMode, bsa))
        : [];
    const Measurements = Array.isArray(display.Measurements)
        ? display.Measurements.map((section) => ({
            ...section,
            items: Array.isArray(section?.items)
                ? section.items.map((item) => maybeIndexItem(item, isIndexedMode, bsa))
                : [],
        }))
        : [];

    return {
        mainMeasurements,
        Measurements,
        hasMainMeasurements: mainMeasurements.length > 0,
        hasMeasurements: Measurements.length > 0,
        totalMeasurements:
            mainMeasurements.length +
            Measurements.reduce((sum, section) => sum + (section.items?.length || 0), 0),
    };
}
