from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
)
from app.helpers.clinical import overlay_display
from app.helpers.clinical.overlay_display import (
    current_doppler_overlay_keys,
    current_linear_overlay_keys,
    overlay_display_metadata,
)


def _display_for(*, overlay_type, overlay_key, kind, measurement=None):
    return overlay_display_metadata(
        doc={"kind": kind},
        overlay_type=overlay_type,
        overlay_key=overlay_key,
        measurement=measurement or {},
    )


def test_linear_overlay_display_map_covers_current_keys():
    for overlay_key in current_linear_overlay_keys():
        display = _display_for(
            overlay_type=LINEAR_MEASUREMENT_OVERLAY_TYPE,
            overlay_key=overlay_key,
            kind=LINEAR_MEASUREMENT_OVERLAY_KIND,
            measurement={"measurement_value": 3.57, "measurement_units": "cm"},
        )

        assert display["display_name"] != overlay_key
        assert display["family_label"] == "2D Linear"
        assert display["summary_value_label"] == "Max 3.57 cm"
        assert display["summary_value_kind"] == "max_length_cm"


def test_overlay_display_uses_catalog_instead_of_clinical_name_maps():
    assert not hasattr(overlay_display, "LINEAR_OVERLAY_CATALOG_KEYS")
    assert not hasattr(overlay_display, "LINEAR_OVERLAY_DISPLAY_NAMES")
    assert not hasattr(overlay_display, "DOPPLER_OVERLAY_CATALOG_KEYS")
    assert not hasattr(overlay_display, "DOPPLER_OVERLAY_DISPLAY_NAMES")


def test_doppler_overlay_display_map_covers_current_keys():
    for overlay_key in current_doppler_overlay_keys():
        display = _display_for(
            overlay_type=DOPPLER_MEASUREMENT_OVERLAY_TYPE,
            overlay_key=overlay_key,
            kind=DOPPLER_MEASUREMENT_OVERLAY_KIND,
            measurement={"measurement_value": 102.4, "measurement_units": "cm/s"},
        )

        assert display["display_name"] != overlay_key
        assert display["family_label"] == "Doppler"
        assert display["summary_value_label"] == "102.4 cm/s"
        assert display["summary_value_kind"] == "measurement_value"


def test_lv_overlay_display_metadata():
    display = _display_for(
        overlay_type=LV_SEGMENTATION_OVERLAY_TYPE,
        overlay_key=None,
        kind=LV_SEGMENTATION_OVERLAY_KIND,
    )

    assert display == {
        "display_name": "LV Segmentation",
        "family_label": "LV Segmentation",
        "summary_value_label": None,
        "summary_value_kind": None,
    }
