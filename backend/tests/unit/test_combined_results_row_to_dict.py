from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_payload


def test_build_combined_sections_payload_adds_edit_baselines_and_slims_overrides():
    payload = build_combined_sections_payload(
        {
            "integrated_tasks": {
                "ejection_fraction": {
                    "integrated_value": 58.4,
                    "integrated_label": None,
                    "units": "%",
                },
                "aortic_stenosis": {
                    "integrated_value": 0.74,
                    "integrated_label": "Mild",
                    "units": None,
                },
                "trv": {
                    "integrated_value": 2.45,
                    "integrated_label": None,
                    "units": "m/s",
                },
            },
            "overrides": {
                "ejection_fraction": {
                    "value": 60.0,
                    "edited_by": {"id": 7, "name": "Dr Test"},
                    "edited_at": "2026-03-10T12:34:56Z",
                },
                "aortic_stenosis": {
                    "label": "Moderate",
                    "edited_by": {"id": 7, "name": "Dr Test"},
                    "edited_at": "2026-03-10T12:34:56Z",
                },
            },
            "overrides_updated_at": "2026-03-10T12:34:56Z",
        }
    )

    assert payload["edit_baselines"] == {
        "ejection_fraction": {"rawValue": 58.4},
        "aortic_stenosis": {"label": "Mild"},
    }
    assert "trv" not in payload["edit_baselines"]
    assert payload["overrides"] == {
        "ejection_fraction": {"value": 60.0},
        "aortic_stenosis": {"label": "Moderate"},
    }
    assert payload["overrides_updated_at"] == "2026-03-10T12:34:56Z"


def test_build_combined_sections_payload_handles_legacy_raw_payload():
    payload = build_combined_sections_payload(
        {
            "ejection_fraction": {
                "integrated_value": 52.5,
                "integrated_label": None,
                "units": "%",
            }
        }
    )

    assert payload["integrated_tasks"]["ejection_fraction"]["integrated_value"] == 52.5
    assert payload["edit_baselines"] == {"ejection_fraction": {"rawValue": 52.5}}
    assert payload["overrides"] == {}
    assert payload["overrides_updated_at"] is None
