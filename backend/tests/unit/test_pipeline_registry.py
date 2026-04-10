import importlib


def test_stage_handler_registry_is_lazy_and_cacheable():
    registry = importlib.import_module("app.services.pipeline.internal.registry")
    registry = importlib.reload(registry)

    assert registry.STAGE_HANDLER_MAP == {}

    combined_handler = registry.get_stage_handler("combined")

    assert callable(combined_handler)
    assert registry.STAGE_HANDLER_MAP["combined"] is combined_handler


def test_stage_handler_registry_respects_cached_overrides():
    registry = importlib.import_module("app.services.pipeline.internal.registry")
    registry = importlib.reload(registry)

    sentinel = lambda **_: "sentinel"
    registry.STAGE_HANDLER_MAP["combined"] = sentinel

    assert registry.get_stage_handler("combined") is sentinel
    registry.STAGE_HANDLER_MAP.pop("combined", None)
