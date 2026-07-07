import os

from app.core.runtime_paths import uploads_dir

# --- Artifact types used in derived_results table, type column ---
PRIMARY_ANALYSIS_TYPE = "StudyAnalysisPrimary_Tasks"
PRIMARY_ANALYSIS_TYPES = (PRIMARY_ANALYSIS_TYPE,)

SECONDARY_ANALYSIS_TYPE = "StudyAnalysisSecondary_Tasks"
SECONDARY_ANALYSIS_TYPES = (SECONDARY_ANALYSIS_TYPE,)

COMBINED_ANALYSIS_TYPE = "StudyAnalysis_Combined_Tasks"
COMBINED_ANALYSIS_TYPES = (COMBINED_ANALYSIS_TYPE,)

MEASUREMENT_WORKFLOW_TYPE = "StudyMeasurements_Combined_Tasks"
MEASUREMENT_WORKFLOW_TYPES = (MEASUREMENT_WORKFLOW_TYPE,)

REPORT_SUMMARY_TYPE = "Study_Report"
REPORT_SUMMARY_TYPES = (REPORT_SUMMARY_TYPE,)

MOTION_SEGMENTATION_TYPE = "MotionSegmentation_LV"
MOTION_SEGMENTATION_TYPES = (MOTION_SEGMENTATION_TYPE,)

# Forward-looking contract: a future speckle-tracking / segmental-strain model
# persists per-segment peak systolic longitudinal strain here, keyed by ASE
# 17-segment id. When present, the GLS bullseye renders measured segments; until
# then the bullseye shows the measured global GLS only (no fabricated segments).
SEGMENTAL_STRAIN_TYPE = "SegmentalStrain_LV"
SEGMENTAL_STRAIN_TYPES = (SEGMENTAL_STRAIN_TYPE,)

LV_SEGMENTATION_OVERLAY_TYPE = "lv_segmentation"
LV_SEGMENTATION_OVERLAY_KIND = "lv_segmentation_overlay"
LV_SEGMENTATION_OVERLAY_SCHEMA_VERSION = 1

LINEAR_MEASUREMENT_OVERLAY_TYPE = "linear_measurement"
LINEAR_MEASUREMENT_OVERLAY_KIND = "linear_measurement_overlay"
LINEAR_MEASUREMENT_OVERLAY_SCHEMA_VERSION = 1

DOPPLER_MEASUREMENT_OVERLAY_TYPE = "doppler_measurement"
DOPPLER_MEASUREMENT_OVERLAY_KIND = "doppler_measurement_overlay"
DOPPLER_MEASUREMENT_OVERLAY_SCHEMA_VERSION = 1

LINEAR_MEASUREMENTS_TYPE_PREFIX = "LinearMeasurements_"

SPECTRAL_MEASUREMENTS_TYPE_PREFIX = "SpectralMeasurements_"

# --- Public model identifiers persisted in derived_results.model_name ---
PRIMARY_ANALYSIS_MODEL_NAME = "StudyAnalysisPrimary"
SECONDARY_ANALYSIS_MODEL_NAME = "StudyAnalysisSecondary"
COMBINED_ANALYSIS_MODEL_NAME = "StudyAnalysisCombined"
MOTION_SEGMENTATION_MODEL_NAME = "MotionSegmentation"
LINEAR_MEASUREMENTS_MODEL_NAME = "LinearMeasurements"
SPECTRAL_MEASUREMENTS_MODEL_NAME = "SpectralMeasurements"
REPORT_SUMMARY_MODEL_NAME = "StudyReportGenerator"

# --- Route segments exposed over the API ---
ANALYSIS_RESULTS_ROUTE_SEGMENT = "study-analysis-results"
ANALYSIS_OVERRIDES_ROUTE_SEGMENT = "study-analysis-overrides"
MEASUREMENT_RESULTS_ROUTE_SEGMENT = "study-measurements-results"
OVERLAYS_ROUTE_SEGMENT = "overlays"

# --- Output folders exposed under backend/app/uploads ---
MOTION_SEGMENTATION_UPLOAD_DIRNAME = "motion_segmentation_files"
LINEAR_MEASUREMENTS_UPLOAD_DIRNAME = "linear_measurements_files"
SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME = "spectral_measurements_files"
REPORT_SUMMARY_UPLOAD_DIRNAME = "study_reports"

# --- Task keys exposed in dynamic measurement payloads ---
MOTION_SEGMENTATION_TASK_KEY = "motion_segmentation_lv"
LINEAR_MEASUREMENTS_TASK_KEY = "measurement_linear"
SPECTRAL_MEASUREMENTS_TASK_KEY = "measurement_spectral"

# --- Artifact types used for uploading local files ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.normpath(str(uploads_dir()))

# --- Artifact type used for auth cookie name ---
AUTH_COOKIE_NAME = "auth_token"


def linear_measurements_result_type(model_weights: str) -> str:
    return f"{LINEAR_MEASUREMENTS_TYPE_PREFIX}{model_weights}"


def spectral_measurements_result_type(model_weights: str) -> str:
    return f"{SPECTRAL_MEASUREMENTS_TYPE_PREFIX}{model_weights}"
