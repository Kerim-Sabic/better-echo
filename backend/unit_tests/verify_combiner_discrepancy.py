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

    # Show thresholds we are testing against
    ef_thr = comb.TASK_CONFIG.get("ejection_fraction", {}).get("discrepancy_threshold")
    pap_thr = comb.TASK_CONFIG.get("pulmonary_artery_pressure", {}).get("discrepancy_threshold")
    print(f"Using thresholds: EF={ef_thr}, PAP={pap_thr}")

    def check(case_name, panecho, echoprime, task_key, expected):
        out = comb.combine_results("demo", panecho, echoprime)
        got = out["integrated_tasks"][task_key]["discrepancy"]
        ok = (got == expected)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {case_name}: expected={expected}, got={got}")
        if not ok:
            raise AssertionError(f"Case '{case_name}' failed: expected {expected}, got {got}")

    # ---- EF tests (threshold strict >) ----
    # PanEcho: EF, EchoPrime: ejection_fraction
    check(
        "EF gap > thr -> True",
        {"EF": 60.0},
        {"ejection_fraction": 51.0},
        "ejection_fraction",
        True,
    )
    check(
        "EF gap == thr -> False",
        {"EF": 60.0},
        {"ejection_fraction": 52.0},
        "ejection_fraction",
        False,
    )
    check(
        "EF gap < thr -> False",
        {"EF": 60.0},
        {"ejection_fraction": 55.0},
        "ejection_fraction",
        False,
    )
    check(
        "EF missing one value -> None",
        {"EF": 60.0},
        {"ejection_fraction": None},
        "ejection_fraction",
        None,
    )

    # ---- PAP tests (RVSP vs PAP; strict >) ----
    # PanEcho: RVSP, EchoPrime: pulmonary_artery_pressure_continuous
    check(
        "PAP gap > thr -> True",
        {"RVSP": 35.0},
        {"pulmonary_artery_pressure_continuous": 45.0},
        "pulmonary_artery_pressure",
        True,
    )
    check(
        "PAP gap == thr -> False",
        {"RVSP": 35.0},
        {"pulmonary_artery_pressure_continuous": 27.0},
        "pulmonary_artery_pressure",
        False,
    )
    check(
        "PAP gap < thr -> False",
        {"RVSP": 35.0},
        {"pulmonary_artery_pressure_continuous": 28.0},
        "pulmonary_artery_pressure",
        False,
    )
    check(
        "PAP missing one value -> None",
        {"RVSP": 35.0},
        {},
        "pulmonary_artery_pressure",
        None,
    )

    print("All checks passed.")


if __name__ == "__main__":
    main()
