import numericRanges from "./measurementRanges.json";

// Keys for the main (hero) metrics shown at the top of the UI.
export const MAIN_KEYS = [
    { key: "ejection_fraction", label: "Ejection Fraction (EF)" },
    { key: "gls", label: "Global Longitudinal Strain (GLS)" },
    { key: "pulmonary_artery_pressure", label: "Pulmonary Artery Pressure" },
];


// For these keys, present a RANGE (min->max) from PanEcho & EchoPrime values (not the integrated value).
export const RANGE_KEYS = new Set(["ejection_fraction", "pulmonary_artery_pressure"]);

// Section buckets that determine which tasks appear in which group (and order).
export const SECTION_MAP = {
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
        laids2d: "LA Internal Diameter at Systole (LAIDs2D)",
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
// Values are approximate adult reference ranges based on ASE/BSE-style guidelines.
// They should be reviewed / adapted to your population and indexing (e.g. BSA, sex).

export const NORMAL_RANGES = {
    // -----------------------------
    // NUMERIC (REGRESSION) TASKS
    // -----------------------------

    // Numeric ranges live in measurementRanges.json.
    ...numericRanges,

    // -----------------------------
    // CATEGORICAL (CLASSIFICATION) TASKS
    // These do NOT have min/max; instead:
    //   categories.normal     -> green
    //   categories.borderline -> yellow
    //   categories.abnormal   -> red
    // -----------------------------

    // Valves – stenosis / regurgitation
    aortic_stenosis: {
        categories: {
        normal:     ["None"],
        borderline: ["Mild", "Mild or Moderate"],
        abnormal:   ["Moderate", "Severe", "Moderately or Severely Increased", "Moderate or Severe"],
        },
    },
    aortic_regurgitation: {
        categories: {
        normal:     ["None or Trace"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Moderate or Severe", "Severe"],
        },
    },
    mitral_regurgitation: {
        categories: {
        normal:     ["None or Trace"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Moderate or Severe", "Severe"],
        },
    },
    mitral_stenosis: {
        categories: {
        normal:     ["None"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Moderate or Severe", "Severe"],
        },
    },
    tricuspid_valve_regurgitation: {
        categories: {
        normal:     ["None or Trace"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Moderate or Severe", "Severe"],
        },
    },
    tricuspid_stenosis: {
        categories: {
        normal:     ["Absent", "None"],
        borderline: [],
        abnormal:   ["Present", "Mild", "Moderate", "Severe"],
        },
    },
    pulmonic_valve_regurgitation: {
        categories: {
        normal:     ["Absent", "None", "None or Trace"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Moderate or Severe", "Severe"],
        },
    },
    lvot20mmhg: {
        // “20 mmHg LVOT gradient” flag
        categories: {
        normal:     ["Absent", "No LVOT gradient ≥20 mmHg"],
        borderline: [],
        abnormal:   ["Present", "LVOT gradient ≥20 mmHg"],
        },
    },
    mitral_annular_calcification: {
        categories: {
        normal:     ["Absent"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Severe"],
        },
    },

    // LV size & function (categorical pieces)
    lvsize: {
        categories: {
        normal:     ["Normal"],
        borderline: ["Mildly Increased"],
        abnormal:   ["Moderately or Severely Increased"],
        },
    },
    lvsystolicfunction: {
        categories: {
        normal:     ["Normal", "Normal or Hyperdynamic"],
        borderline: ["Mildly Decreased"],
        abnormal:   ["Moderately or Severely Decreased", "Moderate or Severe"],
        },
    },
    lvwallmotionabnormalities: {
        categories: {
        normal:     ["Absent", "Normal"],
        borderline: [],
        abnormal:   ["Present", "Regional Abnormality"],
        },
    },
    wall_motion_hypokinesis: {
        categories: {
        normal:     ["Absent", "Normal"],
        borderline: ["Mild", "Mild Hypokinesis"],
        abnormal:   ["Moderate Hypokinesis", "Severe Hypokinesis", "Present"],
        },
    },
    lvdiastolicfunction: {
        categories: {
        normal:     ["Normal"],
        borderline: ["Mild", "Mild or Indeterminate", "Indeterminate"],
        abnormal:   ["Moderate", "Severe", "Moderate or Severe"],
        },
    },
    lvwallthickness_increased_any: {
        categories: {
        normal:     ["Not Increased", "Normal"],
        borderline: ["Mildly Increased"],
        abnormal:   ["Moderately or Severely Increased", "Increased"],
        },
    },
    lvwallthickness_increased_modsev: {
        categories: {
        normal:     ["Not Moderately or Severely Increased"],
        borderline: [],
        abnormal:   ["Moderately or Severely Increased"],
        },
    },

    // Atria
    left_atrium_dilation: {
        categories: {
        normal:     ["Normal"],
        borderline: ["Mildly Dilated"],
        abnormal:   ["Moderately or Severely Dilated"],
        },
    },
    right_atrium_dilation: {
        categories: {
        normal:     ["Normal"],
        abnormal:   ["Dilated"],
        },
    },
    elevated_left_atrial_pressure: {
        categories: {
        normal:     ["Normal", "Not Elevated", "Absent"],
        borderline: [],
        abnormal:   ["Elevated", "Present"],
        },
    },
    atrial_septum_hypertrophy: {
        categories: {
        normal:     ["Absent", "Normal"],
        borderline: [],
        abnormal:   ["Present"],
        },
    },

    // Right heart
    right_ventricle_dilation: {
        categories: {
        normal:     ["Normal"],
        borderline: ["Mildly Increased"],
        abnormal:   ["Moderately or Severely Increased"],
        },
    },
    rv_systolic_function_depressed: {
        categories: {
        normal:     ["Normal", "Not Depressed"],
        borderline: [],
        abnormal:   ["Depressed"],
        },
    },
    dilated_ivc: {
        categories: {
        normal:     ["Absent", "Normal"],
        borderline: [],
        abnormal:   ["Present"],
        },
    },
    pericardial_effusion: {
        categories: {
        normal:     ["Absent", "None"],
        borderline: ["Trace", "Small"],
        abnormal:   ["Moderate", "Large", "Tamponade"],
        },
    },

    // Aorta
    aortic_root_dilation: {
        categories: {
        normal:     ["Absent", "Normal"],
        borderline: ["Mild"],
        abnormal:   ["Moderate", "Severe", "Present"],
        },
    },
    bicuspid_aortic_valve: {
        categories: {
        normal:     ["Not Bicuspid"],
        borderline: [],
        abnormal:   ["Bicuspid", "Possible Bicuspid"],
        },
    },

    // Devices / procedures (note: “abnormal” here ≠ pathology, just “device present”)
    pacemaker: {
        categories: {
        normal:     ["Absent"],
        borderline: [],
        abnormal:   ["Present"],
        },
    },
    impella: {
        categories: {
        normal:     ["Absent"],
        borderline: [],
        abnormal:   ["Present"],
        },
    },
    mitraclip: {
        categories: {
        normal:     ["Absent"],
        borderline: [],
        abnormal:   ["Present"],
        },
    },
    tavr: {
        categories: {
        normal:     ["Absent"],
        borderline: [],
        abnormal:   ["Present"],
        },
    },
};
