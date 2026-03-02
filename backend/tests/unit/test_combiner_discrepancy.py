import pytest

import app.helpers.ensemble.combine_panecho_echoprime_predictions as comb


def _get_discrepancy(panecho_raw, echoprime_raw, task_key):
    out = comb.combine_results("demo", panecho_raw, echoprime_raw)
    return out["integrated_tasks"][task_key]["discrepancy"]


@pytest.mark.parametrize(
    "panecho_raw,echoprime_raw,task_key,expected",
    [
        ({"EF": 60.0}, {"ejection_fraction": 51.0}, "ejection_fraction", True),
        ({"EF": 60.0}, {"ejection_fraction": 52.0}, "ejection_fraction", False),
        ({"EF": 60.0}, {"ejection_fraction": 55.0}, "ejection_fraction", False),
        ({"EF": 60.0}, {"ejection_fraction": None}, "ejection_fraction", None),
        ({"RVSP": 35.0}, {"pulmonary_artery_pressure_continuous": 45.0}, "pulmonary_artery_pressure", True),
        ({"RVSP": 35.0}, {"pulmonary_artery_pressure_continuous": 27.0}, "pulmonary_artery_pressure", False),
        ({"RVSP": 35.0}, {"pulmonary_artery_pressure_continuous": 28.0}, "pulmonary_artery_pressure", False),
        ({"RVSP": 35.0}, {}, "pulmonary_artery_pressure", None),
    ],
)
def test_combiner_discrepancy_logic(panecho_raw, echoprime_raw, task_key, expected):
    assert _get_discrepancy(panecho_raw, echoprime_raw, task_key) == expected


def test_discrepancy_thresholds_are_loaded():
    ef_thr = comb.TASK_CONFIG.get("ejection_fraction", {}).get("discrepancy_threshold")
    pap_thr = comb.TASK_CONFIG.get("pulmonary_artery_pressure", {}).get("discrepancy_threshold")
    assert ef_thr is not None
    assert pap_thr is not None

