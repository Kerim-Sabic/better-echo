from __future__ import annotations

from app.services.pipeline.stages.combined import run_combined_stage
from app.services.pipeline.stages.dynamic_measurements import run_dynamic_measurements_stage
from app.services.pipeline.stages.llm import run_llm_stage
from app.services.pipeline.stages.prefilter import run_prefilter_stage


# Part 1. Stage-handler registry for queue runtime dispatch.
STAGE_HANDLER_MAP = {
    "prefilter": run_prefilter_stage,
    "combined": run_combined_stage,
    "dynamic_measurements": run_dynamic_measurements_stage,
    "llm": run_llm_stage,
}


def get_stage_handler(stage_name: str):
    return STAGE_HANDLER_MAP.get(stage_name)


__all__ = [
    "get_stage_handler",
    "STAGE_HANDLER_MAP",
]
