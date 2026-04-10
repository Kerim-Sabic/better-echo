from __future__ import annotations


STAGE_NAMES = (
    "prefilter",
    "combined",
    "dynamic_measurements",
    "llm",
)

STAGE_HANDLER_MAP = globals().get("STAGE_HANDLER_MAP", {})
STAGE_HANDLER_MAP.clear()


def _load_prefilter_stage():
    from app.services.pipeline.stages.prefilter import run_prefilter_stage

    return run_prefilter_stage


def _load_combined_stage():
    from app.services.pipeline.stages.combined import run_combined_stage

    return run_combined_stage


def _load_dynamic_measurements_stage():
    from app.services.pipeline.stages.dynamic_measurements import run_dynamic_measurements_stage

    return run_dynamic_measurements_stage


def _load_llm_stage():
    from app.services.pipeline.stages.llm import run_llm_stage

    return run_llm_stage


_STAGE_LOADERS = {
    "prefilter": _load_prefilter_stage,
    "combined": _load_combined_stage,
    "dynamic_measurements": _load_dynamic_measurements_stage,
    "llm": _load_llm_stage,
}


def get_stage_handler(stage_name: str):
    cached_handler = STAGE_HANDLER_MAP.get(stage_name)
    if cached_handler is not None:
        return cached_handler

    loader = _STAGE_LOADERS.get(stage_name)
    if loader is None:
        return None

    handler = loader()
    STAGE_HANDLER_MAP[stage_name] = handler
    return handler


def get_stage_handler_map():
    return {
        stage_name: get_stage_handler(stage_name)
        for stage_name in STAGE_NAMES
    }


__all__ = [
    "get_stage_handler",
    "get_stage_handler_map",
    "STAGE_HANDLER_MAP",
    "STAGE_NAMES",
]
