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

// --- Helper: determine color based on normal range ---
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

// --- Part 1. Mapping raw inputs -> dumb-ui props ---
// Build two arrays the UI can render
// -mainMeasurements:
// -Measurements:
export function buildAiMeasurementsProps(panechoEchoprimeResults) {
    const tasks = panechoEchoprimeResults?.integrated_tasks
    if (!tasks) return { mainMeasurements: [], Measurements: [] };

    const asItem = (key, label) => {
      const task = tasks[key];
      if (!task) return null;

      // --- Part 1.1 get status if present(this is for the classification tasks)
      const hasStatus =
        task?.integrated_label === "Present" || task?.integrated_label === "Absent";

      // --- Part 1.2 get integrated_value to use to configure the color of the task
      //(green for normal, yellow for borderline, red for not normal measurement)
      const raw_integrated_value = task?.integrated_value;

      // --- Part 1.3 get color of the task based on the integrated_value
      const color =
        !hasStatus && isFiniteNumber(raw_integrated_value)
          ? getMeasurementColor(key, raw_integrated_value)
          : null;

      let value = null;

      if (RANGE_KEYS.has(key)) {
        const two_values = [task?.panecho_value_or_prob, task?.echoprime_value_or_prob]
          .map((val) => (isFiniteNumber(val) ? Number(val) : null))
          .filter((val) => val !== null);

        if (two_values.length >= 2) {
          const min = Math.min(...two_values);
          const max = Math.max(...two_values);
          value = `${formatNumber(min)}-${formatNumber(max)}`;
        } else if (two_values.length === 1) {
          value = formatNumber(two_values[0]);
        }
      } else if (isFiniteNumber(task?.integrated_value)) {
        value = formatNumber(task.integrated_value);
      }

      return {
        key,
        label, // now from SECTION_MAP
        value: hasStatus ? null : value,
        units: hasStatus ? null : task?.units ?? null,
        status: hasStatus ? task.integrated_label : null,
        discrepancy: task?.discrepancy ?? null,
        color,
      };
    };


    // --- Build main measurements ---
    const mainMeasurements = MAIN_KEYS.map(({ key, label }) => asItem(key, label)).filter(Boolean);

    // --- Build grouped measurements ---
    const Measurements = Object.entries(SECTION_MAP).map(([section, entries]) => ({
      section,
      items: Object.entries(entries)
        .map(([key, label]) => asItem(key, label))
        .filter(Boolean),
    }));


    return { mainMeasurements, Measurements};
};

// --- Utility functions ---
function isFiniteNumber(val) {
  return typeof val == "number" && isFinite(val);
}

function formatNumber(val) {
  if (!isFiniteNumber(val)) return null;
  return Number(val).toFixed(2);
}
