from types import SimpleNamespace

from app.services.results import build_combined_display_payload


def _row_stub(value_json, *, patient_sex="M", heart_rate_bpm=60.0):
    patient = SimpleNamespace(patient_sex=patient_sex)
    study = SimpleNamespace(patient=patient, heart_rate_bpm=heart_rate_bpm)
    return SimpleNamespace(value_json=value_json, study=study)


def _sample_combined_value_json(*, overrides=None):
    return {
        "integrated_tasks": {
            "ejection_fraction": {
                "panecho_value_or_prob": 55.0,
                "echoprime_value_or_prob": 50.0,
                "integrated_value": 52.5,
                "integrated_label": None,
                "units": "%",
                "discrepancy": False,
            },
            "gls": {
                "panecho_value_or_prob": -19.0,
                "echoprime_value_or_prob": -21.0,
                "integrated_value": -20.0,
                "integrated_label": None,
                "units": "%",
                "discrepancy": False,
            },
            "pulmonary_artery_pressure": {
                "panecho_value_or_prob": 35.0,
                "echoprime_value_or_prob": 40.0,
                "integrated_value": 37.5,
                "integrated_label": None,
                "units": "mmHg",
                "discrepancy": False,
            },
            "lvedv": {
                "panecho_value_or_prob": 100.0,
                "echoprime_value_or_prob": 100.0,
                "integrated_value": 100.0,
                "integrated_label": None,
                "units": "mL",
                "discrepancy": False,
            },
            "lvesv": {
                "panecho_value_or_prob": 40.0,
                "echoprime_value_or_prob": 40.0,
                "integrated_value": 40.0,
                "integrated_label": None,
                "units": "mL",
                "discrepancy": False,
            },
            "lvpwd": {
                "panecho_value_or_prob": 1.0,
                "echoprime_value_or_prob": 1.0,
                "integrated_value": 1.0,
                "integrated_label": None,
                "units": "cm",
                "discrepancy": False,
            },
            "lvidd": {
                "panecho_value_or_prob": 5.0,
                "echoprime_value_or_prob": 5.0,
                "integrated_value": 5.0,
                "integrated_label": None,
                "units": "cm",
                "discrepancy": False,
            },
            "avpkvel": {
                "panecho_value_or_prob": 2.0,
                "echoprime_value_or_prob": 2.0,
                "integrated_value": 2.0,
                "integrated_label": None,
                "units": "m/s",
                "discrepancy": False,
            },
            "tvpkgrad": {
                "panecho_value_or_prob": 36.0,
                "echoprime_value_or_prob": 36.0,
                "integrated_value": 36.0,
                "integrated_label": None,
                "units": "mmHg",
                "discrepancy": False,
            },
            "aortic_stenosis": {
                "panecho_value_or_prob": {
                    "Mild or Moderate": 0.20,
                    "None": 0.10,
                    "Severe": 0.70,
                },
                "echoprime_value_or_prob": 0.55,
                "integrated_value": 0.70,
                "integrated_label": "Severe",
                "units": None,
                "discrepancy": False,
            },
        },
        "overrides": overrides or {},
        "overrides_updated_at": "2026-03-10T10:00:00Z" if overrides else None,
    }


def _items_by_key(display_payload):
    items = {}
    for item in display_payload["mainMeasurements"]:
        items[item["key"]] = item
    for section in display_payload["Measurements"]:
        for item in section["items"]:
            items[item["key"]] = item
    return items


def test_build_combined_display_payload_builds_main_sections_and_derived_metrics():
    display_payload = build_combined_display_payload(_row_stub(_sample_combined_value_json()))
    items = _items_by_key(display_payload)

    assert [item["key"] for item in display_payload["mainMeasurements"]] == [
        "ejection_fraction",
        "gls",
        "pulmonary_artery_pressure",
    ]
    assert display_payload["hasMainMeasurements"] is True
    assert display_payload["hasMeasurements"] is True

    assert items["ejection_fraction"]["displayValue"] == "50.00-55.00"
    assert items["ejection_fraction"]["units"] == "%"
    assert items["gls"]["displayValue"] == "-20.00"
    assert items["pulmonary_artery_pressure"]["displayValue"] == "35.00-40.00"

    assert items["relative_wall_thickness"]["displayValue"] == "0.40"
    assert items["relative_wall_thickness"]["color"] == "green"
    assert items["cardiac_output"]["displayValue"] == "3.60"
    assert items["cardiac_output"]["color"] == "yellow"
    assert items["max_aortic_gradient"]["displayValue"] == "16.00"
    assert items["max_aortic_gradient"]["color"] == "yellow"

    assert items["trv"]["label"] == "Tricuspid Regurgitation Velocity (TRV)"
    assert items["trv"]["displayValue"] == "3.00"
    assert items["trv"]["editable"] is False
    assert items["trv"]["isOverridden"] is False
    assert items["trv"]["color"] == "yellow"

    assert items["tvpkgrad"]["label"] == "Tricuspid Regurgitation Peak Gradient (TRPG)"
    assert items["tvpkgrad"]["displayValue"] == "36.00"
    assert items["tvpkgrad"]["editable"] is True
    assert items["tvpkgrad"]["color"] == "yellow"

    assert items["aortic_stenosis"]["displayValue"] == "Severe"
    assert items["aortic_stenosis"]["probabilities"]["Severe"] == 0.70
    assert items["aortic_stenosis"]["color"] == "red"


def test_build_combined_display_payload_applies_tvpkgrad_override_and_recomputes_trv():
    overrides = {
        "tvpkgrad": {
            "value": 64.0,
            "edited_by": {"id": 1, "name": "Dr Test"},
            "edited_at": "2026-03-10T12:00:00Z",
        }
    }

    display_payload = build_combined_display_payload(
        _row_stub(_sample_combined_value_json(overrides=overrides))
    )
    items = _items_by_key(display_payload)

    assert items["tvpkgrad"]["displayValue"] == "64.00"
    assert items["tvpkgrad"]["rawValue"] == 64.0
    assert items["tvpkgrad"]["isOverridden"] is True
    assert items["tvpkgrad"]["color"] == "red"

    assert items["trv"]["displayValue"] == "4.00"
    assert items["trv"]["rawValue"] == 4.0
    assert items["trv"]["isOverridden"] is False
    assert items["trv"]["color"] == "red"


def test_build_combined_display_payload_recomputes_ef_when_volume_override_changes_math():
    overrides = {
        "lvesv": {
            "value": 70.0,
            "edited_by": {"id": 1, "name": "Dr Test"},
            "edited_at": "2026-03-10T12:00:00Z",
        }
    }

    display_payload = build_combined_display_payload(
        _row_stub(_sample_combined_value_json(overrides=overrides))
    )
    items = _items_by_key(display_payload)

    assert items["ejection_fraction"]["displayValue"] == "30.00"
    assert items["ejection_fraction"]["rawValue"] == 30.0
    assert items["ejection_fraction"]["color"] == "red"
    assert items["ejection_fraction"]["isOverridden"] is False


def test_build_combined_display_payload_omits_cardiac_output_when_heart_rate_is_zero():
    display_payload = build_combined_display_payload(
        _row_stub(_sample_combined_value_json(), heart_rate_bpm=0.0)
    )
    items = _items_by_key(display_payload)

    assert "cardiac_output" not in items


def test_build_combined_display_payload_defaults_missing_discrepancy_to_false():
    value_json = _sample_combined_value_json()
    value_json["integrated_tasks"]["gls"].pop("discrepancy")
    value_json["integrated_tasks"]["aortic_stenosis"].pop("discrepancy")

    display_payload = build_combined_display_payload(_row_stub(value_json))
    items = _items_by_key(display_payload)

    assert items["gls"]["discrepancy"] is False
    assert items["aortic_stenosis"]["discrepancy"] is False
