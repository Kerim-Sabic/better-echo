import os
import sys


def _add_app_to_syspath():
    """Ensure `app` package is importable when running this script directly."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.abspath(os.path.join(script_dir, ".."))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)


def main():
    _add_app_to_syspath()
    import app.helpers.combine_panecho_echoprime_predictions as comb

    def check(case, panecho_raw, echoprime_raw, task_key, exp_label, exp_value, exp_sources):
        out = comb.combine_results("demo", panecho_raw, echoprime_raw)
        task = out["integrated_tasks"].get(task_key)
        if task is None:
            raise AssertionError(f"{case}: task_key '{task_key}' missing in output")

        got_label = task.get("integrated_label")
        got_value = task.get("integrated_value")
        got_sources = task.get("sources") or []

        if got_label != exp_label:
            raise AssertionError(f"{case}: label mismatch. expected={exp_label}, got={got_label}")
        if (got_value is None) or (abs(float(got_value) - float(exp_value)) > 1e-6):
            raise AssertionError(f"{case}: value mismatch. expected={exp_value}, got={got_value}")
        if got_sources != exp_sources:
            raise AssertionError(f"{case}: sources mismatch. expected={exp_sources}, got={got_sources}")

        print(f"[PASS] {case}: label={got_label}, value={got_value}, sources={got_sources}")

    # 1) prefer_model:PanEcho (binary) — right_atrium_dilation (PanEcho: RASize)
    # Thresholds: PanEcho 0.30, EchoPrime 0.50
    check(
        "RA dilation PanEcho preferred: positive",
        panecho_raw={"RASize": 0.60},
        echoprime_raw={"right_atrium_dilation": 0.00},
        task_key="right_atrium_dilation",
        exp_label="Dilated",
        exp_value=0.60,
        exp_sources=["PanEcho"],
    )
    check(
        "RA dilation PanEcho preferred: negative",
        panecho_raw={"RASize": 0.20},
        echoprime_raw={"right_atrium_dilation": 0.40},
        task_key="right_atrium_dilation",
        exp_label="Normal",
        exp_value=0.80,  # 1 - p_present
        exp_sources=["PanEcho"],
    )

    # 2) positive_if_either_positive — pericardial_effusion
    # Thresholds: PanEcho 0.15, EchoPrime 0.20
    check(
        "Effusion either positive: EP passes",
        panecho_raw={"pericardial-effusion": 0.10},
        echoprime_raw={"pericardial_effusion": 0.30},
        task_key="pericardial_effusion",
        exp_label="Present",  # EP label
        exp_value=0.30,
        exp_sources=["EchoPrime"],
    )
    check(
        "Effusion either positive: both pass chooses higher",
        panecho_raw={"pericardial-effusion": 0.95},
        echoprime_raw={"pericardial_effusion": 0.60},
        task_key="pericardial_effusion",
        exp_label="Present",  # PanEcho label is also 'Present'
        exp_value=0.95,
        exp_sources=["PanEcho"],
    )
    check(
        "Effusion either positive: neither passes -> negative with higher neg confidence",
        panecho_raw={"pericardial-effusion": 0.14},
        echoprime_raw={"pericardial_effusion": 0.10},
        task_key="pericardial_effusion",
        exp_label="Absent",  # EP negative label chosen (0.90 > 0.86)
        exp_value=0.90,
        exp_sources=["EchoPrime"],
    )

    # 3) prefer_model:EchoPrime (binary) — tricuspid_stenosis
    # Thresholds: EP 0.50 (PanEcho none)
    check(
        "TS EchoPrime preferred: positive",
        panecho_raw={},
        echoprime_raw={"tricuspid_stenosis": 0.60},
        task_key="tricuspid_stenosis",
        exp_label="Present",
        exp_value=0.60,
        exp_sources=["EchoPrime"],
    )
    check(
        "TS EchoPrime preferred: negative",
        panecho_raw={},
        echoprime_raw={"tricuspid_stenosis": 0.20},
        task_key="tricuspid_stenosis",
        exp_label="Absent",
        exp_value=0.80,
        exp_sources=["EchoPrime"],
    )

    print("All binary integrated label/confidence checks passed.")


if __name__ == "__main__":
    main()

