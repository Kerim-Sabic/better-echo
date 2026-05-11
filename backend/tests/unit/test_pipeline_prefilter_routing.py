from uuid import uuid4

from app.database_models.instances import Instance
from app.database_models.series import Series
from app.helpers.pipeline.pipeline_routing import build_prefilter_routing_map


def test_prefilter_routes_spectral_before_classifier_and_sets_deterministic_view(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        suffix = uuid4().hex[:8]
        series = Series(
            series_uid=f"series-{suffix}",
            modality="US",
            description="Test Series",
            series_orthanc_id=f"orthanc-series-{suffix}",
            study_id=seeded_study["study_id"],
        )
        spectral = Instance(
            sop_instance_uid=f"sop-spectral-{suffix}",
            file_path=f"/tmp/{suffix}_spectral.dcm",
            instance_orthanc_id=f"orthanc-spectral-{suffix}",
            instance_number="11",
            predicted_view=None,
            predicted_view_confidence=None,
            series=series,
        )
        non_spectral = Instance(
            sop_instance_uid=f"sop-a4c-{suffix}",
            file_path=f"/tmp/{suffix}_a4c.dcm",
            instance_orthanc_id=f"orthanc-a4c-{suffix}",
            instance_number="12",
            predicted_view="A4C",
            predicted_view_confidence=0.99,
            series=series,
        )
        db.add_all([series, spectral, non_spectral])
        db.commit()
        db.refresh(spectral)
        db.refresh(non_spectral)

        # Part 1. Keep compatibility deterministic in unit test.
        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing._detect_hard_compatibility",
            lambda _instance: (True, None),
        )

        # Part 2. Mark only one file as spectral Doppler.
        def _inspect(file_path):
            if "spectral" in file_path:
                return {
                    "is_doppler_candidate": True,
                    "details": {
                        "spectral_subtype": "pw",
                        "doppler_region": {"y0": 100, "reference_line": 10, "physical_delta_y": 0.1},
                    },
                }
            return {"is_doppler_candidate": False, "details": {}}

        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing.inspect_doppler_tags",
            _inspect,
        )

        classifier_calls = {"paths": []}

        def _classify(study_uid, db_session, include_file_paths=None):
            classifier_calls["paths"] = list(include_file_paths or [])
            return {}

        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing.classify_views_for_study",
            _classify,
        )

        payload = build_prefilter_routing_map(
            db=db,
            study_uid=seeded_study["study_uid"],
            confidence_min=0.75,
        )

        # Part 3. Secondary-analysis classifier should receive only non-spectral file paths.
        assert classifier_calls["paths"] == [non_spectral.file_path]

        # Part 4. Spectral instance should be deterministic and confidence=1.0.
        db.refresh(spectral)
        assert spectral.predicted_view == "SPECTRAL_DOPPLER_PW"
        assert float(spectral.predicted_view_confidence) == 1.0

        by_uid = {item["sop_instance_uid"]: item for item in payload["instances"]}
        spectral_decision = by_uid[spectral.sop_instance_uid]
        assert spectral_decision["predicted_view"] == "SPECTRAL_DOPPLER_PW"
        assert float(spectral_decision["predicted_view_confidence"]) == 1.0
        assert "SPECTRAL_DOPPLER_TAG_ROUTED" in spectral_decision["combined_skip_reasons"]

        assert payload["summary"]["doppler_routed_instances"] == 1
    finally:
        db.close()


def test_prefilter_unloads_secondary_classifier_under_stage_policy(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        suffix = uuid4().hex[:8]
        series = Series(
            series_uid=f"series-unload-{suffix}",
            modality="US",
            description="Test Series",
            series_orthanc_id=f"orthanc-series-unload-{suffix}",
            study_id=seeded_study["study_id"],
        )
        instance = Instance(
            sop_instance_uid=f"sop-unload-{suffix}",
            file_path=f"/tmp/{suffix}_a4c.dcm",
            instance_orthanc_id=f"orthanc-unload-{suffix}",
            instance_number="12",
            predicted_view="A4C",
            predicted_view_confidence=0.99,
            series=series,
        )
        db.add_all([series, instance])
        db.commit()

        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing._detect_hard_compatibility",
            lambda _instance: (True, None),
        )
        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing.inspect_doppler_tags",
            lambda _file_path: {"is_doppler_candidate": False, "details": {}},
        )
        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing.classify_views_for_study",
            lambda *_args, **_kwargs: {},
        )
        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing.settings.PIPELINE_UNLOAD_POLICY",
            "stage",
        )
        unload_calls = {"count": 0}
        monkeypatch.setattr(
            "app.helpers.pipeline.pipeline_routing.unload_secondary_analysis_model",
            lambda: unload_calls.__setitem__("count", unload_calls["count"] + 1),
        )

        build_prefilter_routing_map(
            db=db,
            study_uid=seeded_study["study_uid"],
            confidence_min=0.75,
        )

        assert unload_calls["count"] == 1
    finally:
        db.close()
