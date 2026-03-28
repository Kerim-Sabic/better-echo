import pytest

from app.helpers.ensemble.combine_study_analysis_predictions import combine_results


def _assert_task(case_name, output, task_key, expected_label, expected_value, expected_sources):
    task = output["integrated_tasks"].get(task_key)
    assert task is not None, f"{case_name}: missing task '{task_key}'"
    assert task.get("integrated_label") == expected_label, f"{case_name}: label mismatch"
    assert pytest.approx(float(expected_value), rel=0, abs=1e-6) == float(task.get("integrated_value")), f"{case_name}: value mismatch"
    assert (task.get("sources") or []) == expected_sources, f"{case_name}: sources mismatch"


@pytest.mark.parametrize(
    "case_name,primary_analysis_raw,secondary_analysis_raw,task_key,expected_label,expected_value,expected_sources",
    [
        (
            "RA dilation primary analysis preferred positive",
            {"RASize": 0.60},
            {"right_atrium_dilation": 0.00},
            "right_atrium_dilation",
            "Dilated",
            0.60,
            ["primary_analysis"],
        ),
        (
            "RA dilation primary analysis preferred negative",
            {"RASize": 0.20},
            {"right_atrium_dilation": 0.40},
            "right_atrium_dilation",
            "Normal",
            0.80,
            ["primary_analysis"],
        ),
        (
            "Effusion either positive secondary analysis passes",
            {"pericardial-effusion": 0.10},
            {"pericardial_effusion": 0.30},
            "pericardial_effusion",
            "Absent",
            0.90,
            ["primary_analysis"],
        ),
        (
            "Effusion either positive both pass chooses higher",
            {"pericardial-effusion": 0.95},
            {"pericardial_effusion": 0.60},
            "pericardial_effusion",
            "Present",
            0.95,
            ["primary_analysis"],
        ),
        (
            "Effusion either positive neither passes",
            {"pericardial-effusion": 0.14},
            {"pericardial_effusion": 0.10},
            "pericardial_effusion",
            "Absent",
            0.86,
            ["primary_analysis"],
        ),
        (
            "Tricuspid stenosis secondary analysis preferred positive",
            {},
            {"tricuspid_stenosis": 0.60},
            "tricuspid_stenosis",
            "Present",
            0.60,
            ["secondary_analysis"],
        ),
        (
            "Tricuspid stenosis secondary analysis preferred negative",
            {},
            {"tricuspid_stenosis": 0.20},
            "tricuspid_stenosis",
            "Absent",
            0.80,
            ["secondary_analysis"],
        ),
    ],
)
def test_binary_integrated_label_confidence(
    case_name,
    primary_analysis_raw,
    secondary_analysis_raw,
    task_key,
    expected_label,
    expected_value,
    expected_sources,
):
    out = combine_results("demo", primary_analysis_raw, secondary_analysis_raw)
    _assert_task(case_name, out, task_key, expected_label, expected_value, expected_sources)


