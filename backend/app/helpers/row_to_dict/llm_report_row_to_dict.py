from typing import Optional, Dict, Any
import json

from app.models.derived_results import DerivedResult

def build_llm_report_from_row(combined_results_row: Optional[DerivedResult]) -> Dict[str, Any]:
    """Helper function that safely parses value_json to dict."""
    if not combined_results_row or combined_results_row.value_json is None:
        return {}
    if isinstance(combined_results_row.value_json, (dict, list)):
        return combined_results_row.value_json
    try:
        return json.loads(combined_results_row.value_json)
    except Exception:
        return {}