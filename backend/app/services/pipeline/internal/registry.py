from __future__ import annotations


STAGE_NAMES = (
    "prefilter",
    "combined",
    "dynamic_measurements",
    "llm",
)


def get_stage_handler(stage_name: str):
    if stage_name == "prefilter":
        from app.services.pipeline.stages.prefilter import run_prefilter_stage

        return run_prefilter_stage
    if stage_name == "combined":
        from app.services.pipeline.stages.combined import run_combined_stage

        return run_combined_stage
    if stage_name == "dynamic_measurements":
        from app.services.pipeline.stages.dynamic_measurements import run_dynamic_measurements_stage

        return run_dynamic_measurements_stage
    if stage_name == "llm":
        from app.services.pipeline.stages.llm import run_llm_stage

        return run_llm_stage
    return None


STAGE_HANDLER_MAP = {
    stage_name: get_stage_handler(stage_name)
    for stage_name in STAGE_NAMES
}


def get_stage_handler_map():
    return STAGE_HANDLER_MAP


__all__ = [
    "get_stage_handler",
    "get_stage_handler_map",
    "STAGE_HANDLER_MAP",
    "STAGE_NAMES",
]
