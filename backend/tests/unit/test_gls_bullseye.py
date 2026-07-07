from app.services.results.gls_bullseye import (
    ASE_17_SEGMENTS,
    build_gls_bullseye_document,
    build_gls_trend_points,
)


def test_gls_bullseye_uses_global_gls_without_fabricating_segments():
    document = build_gls_bullseye_document(
        integrated_tasks={
            "gls": {
                "integrated_value": -20.0,
                "units": "%",
            }
        },
        overrides=None,
        patient_sex="M",
    )

    assert document["schema_version"] == 1
    assert document["data_completeness"] == "global_only"
    assert document["global"]["value"] == -20.0
    assert document["global"]["status"] == "normal"
    assert document["global"]["measured"] is True
    assert document["measured_segment_count"] == 0
    assert len(document["segments"]) == len(ASE_17_SEGMENTS)
    assert all(segment["measured"] is False for segment in document["segments"])
    assert "not individually measured" in document["notes"]


def test_gls_bullseye_applies_override_and_real_segmental_source():
    document = build_gls_bullseye_document(
        integrated_tasks={
            "gls": {
                "integrated_value": -20.0,
                "units": "%",
            }
        },
        overrides={"gls": {"value": -15.0}},
        patient_sex="M",
        segmental_source={
            "segments": {
                "1": -21.0,
                "2.5": -18.0,
                "99": -18.0,
                "bad": -18.0,
            }
        },
    )

    measured_segments = [
        segment for segment in document["segments"] if segment["measured"]
    ]

    assert document["data_completeness"] == "segmental"
    assert document["global"]["value"] == -15.0
    assert document["global"]["status"] == "abnormal"
    assert document["measured_segment_count"] == 1
    assert measured_segments == [
        {
            **ASE_17_SEGMENTS[0],
            "measured": True,
            "value": -21.0,
            "status": "normal",
            "color": "green",
        }
    ]


def test_gls_trend_points_order_by_study_date_and_use_overrides():
    trend = build_gls_trend_points(
        [
            {
                "study_uid": "study-new",
                "study_date": "20260301",
                "uploaded_at": "2026-03-01T10:00:00",
                "integrated_tasks": {"gls": {"integrated_value": -20.0}},
                "overrides": {"gls": {"value": -19.0}},
                "patient_sex": "M",
            },
            {
                "study_uid": "study-old",
                "study_date": "20250101",
                "uploaded_at": "2025-01-01T10:00:00",
                "integrated_tasks": {"gls": {"integrated_value": -16.5}},
                "overrides": {},
                "patient_sex": "M",
            },
            {
                "study_uid": "study-missing",
                "study_date": "20240101",
                "uploaded_at": "2024-01-01T10:00:00",
                "integrated_tasks": {},
                "overrides": {},
                "patient_sex": "M",
            },
        ]
    )

    assert trend == [
        {
            "study_uid": "study-old",
            "study_date": "20250101",
            "label": "2025-01-01",
            "value": -16.5,
            "status": "borderline",
        },
        {
            "study_uid": "study-new",
            "study_date": "20260301",
            "label": "2026-03-01",
            "value": -19.0,
            "status": "normal",
        },
    ]
