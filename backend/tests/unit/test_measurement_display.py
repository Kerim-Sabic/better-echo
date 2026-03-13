from app.helpers.clinical.measurement_display import (
    get_color_for_label,
    get_color_for_numeric,
    get_display_name,
    get_edit_options,
    get_edit_type,
    get_main_measurement_order,
    get_range_status,
    get_section_name,
    is_editable_task,
    is_indexable_task,
    is_main_measurement,
    is_range_display_task,
)
from app.helpers.clinical.measurement_ranges import get_range_status as legacy_get_range_status


def test_get_display_metadata_for_known_tasks():
    assert get_display_name("ejection_fraction") == "Ejection Fraction (EF)"
    assert get_section_name("aortic_stenosis") == "Valves"
    assert is_main_measurement("gls") is True
    assert get_main_measurement_order("gls") == 2
    assert is_range_display_task("ejection_fraction") is True
    assert is_indexable_task("lvedv") is True
    assert get_display_name("trv") == "Tricuspid Regurgitation Velocity (TRV)"
    assert get_display_name("tvpkgrad") == "Tricuspid Regurgitation Peak Gradient (TRPG)"


def test_get_edit_metadata_for_categorical_and_derived_numeric_tasks():
    assert get_edit_type("aortic_stenosis") == "label"
    assert get_edit_type("cardiac_output") == "value"
    assert is_editable_task("aortic_stenosis") is True
    assert is_editable_task("cardiac_output") is False


def test_get_edit_options_returns_catalog_values_and_current_label():
    options = get_edit_options("pacemaker", current_label="Custom Device")

    assert options == ["Absent", "Present", "Custom Device"]


def test_get_range_status_handles_sex_specific_numeric_band():
    assert get_range_status("ejection_fraction", 60.0, "male") == "normal"
    assert get_range_status("ejection_fraction", 45.0, "male") == "borderline"
    assert get_range_status("ejection_fraction", 35.0, "male") == "abnormal"


def test_get_range_status_handles_unisex_numeric_band():
    assert get_range_status("pulmonary_artery_pressure", 34.0, None) == "normal"
    assert get_range_status("pulmonary_artery_pressure", 36.0, None) == "borderline"
    assert get_range_status("pulmonary_artery_pressure", 41.0, None) == "abnormal"


def test_get_range_status_derives_unisex_fallback_when_sex_missing():
    assert get_range_status("lvidd", 5.3, None) == "normal"
    assert get_range_status("lvidd", 6.3, None) == "abnormal"


def test_get_color_for_numeric_maps_range_status_to_ui_colors():
    assert get_color_for_numeric("ejection_fraction", 60.0, "female") == "green"
    assert get_color_for_numeric("ejection_fraction", 45.0, "female") == "yellow"
    assert get_color_for_numeric("ejection_fraction", 35.0, "female") == "red"


def test_get_color_for_numeric_falls_back_to_yellow_when_outside_known_union():
    assert get_color_for_numeric("ejection_fraction", 90.0, "male") == "yellow"


def test_get_color_for_label_maps_category_buckets():
    assert get_color_for_label("aortic_stenosis", "None") == "green"
    assert get_color_for_label("aortic_stenosis", "Mild") == "yellow"
    assert get_color_for_label("aortic_stenosis", "Moderate") == "red"
    assert get_color_for_label("aortic_stenosis", "Unmapped") is None


def test_legacy_measurement_ranges_wrapper_delegates_to_new_helper():
    assert legacy_get_range_status("gls", -20.0, "male") == "normal"
    assert legacy_get_range_status("gls", -16.5, "male") == "borderline"
    assert legacy_get_range_status("gls", -15.0, "male") == "abnormal"
