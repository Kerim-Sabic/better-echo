import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    CORS_ORIGIN: Annotated[list[str], NoDecode]

    ORTHANC_URL: str
    ORTHANC_USER: str
    ORTHANC_PASS: str

    DATABASE_URL: str = "postgresql+psycopg://horalix:horalix_dev@localhost:5433/horalix"
    TEST_DATABASE_URL: Optional[str] = None
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    POSTGRES_PORT: int = 5433
    VIEWER_PUBLIC_BASE_URL: str = "http://localhost:3001"
    STOP_LOCAL_INFRA_ON_QUIT: bool = True

    SECRET_KEY: str
    TOKEN_EXPIRE_HOURS: int

    # Set true when the backend is reached via HTTPS (e.g. the AWS cloud trial
    # deployment behind Caddy). Stays false for on-prem LAN deployments where
    # doctors hit the server over plain http on the hospital network.
    COOKIE_SECURE: bool = False

    # WebAuthn pending ceremony state backend (memory | redis).
    WEBAUTHN_STATE_BACKEND: str = "memory"
    # Enforce single-process runtime when using in-memory WebAuthn state.
    WEBAUTHN_REQUIRE_SINGLE_PROCESS: bool = True

    # Model preload toggles (default on; disable per machine if needed)
    PRIMARY_ANALYSIS_PRELOAD: bool = True
    PRIMARY_ANALYSIS_WARMUP: bool = False
    SECONDARY_ANALYSIS_PRELOAD: bool = True
    SECONDARY_ANALYSIS_WARMUP: bool = False
    MOTION_SEGMENTATION_PRELOAD: bool = True
    MOTION_SEGMENTATION_WARMUP: bool = False
    STUDY_MEASUREMENTS_PRELOAD: bool = True
    STUDY_MEASUREMENTS_WARMUP: bool = False

    # Batch sizes (conservative defaults; adjust per hardware)
    PRIMARY_ANALYSIS_BATCH: int = 8
    MOTION_SEGMENTATION_BATCH: int = 16
    STUDY_MEASUREMENTS_BATCH: int = 16
    MEASUREMENTS_OUTPUT_FPS: int = 30
    DICOM_UPLOAD_MAX_FILES: int = 50
    SECONDARY_ANALYSIS_MAX_INSTANCES: int = 100
    SECONDARY_ANALYSIS_CLASSIFY_CHUNK_SIZE: int = 8
    SECONDARY_ANALYSIS_METRICS_CHUNK_SIZE: int = 8
    SECONDARY_ANALYSIS_ENCODER_BATCH: int = 4

    # --- Mixed-precision / accelerator tuning (GPU only; CPU path unchanged) ---
    # Master switch for Automatic Mixed Precision (torch.autocast). When on,
    # CUDA inference runs in INFERENCE_AMP_DTYPE; CPU always stays FP32.
    INFERENCE_AMP_ENABLED: bool = True
    INFERENCE_AMP_DTYPE: str = "float16"  # float16 | bfloat16
    # channels_last memory format for CNN weights + 4-D inputs (tensor cores).
    INFERENCE_CHANNELS_LAST: bool = True
    # cuDNN convolution autotuning; safe because inference input shapes are fixed.
    # Disable for strict run-to-run determinism.
    INFERENCE_CUDNN_BENCHMARK: bool = True
    INFERENCE_ALLOW_TF32: bool = True
    # AMP for the EchoPrime secondary-analysis path is opt-in: the view
    # classifier is a discrete decision that is more precision-sensitive than the
    # continuous regression/segmentation heads, so it defaults off until locally
    # validated.
    SECONDARY_ANALYSIS_AMP_ENABLED: bool = False

    # torch.compile for the fixed-shape inference CNNs. Opt-in (default off):
    # needs a working Inductor/Triton backend and pays a one-time per-shape
    # compile cost (use the *_WARMUP flags to move it off the first study).
    # Falls back to eager per-graph on any compile failure; outputs unchanged
    # within FP tolerance.
    INFERENCE_TORCH_COMPILE: bool = False
    INFERENCE_TORCH_COMPILE_MODE: str = "reduce-overhead"

    # --- CPU/GPU overlap (Part 3) ---
    # Overlap DICOM decode/preprocess and per-frame postprocess with GPU forward
    # passes. Pure scheduling change; outputs are identical and order-preserved.
    INFERENCE_CPU_GPU_OVERLAP: bool = True
    # Thread count for per-frame motion-segmentation postprocess (0 => auto,
    # a small CPU-bound default). OpenCV releases the GIL so threads help.
    INFERENCE_POSTPROCESS_WORKERS: int = 0

    # --- Temporal sampling (Part 4) for the 2D keypoint / linear lane ---
    # Stride of 1 == process every frame (behaviour unchanged). Set to 2 to infer
    # every second frame and interpolate the skipped ones. Off by default: raising
    # it changes clinical outputs and must pass the offline parity harness first.
    LINEAR_TEMPORAL_STRIDE: int = 1
    LINEAR_TEMPORAL_INTERPOLATION: bool = True
    # Runtime self-gate: spot-check a few skipped frames against interpolation and
    # fall back to full every-frame inference if the error exceeds these limits.
    LINEAR_TEMPORAL_SELF_CHECK: bool = True
    LINEAR_TEMPORAL_SELF_CHECK_SAMPLES: int = 3
    LINEAR_TEMPORAL_MAX_POINT_ERROR_PX: float = 2.0
    LINEAR_TEMPORAL_MAX_LENGTH_ERROR_CM: float = 0.1

    # Inference runtime profile and queue controls
    INFERENCE_PROFILE: str = "auto"
    PIPELINE_UNLOAD_POLICY: str = "stage"
    PIPELINE_MAX_ACTIVE_STUDIES: int = 1
    PIPELINE_POLL_INTERVAL_MS: int = 500
    PIPELINE_VIEW_CONFIDENCE_MIN: float = 0.75

    # Per-study decoded DICOM frame cache (lifespan = one analysis job)
    FRAME_CACHE_ENABLED: bool = True
    FRAME_CACHE_MAX_MB: int = 4096

    # Preferred devices (auto | cpu | cuda:<index>)
    PRIMARY_ANALYSIS_DEVICE: str = "auto"
    SECONDARY_ANALYSIS_DEVICE: str = "auto"
    MOTION_SEGMENTATION_DEVICE: str = "auto"
    STUDY_MEASUREMENTS_DEVICE: str = "auto"
    REPORTING_RESERVED_DEVICE: Optional[str] = None

    ENABLE_LLM: bool = True
    LLM_BASE_URL: str = "http://localhost:8012/v1"
    LLM_API_KEY: str = "local-echo-key"
    REPORTING_MODEL_ID: str = "local-reporting-model"
    LLM_WSL_DISTRO: str = "Ubuntu"
    LLM_VENV_PATH: str = "~/vllm"
    LLM_GPU_INDEX: int = 1
    HF_HOME: Optional[str] = None

    LICENSE_ENFORCEMENT: bool = False
    LICENSE_STORAGE_DIR: Optional[str] = None
    LICENSE_PUBLIC_KEY_B64: Optional[str] = None

    VENDOR_ACCESS_ENABLED: bool = False
    VENDOR_ACCESS_USERNAME: Optional[str] = None
    VENDOR_ACCESS_DISPLAY_NAME: Optional[str] = None
    VENDOR_ACCESS_PASSWORD_HASH: Optional[str] = None

    LLM_PROMPT_TEMPLATE_PATH: str = "app/prompting/echo_report_prompt.md.j2"
    LLM_TEMPERATURE_REPORT: float = 0.0
    LLM_TOP_P_REPORT: float = 1.0
    LLM_SEED_REPORT: int = 0
    LLM_TEMPERATURE_CHAT: float = 0.2
    LLM_TOP_P_CHAT: float = 1.0
    LLM_SEED_CHAT: int = 0
    LLM_DESIRED_OUTPUT_TOKENS_REPORT: int = 1400
    LLM_DESIRED_OUTPUT_TOKENS_CHAT: int = 512
    # Keep aligned with vLLM --max-model-len
    LLM_SERVER_MAX_LEN: int = 16384
    # Hard cap for chat history turns
    LLM_HISTORY_MAX_TURNS: int = 2
    # Versioning for prompts/policies
    LLM_PROMPT_VERSION: str = "v1"

    @field_validator("CORS_ORIGIN", mode="before")
    @classmethod
    def parse_cors_origin(cls, value):
        if isinstance(value, list):
            return value

        raw_value = str(value or "").strip()
        if not raw_value:
            return []

        raw_value = raw_value.split(" #", 1)[0].strip()

        if raw_value.startswith("["):
            parsed_value = json.loads(raw_value)
            if not isinstance(parsed_value, list):
                raise ValueError("CORS_ORIGIN must decode to a list of origins")
            return [str(item).strip() for item in parsed_value if str(item).strip()]

        return [
            item.strip().strip('"').strip("'")
            for item in raw_value.split(",")
            if item.strip().strip('"').strip("'")
        ]

    class Config:
        env_file = str(Path(__file__).resolve().parents[2] / ".env")
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()
