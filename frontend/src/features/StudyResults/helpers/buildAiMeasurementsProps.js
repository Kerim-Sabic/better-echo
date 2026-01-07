import { MAIN_KEYS, RANGE_KEYS, SECTION_MAP, NORMAL_RANGES } from "./aiMeasurementsConstants"

const normalizeSex = (rawSex) => {
    if (!rawSex) return null;
    const cleaned = String(rawSex).trim().toLowerCase();
    if (cleaned === "m" || cleaned === "male") return "male";
    if (cleaned === "f" || cleaned === "female") return "female";
    return null;
};

const normalizeRanges = (ranges) => {
    if (!ranges) return [];
    return Array.isArray(ranges) ? ranges : [ranges];
};

const mergeBandRanges = (ranges, options = {}) => {
    const normalized = normalizeRanges(ranges).filter(
        (range) => range && (range.min !== undefined || range.max !== undefined)
    );
    if (!normalized.length) return [];

    const minStrategy = options.minStrategy ?? "min";
    const maxStrategy = options.maxStrategy ?? "max";

    const mins = normalized
        .map((range) => range.min)
        .filter((value) => value !== undefined);
    const maxes = normalized
        .map((range) => range.max)
        .filter((value) => value !== undefined);

    const min = mins.length
        ? (minStrategy === "max" ? Math.max(...mins) : Math.min(...mins))
        : null;
    const max = maxes.length
        ? (maxStrategy === "min" ? Math.min(...maxes) : Math.max(...maxes))
        : null;

    const exclusiveMin = min === null
        ? false
        : normalized
            .filter((range) => range.min === min)
            .every((range) => range.exclusiveMin);
    const exclusiveMax = max === null
        ? false
        : normalized
            .filter((range) => range.max === max)
            .every((range) => range.exclusiveMax);

    const merged = {};
    if (min !== null) merged.min = min;
    if (max !== null) merged.max = max;
    if (exclusiveMin) merged.exclusiveMin = true;
    if (exclusiveMax) merged.exclusiveMax = true;

    return [merged];
};

const deriveUnisexBands = (bands) => {
    if (!bands?.male && !bands?.female) return null;

    return {
        normal: mergeBandRanges([
            ...normalizeRanges(bands?.male?.normal),
            ...normalizeRanges(bands?.female?.normal),
        ], { minStrategy: "min", maxStrategy: "max" }),
        borderline: mergeBandRanges([
            ...normalizeRanges(bands?.male?.borderline),
            ...normalizeRanges(bands?.female?.borderline),
        ], { minStrategy: "max", maxStrategy: "max" }),
        abnormal: mergeBandRanges([
            ...normalizeRanges(bands?.male?.abnormal),
            ...normalizeRanges(bands?.female?.abnormal),
        ], { minStrategy: "max", maxStrategy: "min" }),
    };
};

const resolveBandsForKey = (key, patientSex) => {
    const def = NORMAL_RANGES[key];
    if (!def?.bands) return { bands: null, preferNormal: false };
    const sexKey = normalizeSex(patientSex);
    if (sexKey && def.bands[sexKey]) return { bands: def.bands[sexKey], preferNormal: false };
    if (def.bands.unisex) return { bands: def.bands.unisex, preferNormal: false };
    return { bands: deriveUnisexBands(def.bands), preferNormal: true };
};

const matchesRange = (value, range) => {
    if (range.min !== undefined) {
        const tooLow = range.exclusiveMin ? value <= range.min : value < range.min;
        if (tooLow) return false;
    }
    if (range.max !== undefined) {
        const tooHigh = range.exclusiveMax ? value >= range.max : value > range.max;
        if (tooHigh) return false;
    }
    return true;
};

const matchesAnyRange = (value, ranges) => normalizeRanges(ranges).some((range) => matchesRange(value, range));

// ------------------------------------------------------------
// PART 1.1 – Measurement (regression tasks) Color helper
// ------------------------------------------------------------
function getMeasurementColor(key, value, patientSex) {
    if (!isFiniteNumber(value)) return null;
    const { bands, preferNormal } = resolveBandsForKey(key, patientSex);
    if (!bands) return null;

    if (preferNormal) {
        if (matchesAnyRange(value, bands.normal)) return "green";
        if (matchesAnyRange(value, bands.abnormal)) return "red";
        if (matchesAnyRange(value, bands.borderline)) return "yellow";
    } else {
        if (matchesAnyRange(value, bands.abnormal)) return "red";
        if (matchesAnyRange(value, bands.borderline)) return "yellow";
        if (matchesAnyRange(value, bands.normal)) return "green";
    }

    if (normalizeRanges(bands.normal).length) return "yellow";
    return null;
}

// ------------------------------------------------------------
// PART 1.2 — Categorical (classification tasks) Color helper
// ------------------------------------------------------------

function getCategoricalColor(key, integratedLabel) {
    const def = NORMAL_RANGES[key];
    if (!def || !def.categories || !integratedLabel) return null;

    const label = integratedLabel.trim();

    if (def.categories.normal?.includes(label)) return "green";
    if (def.categories.borderline?.includes(label)) return "yellow";
    if (def.categories.abnormal?.includes(label)) return "red";

    return null;
}

// ------------------------------------------------------------
// PART 2 — Core transformation logic
// ------------------------------------------------------------
export function buildAiMeasurementsProps(panechoEchoprimeResults, overrides = null, patientSex = null) {
    const tasks = panechoEchoprimeResults?.integrated_tasks;
    if (!tasks) return { mainMeasurements: [], Measurements: [] };
    const overrideMap = (overrides && typeof overrides === "object")
        ? overrides
        : (panechoEchoprimeResults?.overrides || {});

    // ------------------------------------------------------------
    // PART 3 — Transformer for each task
    // ------------------------------------------------------------
    const asItem = (key, label) => {
        const task = tasks[key];
        if (!task) return null;

        const override = overrideMap?.[key];
        const hasOverride = Boolean(override && (override.label !== undefined || override.value !== undefined));
        const overrideLabel = override?.label ?? null;
        const overrideValue = override?.value ?? null;

        const integratedLabel = overrideLabel ?? task?.integrated_label;
        const units = task?.units;
        const discrepancy = task?.discrepancy ?? null;

        // Determine if classification task
        const isClassification = units == null;
        const rawValue = overrideValue !== null ? Number(overrideValue) : task?.integrated_value;

        // ------------------------------------------------------------
        // PART 3.1 — Determine color
        // ------------------------------------------------------------
        
        let color = null;

        if (!isClassification && isFiniteNumber(rawValue)) {
        // REGRESSION TASKS
        color = getMeasurementColor(key, rawValue, patientSex);
        } else if (isClassification && integratedLabel) {
        // CLASSIFICATION TASKS
        color = getCategoricalColor(key, integratedLabel)
        }

        // ------------------------------------------------------------
        // PART 3.2 — VALUE LOGIC
        // ------------------------------------------------------------
        let value = null;

        if (!isClassification) {
        // ---------------------------
        // REGRESSION TASKS
        // ---------------------------

        if (RANGE_KEYS.has(key) && overrideValue === null) {
            // RANGE regression task
            const vals = [
            task?.panecho_value_or_prob,
            task?.echoprime_value_or_prob,
            ]
            .map((v) => (isFiniteNumber(v) ? Number(v) : null))
            .filter((v) => v !== null);

            if (vals.length >= 2) {
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            value = `${formatNumber(min)}-${formatNumber(max)} ${units}`;
            } else if (vals.length === 1) {
            value = `${formatNumber(vals[0])} ${units}`;
            }
        } else {
            // Simple regression → return integrated_value + units
            if (isFiniteNumber(rawValue)) {
            value = `${formatNumber(rawValue)} ${units}`;
            }
        }
        } else {
        // ---------------------------
        // CLASSIFICATION TASKS
        // ---------------------------

        const peProb = task?.panecho_value_or_prob;

        if (peProb && typeof peProb === "object") {
            // Return full probability map + final label
            value = {
            probs: peProb,
            integrated_label: integratedLabel,
            };
        } else {
            // Fallback → return just the integrated label
            value = integratedLabel ?? null;
        }
        }

        // ------------------------------------------------------------
        // PART 3.3 — Build final item payload
        // ------------------------------------------------------------
        return {
        key,
        label,
        value,
        units: units ?? null,
        status: isClassification ? integratedLabel : null,
        discrepancy: hasOverride ? false : discrepancy,
        color,
        isOverridden: hasOverride,
        overrideMeta: hasOverride ? {
            edited_by: override?.edited_by ?? null,
            edited_at: override?.edited_at ?? null,
        } : null,
        editType: isClassification ? "label" : "value",
        editOptions: isClassification ? buildLabelOptions(key, integratedLabel) : null,
        };
    };

    // ------------------------------------------------------------
    // PART 4 — Build main measurement tiles
    // ------------------------------------------------------------
    const mainMeasurements = MAIN_KEYS.map(({ key, label }) =>
        asItem(key, label)
    ).filter(Boolean);

    // ------------------------------------------------------------
    // PART 5 — Build grouped section measurements
    // ------------------------------------------------------------
    const Measurements = Object.entries(SECTION_MAP).map(
        ([section, entries]) => ({
        section,
        items: Object.entries(entries)
            .map(([key, label]) => asItem(key, label))
            .filter(Boolean),
        })
    );

    return { mainMeasurements, Measurements };
}

// --- Utility functions ---
function isFiniteNumber(val) {
    return typeof val == "number" && isFinite(val);
}

function formatNumber(val) {
    if (!isFiniteNumber(val)) return null;
    return Number(val).toFixed(2);
}

function buildLabelOptions(key, currentLabel) {
    const def = NORMAL_RANGES[key];
    const categories = def?.categories;
    const options = new Set();
    if (categories) {
        Object.values(categories).forEach((vals) => {
            if (Array.isArray(vals)) {
                vals.forEach((v) => options.add(v));
            }
        });
    }
    if (currentLabel) {
        options.add(currentLabel);
    }
    return Array.from(options);
}
