from typing import Optional, Dict, Any

from app.database_models.derived_results import DerivedResult

def build_llm_report_from_row(llm_report_row: Optional[DerivedResult]) -> Dict[str, Any]:
    """Return value_json when it is already structured JSON."""
    if not llm_report_row or llm_report_row.value_json is None:
        return {}
    return llm_report_row.value_json if isinstance(llm_report_row.value_json, dict) else {}
