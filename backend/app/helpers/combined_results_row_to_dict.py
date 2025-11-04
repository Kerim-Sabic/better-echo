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
    integrated_tasks: Optional[Any],
) -> Dict[str, Any]:
    """
    Returns a single payload that *consists of* one JSON sections.
    """
    return {
        "integrated_tasks": _safe_json_to_dict(integrated_tasks),
    }

def build_combined_sections_from_row(derived_results) -> Dict[str, Any]:
    """
    Convenience wrapper if your DerivedResult row has these four columns.
    """
    if derived_results is None: 
        return {
            "integrated_tasks": {},
        }
    return build_combined_sections_payload(
        getattr(derived_results, "value_json", None),
    )