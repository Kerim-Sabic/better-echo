from typing import Optional, Dict, Any
import json

from app.models.derived_results import DerivedResult

def build_llm_report_from_row(llm_report_row: Optional[DerivedResult]) -> Dict[str, Any]:
    """Helper function that safely parses value_json to dict."""
    if not llm_report_row or llm_report_row.value_json is None:
        return {}
    if isinstance(llm_report_row.value_json, (dict, list)):
        return llm_report_row.value_json
    try:
        return json.loads(llm_report_row.value_json)
    except Exception:
        return {}