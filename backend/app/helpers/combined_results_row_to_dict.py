from typing import Any, Dict, Optional
import json

def _safe_json_to_dict(value: Any) -> Dict[str, Any]:
    """
    Coerce a DB JSON column (dict | JSON string | None) to a dict.
    Non-dict JSON (e.g., list) or parse errors -> {}.
    """
    if value is None:
        return {}
    if isinstance(value, Dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, Dict) else {}
        except Exception:
            return {}
    # Already a JSON-like object (e.g., from SQLite JSON dialect) but not a dict
    return {}

def build_combined_sections_payload(
    panecho_echoprime_overlapping_tasks: Optional[Any],
    panecho_only_tasks: Optional[Any],
    echoprime_only_tasks: Optional[Any],
    disagreement_flags: Optional[Any],
    integrated_tasks: Optional[Any],
) -> Dict[str, Any]:
    """
    Returns a single payload that *consists of* four JSON sections.
    """
    return {
        "panecho_echoprime_overlapping_tasks": _safe_json_to_dict(panecho_echoprime_overlapping_tasks),
        "panecho_only_tasks": _safe_json_to_dict(panecho_only_tasks),
        "echoprime_only_tasks": _safe_json_to_dict(echoprime_only_tasks),
        "disagreement_flags": _safe_json_to_dict(disagreement_flags),
        "integrated_tasks": _safe_json_to_dict(integrated_tasks),
    }

def build_combined_sections_from_row(derived_results) -> Dict[str, Any]:
    """
    Convenience wrapper if your DerivedResult row has these four columns.
    """
    if derived_results is None: 
        return {
            "panecho_echoprime_overlapping_tasks": {},
            "panecho_only_tasks": {},
            "echoprime_only_tasks": {},
            "disagreement_flags": {},
            "integrated_tasks": {},
        }
    return build_combined_sections_payload(
        getattr(derived_results, "panecho_echoprime_overlapping_tasks", None),
        getattr(derived_results, "panecho_only_tasks", None),
        getattr(derived_results, "echoprime_only_tasks", None),
        getattr(derived_results, "disagreement_flags", None),
        getattr(derived_results, "integrated_tasks", None),
    )