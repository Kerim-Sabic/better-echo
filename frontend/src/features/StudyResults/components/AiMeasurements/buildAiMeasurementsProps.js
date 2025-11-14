import { MAIN_KEYS, RANGE_KEYS, SECTION_MAP, NORMAL_RANGES } from "./AiMeasurementsConstants"

// ------------------------------------------------------------
// PART 1.1 — Measurement (regression tasks) Color helper
// ------------------------------------------------------------
function getMeasurementColor(key, value) {
  if (!isFiniteNumber(value)) return null;
  const range = NORMAL_RANGES[key];
  if (!range) return null;

  const { min, max } = range

  // Convert GLS to positive if your dataset uses negative numbers
  if (key === "gls") {
    const absVal = Math.abs(value);
    if (absVal <= Math.abs(min) && absVal >= Math.abs(max)) return "green";
    if (
      absVal <= Math.abs(min) + 1 &&
      absVal >= Math.abs(max) - 1
    )
      return "yellow";
    return "red";
  }

  // For all other numeric measurements
  if (value >= min && value <= max) return "green";
  if (value >= min - 5 && value <= max + 5) return "yellow";
  return "red";
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
export function buildAiMeasurementsProps(panechoEchoprimeResults) {
  const tasks = panechoEchoprimeResults?.integrated_tasks;
  if (!tasks) return { mainMeasurements: [], Measurements: [] };

  // ------------------------------------------------------------
  // PART 3 — Transformer for each task
  // ------------------------------------------------------------
  const asItem = (key, label) => {
    const task = tasks[key];
    if (!task) return null;

    const integratedLabel = task?.integrated_label;
    const units = task?.units;
    const discrepancy = task?.discrepancy ?? null;

    // Determine if classification task
    const isClassification = units == null;
    const rawValue = task?.integrated_value;

    // ------------------------------------------------------------
    // PART 3.1 — Determine color
    // ------------------------------------------------------------
    
    let color = null;

    if (!isClassification && isFiniteNumber(rawValue)) {
      // REGRESSION TASKS
      color = getMeasurementColor(key, rawValue);
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

      if (RANGE_KEYS.has(key)) {
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
        if (isFiniteNumber(task.integrated_value)) {
          value = `${formatNumber(task.integrated_value)} ${units}`;
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
      discrepancy,
      color,
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
