import pytest

from app.helpers.ensemble.combine_study_analysis_predictions import combine_results


MR_CLASSES = ["Mild", "Moderate or Severe", "None or Trace"]
AS_CLASSES = ["Mild or Moderate", "None", "Severe"]


def _assert_multiclass_task(case_name, out, task_key, expected_label, expected_prob, expected_classes):
    task = out["integrated_tasks"][task_key]

    primary_payload = task["primary_value_or_prob"]
    assert isinstance(primary_payload, dict), f"{case_name}: primary payload must be dict"

    missing = [c for c in expected_classes if c not in primary_payload]
    assert not missing, f"{case_name}: missing classes {missing}"

    assert task["integrated_label"] == expected_label, f"{case_name}: label mismatch"
    assert pytest.approx(float(expected_prob), rel=0, abs=1e-6) == float(task["integrated_value"]), f"{case_name}: probability mismatch"

    assert (task.get("sources") or []) == ["primary_analysis"], f"{case_name}: sources mismatch"


@pytest.mark.parametrize(
    "case_name,primary_analysis_raw,secondary_analysis_raw,task_key,expected_label,expected_prob,expected_classes",
    [
        (
            "MR normalized distribution",
            {"MVRegurgitation": [0.20, 0.10, 0.70]},
            {"mitral_regurgitation": 0.00},
            "mitral_regurgitation",
            "None or Trace",
            0.70,
            MR_CLASSES,
        ),
        (
            "AS severe top class",
            {"AVStenosis": [0.05, 0.05, 0.90]},
            {"aortic_stenosis": 0.78},
            "aortic_stenosis",
            "Severe",
            0.90,
            AS_CLASSES,
        ),
        (
            "MR non-normalized vector",
            {"MVRegurgitation": [2.0, 1.0, 7.0]},
            {},
            "mitral_regurgitation",
            "None or Trace",
            0.70,
            MR_CLASSES,
        ),
    ],
)
def test_multiclass_prefers_primary_analysis(
    case_name,
    primary_analysis_raw,
    secondary_analysis_raw,
    task_key,
    expected_label,
    expected_prob,
    expected_classes,
):
    out = combine_results("demo", primary_analysis_raw, secondary_analysis_raw)
    _assert_multiclass_task(
        case_name,
        out,
        task_key,
        expected_label,
        expected_prob,
        expected_classes,
    )


