// Keys for the main (hero) metrics shown at the top of the UI.
const MAIN_KEYS = [
  { key: "ejection_fraction", label: "Ejection Fraction (EF)" },
  { key: "gls", label: "Global Longitudinal Strain (GLS)" },
  { key: "pulmonary_artery_pressure", label: "Pulmonary Artery Pressure" },
];


// For these keys, present a RANGE (min->max) from PanEcho & EchoPrime values (not the integrated value).
const RANGE_KEYS = new Set(["ejection_fraction", "pulmonary_artery_pressure"]);

// Section buckets that determine which tasks appear in which group (and order).
const SECTION_MAP = {
  "Valves": {
    aortic_stenosis: "Aortic Stenosis",
    aortic_regurgitation: "Aortic Regurgitation",
    mitral_regurgitation: "Mitral Regurgitation",
    mitral_stenosis: "Mitral Stenosis",
    tricuspid_valve_regurgitation: "Tricuspid Regurgitation",
    tricuspid_stenosis: "Tricuspid Stenosis",
    pulmonic_valve_regurgitation: "Pulmonic Regurgitation",
    lvot20mmhg: "LVOT Gradient (20 mmHg)",
    avpkvel: "Aortic Valve Peak Velocity",
    lvotdiam: "LVOT Diameter",
    mitral_annular_calcification: "Mitral Annular Calcification",
  },
  "LV Size & Function": {
    ejection_fraction: "Ejection Fraction (EF)",
    gls: "Global Longitudinal Strain (GLS)",
    lvidd: "LV Internal Diameter (Diastole)",
    lvids: "LV Internal Diameter (Systole)",
    lvedv: "LV End-Diastolic Volume (LVEDV)",
    lvesv: "LV End-Systolic Volume (LVESV)",
    lvsv: "LV Stroke Volume (LVSV)",
    ivsd: "Interventricular Septum Thickness (IVSd)",
    lvpwd: "LV Posterior Wall Thickness (LVPWd)",
    lvsize: "LV Size",
    lvsystolicfunction: "LV Systolic Function",
    lvwallmotionabnormalities: "LV Wall Motion Abnormalities",
    wall_motion_hypokinesis: "Regional Hypokinesis",
    lvdiastolicfunction: "LV Diastolic Function",
    lvwallthickness_increased_any: "LV Wall Thickening (Any)",
    lvwallthickness_increased_modsev: "LV Wall Thickening (Mod/Sev)",
  },
  "Atria": {
    lavol: "LA Volume",
    laids2d: "LA Indexed Volume (2D)",
    e_eavg: "E/E′ Ratio (Avg)",
    elevated_left_atrial_pressure: "Elevated LA Pressure",
    left_atrium_dilation: "Left Atrial Dilation",
    right_atrium_dilation: "Right Atrial Dilation",
    atrial_septum_hypertrophy: "Atrial Septum Hypertrophy",
  },
  "Right Heart": {
    pulmonary_artery_pressure: "Pulmonary Artery Pressure",
    rvidd: "RV Internal Diameter (Diastole)",
    tapse: "TAPSE",
    rv_s_vel: "RV S′ Velocity",
    tvpkgrad: "Tricuspid Valve Peak Gradient",
    radimension_ml: "RA Dimension (M/L)",
    right_ventricle_dilation: "Right Ventricular Dilation",
    rv_systolic_function_depressed: "RV Systolic Function Depressed",
    dilated_ivc: "Dilated IVC",
    pericardial_effusion: "Pericardial Effusion",
  },
  "Aorta": {
    aortic_root_diameter: "Aortic Root Diameter",
    aortic_root_dilation: "Aortic Root Dilation",
    bicuspid_aortic_valve: "Bicuspid Aortic Valve",
  },
  "Devices / Procedures": {
    pacemaker: "Pacemaker",
    impella: "Impella Device",
    mitraclip: "MitraClip",
    tavr: "TAVR Procedure",
  },
};


// Values are examples — should be adapted to your dataset or medical source.
const NORMAL_RANGES = {
  ejection_fraction: { min: 50, max: 70 }, // normal LVEF %
  gls: { min: -22, max: -18 },             // normal global longitudinal strain (%)
  pulmonary_artery_pressure: { min: 10, max: 25 }, // mmHg
  lvidd: { min: 4.2, max: 5.8 },             // cm (male ref)
  lvids: { min: 2.5, max: 4.0 },             // cm
  lvedv: { min: 67, max: 155 },              // cm^3
  lvesv: { min: 22, max: 58 },               // cm^3
  tapse: { min: 1.7, max: 3.0 },             // cm
  rv_s_vel: { min: 9.5, max: 20 },         // cm/s
  aortic_root_diameter: { min: 2.0, max: 3.7 }, //cm
};

// ------------------------------------------------------------
// PART 1 — Color helper
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

    // ------------------------------------------------------------
    // PART 3.1 — Determine color
    // ------------------------------------------------------------
    const rawValue = task?.integrated_value;
    const color =
      !isClassification && isFiniteNumber(rawValue)
        ? getMeasurementColor(key, rawValue)
        : null;

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
