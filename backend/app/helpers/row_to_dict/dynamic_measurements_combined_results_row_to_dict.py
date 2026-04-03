from typing import Optional, Dict, Any

from app.database_models.derived_results import DerivedResult
from app.services.results import build_dynamic_measurements_payload

def combined_results_row_to_dict(combined_results_row: Optional[DerivedResult]) -> Dict[str, Any]:
    """Normalize stored dynamic/measurements combined payload for observer responses."""
    if not combined_results_row or combined_results_row.value_json is None:
        return {"instances": []}
    return build_dynamic_measurements_payload(combined_results_row.value_json)
