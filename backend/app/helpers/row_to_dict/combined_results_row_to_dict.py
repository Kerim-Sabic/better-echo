from typing import Any, Dict, Optional

def _safe_json_to_dict(value: Any) -> Dict[str, Any]:
    """
    Return a dict payload when the JSON column is already structured.
    """
    return value if isinstance(value, dict) else {}

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
