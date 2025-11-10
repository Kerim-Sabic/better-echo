// Keys for the main (hero) metrics shown at the top of the UI.
const MAIN_KEYS = ["ejection_fraction", "gls", "pulmonary_artery_pressure"];

// For these keys, present a RANGE (min->max) from PanEcho & EchoPrime values (not the integrated value).
const RANGE_KEYS = new Set(["ejection_fraction", "pulmonary_artery_pressure"]);

// Section buckets that determine which tasks appear in which group (and order).
const SECTION_MAP = {
  "Valves": [
    "aortic_stenosis",
    "aortic_regurgitation",
    "mitral_regurgitation",
    "mitral_stenosis",
    "tricuspid_valve_regurgitation",
    "tricuspid_stenosis",
    "pulmonic_valve_regurgitation",
    "lvot20mmhg",
    "avpkvel",
    "lvotdiam",
  ],
  "LV Size & Function": [
    "ejection_fraction",
    "gls",
    "lvidd",
    "lvids",
    "lvedv",
    "lvesv",
    "lvsv",
    "ivsd",
    "lvpwd",
    "lvsize",
    "lvsystolicfunction",
    "lvwallmotionabnormalities",
    "wall_motion_hypokinesis",
  ],
  "Atria": [
    "lavol",
    "laids2d",
    "e_eavg",
    "elevated_left_atrial_pressure",
    "left_atrium_dilation",
    "right_atrium_dilation",
    "atrial_septum_hypertrophy",
  ],
  "Right Heart": [
    "pulmonary_artery_pressure",
    "rvidd",
    "tapse",
    "rv_s_vel",
    "tvpkgrad",
    "radimension_ml",
    "right_ventricle_dilation",
    "rv_systolic_function_depressed",
  ],
  "Aorta": [
    "aortic_root_diameter",
    "aortic_root_dilation",
    "bicuspid_aortic_valve",
  ],
  "Devices / Procedures": [
    "pacemaker",
    "impella",
    "mitraclip",
    "tavr",
  ],
};

// Values are examples — should be adapted to your dataset or medical source.
const NORMAL_RANGES = {
  ejection_fraction: { min: 50, max: 70 }, // normal LVEF %
  gls: { min: -22, max: -18 },             // normal global longitudinal strain (%)
  pulmonary_artery_pressure: { min: 10, max: 25 }, // mmHg
  lvidd: { min: 42, max: 58 },             // mm (male ref)
  lvids: { min: 25, max: 40 },
  lvedv: { min: 67, max: 155 },
  lvesv: { min: 22, max: 58 },
  tapse: { min: 1.7, max: 3.0 },             // mm
  rv_s_vel: { min: 9.5, max: 20 },         // cm/s
  aortic_root_diameter: { min: 20, max: 37 },
};

// --- Helper: determine color based on normal range ---
function getMeasurementColor(key, value) {
  if (!isFiniteNumber(value)) return null;
  const range = NORMAL_RANGES[key];
  if (!range) return null;

  const { min, max } = range

  // Convert GLS to positive if your dataset uses negative numbers
  if (key === "GLs") {
    const absVal = Math.abs(value);
    if (absVal >= Math.abs(min) && absVal <= Math.abs(max)) return "green";
    if (
      absVal >= Math.abs(min) - 1 &&
      absVal <= Math.abs(max) + 1
    )
      return "yellow"
    return "red";
  }

  // For all other numeric measurements
  if (value >= min && value <= max) return "green";
  if (value >= min - 5 && value <= max + 5) return "yellow";
  return "red";
}

// --- Part 1. Mapping raw inputs -> dumb-ui props ---
// Build two arrays the UI can render
// -mainMeasurements:
// -Measurements:
export function buildAiMeasurementsProps(panechoEchoprimeResults) {
    const tasks = panechoEchoprimeResults?.integrated_tasks
    if (!tasks) return { mainMeasurements: [], Measurements: [] };

    const asItem = (key) => {
        const task = tasks[key]
        if (!task) return null;

        const raw_integrated_value = task?.integrated_value

        const hasStatus = 
          task?.integrated_label === "Present" || task?.integrated_label === "Absent";
        // --- Determine color ---
        if (key === "gls") {
          console.log("KEY: ", key)
          console.log("raw_integrated_value: ", raw_integrated_value)
          console.log("IS FINITE NUMBER:", isFiniteNumber(raw_integrated_value))
          } 

        const color = !hasStatus && isFiniteNumber(raw_integrated_value)
          ? getMeasurementColor(key, raw_integrated_value)
          : null;
        
        let value = null;

        // If the task is in RANGE_KEYS
        if (RANGE_KEYS.has(key)) {
            const two_values = [task?.panecho_value_or_prob, task?.echoprime_value_or_prob]
            .map((val) => (isFiniteNumber(val) ? Number(val) : null))
            .filter((val) => val !== null)

            if (two_values.length >= 2) {
                const min = Math.min(...two_values);
                const max = Math.max(...two_values);
                value = `${formatNumber(min)}-${formatNumber(max)}`; // range string
            } else if (two_values.length === 1) {
                value = formatNumber(two_values[0]);
            } else {
                value = null;
            }
        } else {
            // Normal numeric or label task
            if (isFiniteNumber(task?.integrated_value)) {
              value = formatNumber(task.integrated_value)
            }
        }


        return {
            key,
            label: prettyName(key),
            value: hasStatus ? null : value,
            units: hasStatus ? null : task?.units ?? null,
            status: hasStatus ? task.integrated_label : null,
            discrepancy: task?.discrepancy ?? null,
            color,
        };
    };

    // --- Build main measurements ---
    const mainMeasurements = MAIN_KEYS.map(asItem).filter(Boolean)

    // --- Build grouped measurements ---
    const Measurements = Object.entries(SECTION_MAP).map(([section, keys]) => ({
      section,
      items: keys.map(asItem).filter(Boolean),
    }));

    return { mainMeasurements, Measurements};
};

// --- Utility functions ---
function isFiniteNumber(val) {
  return typeof val == "number" && isFinite(val);
}

function formatNumber(val) {
  if (!isFiniteNumber(val)) return null;
  return Number(val).toFixed(1);
}

function prettyName(key) {
  // Convert snake_case -> Title Case for labels (simple fallback)
  return key
  .replace(/_/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase());
}
