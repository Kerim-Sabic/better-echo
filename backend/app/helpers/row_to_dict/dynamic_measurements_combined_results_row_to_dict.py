from typing import Optional, Dict, Any

from app.database_models.derived_results import DerivedResult

def combined_results_row_to_dict(combined_results_row: Optional[DerivedResult]) -> Dict[str, Any]:
    """Return value_json when it is already structured JSON."""
    if not combined_results_row or combined_results_row.value_json is None:
        return {}
    return combined_results_row.value_json if isinstance(combined_results_row.value_json, dict) else {}
