import os

# --- Artifact types used in derived_results table, type column ---
PANECHO_TYPE = "PanEcho_AllTasks"
ECHOPRIME_TYPE = "EchoPrime_AllTasks_and_Report"
PANECHO_ECHOPRIME_COMBINED_TYPE = "PanEcho_EchoPrime_Combined_Tasks"
DYNAMIC_MEASUREMENTS_COMBINED_TYPE = "Dynamic_Measurements_Combined_Tasks"
LLM_REPORT_TYPE = "LLM_Echo_Report"

# --- Artifact types used for uploading local files ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app/core
UPLOAD_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "uploads"))  # backend/app/uploads

# --- Artifact type used for auth cookie name ---
AUTH_COOKIE_NAME = "auth_token"