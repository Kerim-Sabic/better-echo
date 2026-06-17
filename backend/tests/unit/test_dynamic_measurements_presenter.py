from app.services.results import build_dynamic_measurements_payload


def test_build_dynamic_measurements_payload_normalizes_and_whitelists_fields():
    payload = build_dynamic_measurements_payload(
        {
            "instances": [
                {
                    "sop_instance_uid": "1.2.3",
                    "instance_number": 17,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": "0.99",
                    "results": [
                        {
                            "task": "measurement_linear",
                            "status": "DONE",
                            "weights": "rv_base",
                            "output_path": None,
                            "overlay": {
                                "overlay_type": "linear_measurement",
                                "overlay_key": "rv_base",
                                "kind": "linear_measurement_overlay",
                                "available": True,
                                "metric_name": "rv_base",
                                "metric_value": 3.4,
                                "units": "cm",
                                "unexpected_overlay": "drop-me",
                            },
                            "unexpected": "drop-me",
                        }
                    ],
                    "unexpected_instance": "drop-me",
                }
            ],
            "meta": {
                "dynamic_runs": 1,
                "measurements_2d_runs": 2,
                "measurement_spectral_runs": 0,
                "skipped_instances": 0,
                "error_count": 0,
                "unexpected": 99,
            },
            "unexpected_top_level": True,
        }
    )

    instance = payload["instances"][0]
    assert instance == {
        "sop_instance_uid": "1.2.3",
        "instance_number": "17",
        "predicted_view": "A4C",
        "predicted_view_confidence": 0.99,
        "results": [
            {
                "task": "measurement_linear",
                "ui_label": "rv_base",
                "status": "DONE",
                "output_path": None,
                "output_kind": None,
                "message": None,
                "overlay": {
                    "overlay_type": "linear_measurement",
                    "overlay_key": "rv_base",
                    "kind": "linear_measurement_overlay",
                    "available": True,
                    "metric_name": "rv_base",
                    "metric_value": 3.4,
                    "units": "cm",
                },
            }
        ],
    }
    assert payload["meta"] == {
        "dynamic_runs": 1,
        "measurements_2d_runs": 2,
        "measurement_spectral_runs": 0,
        "skipped_instances": 0,
        "error_count": 0,
    }


def test_build_dynamic_measurements_payload_falls_back_to_task_label_and_image_kind():
    payload = build_dynamic_measurements_payload(
        {
            "instances": [
                {
                    "sop_instance_uid": "1.2.840",
                    "results": [
                        {
                            "task": "measurement_spectral",
                            "status": "DONE",
                            "output_path": "measurement_spectral/study/lvotvmax.jpg",
                        }
                    ],
                }
            ]
        }
    )

    result = payload["instances"][0]["results"][0]
    assert result["ui_label"] == "Doppler Measurements"
    assert result["output_kind"] == "image"


def test_build_dynamic_measurements_payload_preserves_skipped_message_and_handles_missing_meta():
    payload = build_dynamic_measurements_payload(
        {
            "instances": [
                {
                    "sop_instance_uid": "skip-1",
                    "instance_number": None,
                    "results": [
                        {
                            "task": None,
                            "status": "SKIPPED",
                            "message": "Instance not eligible for dynamic/measurements",
                        }
                    ],
                }
            ]
        }
    )

    result = payload["instances"][0]["results"][0]
    assert result["status"] == "SKIPPED"
    assert result["message"] == "Instance not eligible for dynamic/measurements"
    assert "meta" not in payload

