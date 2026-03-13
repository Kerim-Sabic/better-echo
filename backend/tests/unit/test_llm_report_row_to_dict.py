from types import SimpleNamespace

from app.helpers.row_to_dict.llm_report_row_to_dict import build_llm_report_from_row


def test_build_llm_report_from_row_returns_empty_payload_for_missing_row():
    assert build_llm_report_from_row(None) == {}


def test_build_llm_report_from_row_adds_display_sections():
    row = SimpleNamespace(
        value_json={
            "report_md": "# Echo Summary\n\n## Findings\nNormal LV function.\n\n## Impression\nNo major abnormality.",
            "diagnoses_json": [{"label": "Normal study"}],
            "report_generated_at": "2026-03-13T10:00:00Z",
        }
    )

    payload = build_llm_report_from_row(row)

    assert payload["report_generated_at"] == "2026-03-13T10:00:00Z"
    assert payload["diagnoses_json"][0]["label"] == "Normal study"
    assert payload["display"]["mainTitle"] == "Echo Summary"
    assert payload["display"]["sections"] == [
        {"title": "Findings", "body": "Normal LV function."},
        {"title": "Impression", "body": "No major abnormality."},
    ]
