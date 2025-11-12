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

    # Import after amending sys.path
    import app.helpers.combine_panecho_echoprime_predictions as comb

    # PanEcho class orders (from comb.PANECHO_MULTICLASS_LABELS)
    MR_CLASSES = ["Mild", "Moderate|Severe", "None|Trace"]
    AS_CLASSES = ["Mild|Moderate", "None", "Severe"]

    def check_multiclass_case(case_name, panecho_raw, echoprime_raw, task_key, expected_label, expected_prob, expected_classes):
        out = comb.combine_results("demo", panecho_raw, echoprime_raw)
        task = out["integrated_tasks"][task_key]

        # 1) panecho_value_or_prob should be a dict of class -> prob
        panecho_payload = task["panecho_value_or_prob"]
        if not isinstance(panecho_payload, dict):
            raise AssertionError(f"{case_name}: panecho_value_or_prob is not a dict (got {type(panecho_payload)})")

        # 2) It should include all expected class keys
        missing = [c for c in expected_classes if c not in panecho_payload]
        if missing:
            raise AssertionError(f"{case_name}: missing classes in dict: {missing}")

        # 3) integrated_label and integrated_value should match argmax
        got_label = task["integrated_label"]
        got_value = task["integrated_value"]

        if got_label != expected_label:
            raise AssertionError(f"{case_name}: integrated_label mismatch. expected={expected_label}, got={got_label}")

        # float compare with small tolerance
        if got_value is None or abs(float(got_value) - float(expected_prob)) > 1e-6:
            raise AssertionError(f"{case_name}: integrated_value mismatch. expected={expected_prob}, got={got_value}")

        # 4) sources should indicate PanEcho only
        got_sources = task.get("sources") or []
        if got_sources != ["PanEcho"]:
            raise AssertionError(f"{case_name}: sources mismatch. expected=['PanEcho'], got={got_sources}")

        print(f"[PASS] {case_name}: label={got_label}, value={got_value}")

    # ---- Case 1: Mitral Regurgitation (MR) distribution (already normalized) ----
    # PanEcho classes for MVRegurgitation: ["Mild","Moderate|Severe","None|Trace"]
    # Top should be "None|Trace" (0.70)
    check_multiclass_case(
        "MR normalized distribution -> dict + argmax",
        panecho_raw={"MVRegurgitation": [0.20, 0.10, 0.70]},
        echoprime_raw={"mitral_regurgitation": 0.00},  # EP present but ignored for integrated_label/value
        task_key="mitral_regurgitation",
        expected_label="None|Trace",
        expected_prob=0.70,
        expected_classes=MR_CLASSES,
    )

    # ---- Case 2: Aortic Stenosis (AS) severe top ----
    # PanEcho classes: ["Mild|Moderate", "None", "Severe"]; top "Severe" (0.90)
    check_multiclass_case(
        "AS severe top class -> dict + argmax",
        panecho_raw={"AVStenosis": [0.05, 0.05, 0.90]},
        echoprime_raw={"aortic_stenosis": 0.78},  # EP may be high, but prefer PanEcho for integrated fields
        task_key="aortic_stenosis",
        expected_label="Severe",
        expected_prob=0.90,
        expected_classes=AS_CLASSES,
    )

    # ---- Case 3: MR non-normalized vector -> normalization preserved in dict ----
    # Provide [2,1,7] which normalizes to [0.2, 0.1, 0.7]; top -> "None|Trace"
    check_multiclass_case(
        "MR non-normalized vector -> normalized dict",
        panecho_raw={"MVRegurgitation": [2.0, 1.0, 7.0]},
        echoprime_raw={},  # EP absent
        task_key="mitral_regurgitation",
        expected_label="None|Trace",
        expected_prob=0.70,
        expected_classes=MR_CLASSES,
    )

    print("All multiclass prefer_model:PanEcho checks passed.")


if __name__ == "__main__":
    main()

