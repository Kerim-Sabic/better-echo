from typing import Any, Dict, List, Tuple, Optional
import json, pathlib, logging

logger = logging.getLogger(__name__)

# Load configuration file once
CONFIG_FILE = pathlib.Path(__file__).parent.parent / "configs" / "thresholds.config.json"
try:
    with open(CONFIG_FILE) as f:
        TASK_CONFIG = json.load(f)
except Exception as e:
    TASK_CONFIG = {}
    logger.warning(f"[combine_results] Could not load config: {e}")

# Part 1. PanEcho task metadata (class orders, positive labels, units)
# These control how we interpret raw PanEcho outputs
PANECHO_MULTICLASS_LABELS = {
    "LVSize": ["Mildly Increased", "Moderately|Severely Increased", "Normal"],
    "LVSystolicFunction": ["Mildly Decreased", "Moderately|Severely Decreased", "Normal|Hyperdynamic"],
    "LVDiastolicFunction": ["Mild|Indeterminate", "Moderate|Severe", "Normal"],
    "RVSize": ["Mildly Increased", "Moderately|Severely Increased", "Normal"],
    "LASize": ["Mildly Dilated", "Moderately|Severely Dilated", "Normal"],
    "AVStenosis": ["Mild|Moderate", "None", "Severe"],
    "AVRegurg": ["Mild", "Moderate|Severe", "None|Trace"],
    "MVRegurgitation": ["Mild", "Moderate|Severe", "None|Trace"],
    "TVRegurgitation": ["Mild", "Moderate|Severe", "None|Trace"],
}
PANECHO_BINARY_POSITIVE_LABEL = {
    "pericardial-effusion": "Present",
    "LVWallThickness-increased-any": "Increased",
    "LVWallThickness-increased-modsev": "Moderately|Severely Increased",
    "LVWallMotionAbnormalities": "Present",   # PanEcho may emit scalar p(Present)
    "RVSystolicFunction": "Decreased",        # scalar p(Decreased)
    "RASize": "Dilated",                      # scalar p(Dilated)
    "AVStructure": "Bicuspid",
    "LVOT20mmHg": "Present",
    "MVStenosis": "Mild|Moderate|Severe",
    "RAP-8-or-higher": "Present",
}
PANECHO_REGRESSION_UNITS = {
    "EF": "%", "GLS": "%", "LVEDV": "cm^3", "LVESV": "cm^3", "LVSV": "cm^3",
    "IVSd": "cm", "LVPWd": "cm", "LVIDs": "cm", "LVIDd": "cm", "LVOTDiam": "cm",
    "E|EAvg": None, "RVSP": "mmHg", "RVIDd": "cm", "TAPSE": "cm", "RVSVel": "cm/s",
    "LAIDs2D": "cm", "LAVol": "cm^3", "RADimensionM-L(cm)": "cm", "AVPkVel(m|s)": "m/s",
    "TVPkGrad": "mmHg", "AORoot": "cm",
}
PANECHO_POSITIVE_CLASSES = {
    "MVRegurgitation": ["Moderate|Severe"],
    "TVRegurgitation": ["Moderate|Severe"],
    "AVRegurg": ["Moderate|Severe"],
    "AVStenosis": ["Severe"],
}

def _panecho_positive_probability(
        task_name: str,
        panecho_normalized: Dict[str, Any]
) -> Optional[float]:
    """
    Returns the probability of a 'clinically significant' finding from PanEcho:
    - For binary tasks: just use the probability_present
    - For multiclass tasks: sum probabilities of 'positive' classes defined in PANECHO_POSITIVE_CLASSES
    If no positive classes are defined, fall back to the existing 'abnormal' probability (1 - p(normal))
    """
    node = panecho_normalized.get(task_name)
    if not node:
        return None
    
    kind = node.get("kind")
    if kind == "binary":
        return node.get("probability_present")
    
    if kind == "multiclass":
        class_probs = node.get("probs") or {}
        positive_labels = PANECHO_POSITIVE_CLASSES.get(task_name)
        if positive_labels:
            # Sum up the probabilities for the positive labels
            return float(sum(class_probs.get(label, 0.0) for label in positive_labels))
        else:
            # Fallback: abnormal = 1 - probability of the normal class (existing behaviour)
            normal_class_by_task = {
                "LVSize": "Normal",
                "LVSystolicFunction": "Normal|Hyperdynamic",
                "LVDiastolicFunction": "Normal",
                "RVSize": "Normal",
                "LASize": "Normal",
                "AVStenosis": "None",
                "AVRegurg": "None|Trace",
                "MVRegurgitation": "None|Trace",
                "TVRegurgitation": "None|Trace",
            }
            normal_label = normal_class_by_task.get(task_name)
            if normal_label:
                return 1.0 - float(class_probs.get(normal_label, 0.0))
            return None
    #  Unknown or raw shape
    return None

# Part 2. Tiny helper utilities (used by normalizers and comparison)
def _is_sequence(value: Any) -> bool:
    return isinstance(value, (list, tuple))

def _index_of_max(values: List[float]) -> int:
    return max(range(len(values)), key=lambda i: float(values[i]))

def _softmax_probs_to_labeled_result(probabilities: List[float], class_labels: List[str]) -> Dict[str, Any]:
    # 2.1 Normalize to a proper distribution and pick top class
    total = float(sum(probabilities)) or 1.0
    normalized = [float(p) / total for p in probabilities]
    top_index = _index_of_max(normalized)
    return {
        "label": class_labels[top_index],
        "confidence": normalized[top_index],
        "probs": {label: normalized[i] for i, label in enumerate(class_labels)},
        "classes": class_labels,
        "kind": "multiclass",
    }

def _to_float_or_none(value: Any) -> Optional[float]:
    # 2.2 Safe float conversion (returns None on failure)
    try:
        return float(value)
    except Exception:
        return None
    
# Part 3: Normalization of raw model outputs into a consistent schema
def normalize_panecho_predictions(panecho_raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    3.1 PanEcho normalizer
        -regression -> {"value", "units", "kind":"regression"} (GLS value flipped to negative)
        -binary     -> {"probability_present", "positive_label", "kind":"binary"}
        -multiclass -> {"label", "confidence", "probs", "classes", "kind":"multiclass"}
    """
    normalized: Dict[str, Any] = {}
    for task_name, raw_value in panecho_raw.items():
        # 3.1.1 Multiclass heads (softmax arrays)
        if task_name in PANECHO_MULTICLASS_LABELS and _is_sequence(raw_value):
            normalized[task_name] = _softmax_probs_to_labeled_result(list(raw_value), PANECHO_MULTICLASS_LABELS[task_name])
            continue

        # 3.1.2 Binary-like heads (scalar probability or [p(absent), p(present)])
        if task_name in PANECHO_BINARY_POSITIVE_LABEL:
            if _is_sequence(raw_value) and len(raw_value) >= 2:
                probability_present = _to_float_or_none(raw_value[1])
            else:
                probability_present = _to_float_or_none(raw_value)
            normalized[task_name] = {"probability_present": probability_present
                                     ,"positive_label": PANECHO_BINARY_POSITIVE_LABEL[task_name]
                                     ,"kind": "binary"}
            continue

        # 3.1.3. Regression heads (named numeric values with known units)
        if task_name in PANECHO_REGRESSION_UNITS:
            numeric_value = _to_float_or_none(raw_value)
            # GLS convention: clinical sign is negative; model outputs positive -> flip sign
            if task_name == "GLS" and numeric_value is not None:
                numeric_value = -numeric_value
            normalized[task_name] = {"value": numeric_value
                                     ,"units": PANECHO_REGRESSION_UNITS[task_name]
                                     ,"kind": "regression"}
            continue

        #3.1.4. Fallback passthrough (unknown shape)
        normalized[task_name] = {"raw": raw_value, "kind": "unknown"}

    return normalized

def normalize_echoprime_predictions(echoprime_raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    3.2 EchoPrime normalizer (no task map available)
    - 0..1 -> {"probability_present, "kind":"binary_like"}
    - else -> {"value", "kind":"regression_like"}
    """
    normalized: Dict[str, Any] = {}
    for task_name, raw_value in echoprime_raw.items():
        numeric_value = _to_float_or_none(raw_value)
        if numeric_value is None:
            normalized[task_name] = {"raw": raw_value
                                     ,"kind": "unknown"}
        elif 0.0 <= numeric_value <= 1.0:
            normalized[task_name] = {"probability_present": numeric_value
                                     ,"kind": "binary_like"}
        else:
            normalized[task_name] = {"value": numeric_value
                                     ,"kind": "regression_like"}
    
    return normalized

# Part 4. Agreement helpers (convert PanEcho to abnormal probability; gap flags)
def _panecho_abnormal_probability(task_name: str, panecho_normalized: Dict[str, Any]) -> Optional[float]:
    """
    4.1 For PanEcho:
        - Multiclass: abnormal probability = 1 - p(normal_class)
        - Binary: abnormal probability = p_present
    """
    node = panecho_normalized.get(task_name)
    if not node:
        return None
    if node.get("kind") == "binary":
        return node.get("probability_present")
    if node.get("kind") == "multiclass":
        class_probabilities: Dict[str, float] = node.get("probs") or {}
        # 4.1.1 Map each multiclass task to its "normal" label
        normal_class_by_task = {
            "LVSize": "Normal",
            "LVSystolicFunction": "Normal|Hyperdynamic",
            "LVDiastolicFunction": "Normal",
            "RVSize": "Normal",
            "LASize": "Normal",
            "AVStenosis": "None",
            "AVRegurg": "None|Trace",
            "MVRegurgitation": "None|Trace",
            "TVRegurgitation": "None|Trace",
        }
        normal_label = normal_class_by_task.get(task_name)
        if not normal_label:
            return None
        probability_normal = class_probabilities.get(normal_label)
        if probability_normal is None:
            return None
        return 1.0 - probability_normal
    return None

def _has_large_gap(value_a: Optional[float], value_b: Optional[float], threshold: float) -> bool:
    # 4.2 Simple absolute-difference threshold (None-safe)
    return value_a is not None and value_b is not None and abs(value_b - value_a) >= threshold

# Part 5. Main combiner - orchestrates normalization, comparison, and packaging
def combine_results(
        study_uid: str,
        panecho_predictions: Dict[str, Any],
        echoprime_predictions: Dict[str, Any],
        *,
        ef_gap_threshold_points: float = 8.0,
        pap_vs_rvsp_gap_threshold_mmhg: float = 8.0,
        probability_gap_threshold: float = 0.40
) -> Dict[str, Any]:
    # 5.1 Normalize both models into a shared schema
    panecho_normalized = normalize_panecho_predictions(panecho_predictions)
    echoprime_normalized = normalize_echoprime_predictions(echoprime_predictions)

    integrated_tasks = {}

    for task_key, cfg in TASK_CONFIG.items():
        panecho_name = cfg.get("panecho_name")
        echoprime_name = cfg.get("echoprime_name")

        # Fetch PanEcho probability or value
        pan_prob = None
        pan_val = None
        if panecho_name:
            node = panecho_normalized.get(panecho_name)
            if node:
                if node["kind"] in ("binary", "binary_like"): # but note: PanEcho uses "binary"
                    pan_prob = _panecho_positive_probability(panecho_name, panecho_normalized)
                elif node["kind"] == "multiclass":
                    pan_prob = _panecho_positive_probability(panecho_name, panecho_normalized)
                elif node["kind"] in ("regression", "regression_like"):
                    pan_val = node.get("value")

        # Fetch EchoPrime probability or value
        echo_prob = None
        echo_val = None
        if echoprime_name:
            node = echoprime_normalized.get(echoprime_name)
            if node:
                if node["kind"] in ("binary", "binary_like"):
                    echo_prob = node.get("probability_present")
                elif node["kind"] in ("regression", "regression_like"):
                    echo_val = node.get("value")

        # Apply thresholds
        panecho_pass = (pan_prob is not None and cfg.get("panecho_threshold") is not None and pan_prob >= cfg["panecho_threshold"])
        echoprime_pass = (echo_prob is not None and cfg.get("echoprime_threshold") is not None and echo_prob >= cfg["echoprime_threshold"])
    
        # Decide integrated value / label based on combine_rule
        rule = cfg.get("combine_rule")
        integrated_label = None
        integrated_value = None
        sources = []

        if rule == "average_value":
            # For continuous metrics like EF and PAP
            if pan_val is not None and echo_val is not None:
                integrated_value = (pan_val + echo_val) / 2.0
                sources = ["PanEcho", "EchoPrime"]
            elif pan_val is not None:
                integrated_value = pan_val
                sources = ["PanEcho"]
            elif echo_val is not None:
                integrated_value = echo_val
                sources = ["EchoPrime"]
            # Optionally: check discrepancy threshold here
        elif rule.startswith("prefer_model"):
            # Example: "prefer_model:PanEcho" or "prefer_model:EchoPrime"
            preferred_model = rule.split(":")[1]
            # Use probability-based decision
            if preferred_model == "PanEcho" and panecho_pass:
                integrated_label = "Present"
                sources.append("PanEcho")
            elif preferred_model == "EchoPrime" and echoprime_pass:
                integrated_label = "Present"
                sources.append("EchoPrime")
            # fallback: negative
            if not integrated_label:
                integrated_label = "Absent"
        elif rule == "positive_if_either_positive":
            if panecho_pass or echoprime_pass:
                integrated_label = "Present"
                if panecho_pass:
                    sources.append("PanEcho")
                if echoprime_pass:
                    sources.append("EchoPrime")
            else:
                integrated_label = "Absent"
        elif rule == "agree_if_both_positive":
            if panecho_pass and echoprime_pass:
                integrated_label = "Present"
                sources = ["PanEcho", "EchoPrime"]
            else:
                integrated_label = "Absent"
        elif rule == "prefer_panecho_if_echoprime_zero":
            # If EchoPrime probability is zero or below its threshold,
            # but PanEcho is extremely confident, call it Present
            echo_is_zero_or_below = (echo_prob is None or echo_prob < cfg.get("echoprime_threshold", 0.0))
            # PanEcho must exceed its high threshold (panecho_threshold)
            if echo_is_zero_or_below and panecho_pass:
                integrated_label = "Present"
                sources.append("PanEcho")
            else:
                # Otherwise, if Echoprime passes its own threshold, call Present
                # (so we still respect EchoPrime positives)
                if echoprime_pass:
                    integrated_label = "Present"
                    sources.append("EchoPrime")
                else:
                    integrated_label = "Absent"
        
        integrated_tasks[task_key] = {
            "panecho_value_or_prob": pan_val if pan_val is not None else pan_prob,
            "echoprime_value_or_prob": echo_val if echo_val is not None else echo_prob,
            "integrated_value": integrated_value,
            "integrated_label": integrated_label,
            "units": cfg.get("units"),
            "sources": sources,
            # Optionally: discrepancy flags (e.g., if one says present, other says absent)
            "discrepancy": (panecho_pass != echoprime_pass) if (pan_prob is not None and echo_prob is not None) else None,
        }

    # 5.2 Pull shared continuos metrics (EF, PAP/RVSP) for range comparison
    panecho_ef_percent = panecho_normalized.get("EF", {}).get("value")
    echoprime_ef_percent = echoprime_normalized.get("ejection_fraction", {}).get("value")
    
    panecho_rvsp_mmhg = panecho_normalized.get("RVSP", {}).get("value")
    echoprime_pap_mmhg = echoprime_normalized.get("pulmonary_artery_pressure_continuous", {}).get("value")

    comparison_ranges: Dict[str, Dict[str, Any]] = {}
    alert_flags: List[str] = []

    # 5.3 EF range (PanEcho -> EchoPrime) + disagreement flag
    comparison_ranges["EF_percent"] = {
        "from_panecho": panecho_ef_percent,
        "to_echoprime": echoprime_ef_percent,
        "range": f"{panecho_ef_percent} → {echoprime_ef_percent}" if (panecho_ef_percent is not None and echoprime_ef_percent is not None) else None,
        "units": "%",
        "flag_large_gap": _has_large_gap(panecho_ef_percent, echoprime_ef_percent, ef_gap_threshold_points)
    }
    if comparison_ranges["EF_percent"]["flag_large_gap"]:
        alert_flags.append("ef_disagreement")
    
    # 5.4 Pulmonary pressure comparison: PanEcho RVSP vs EchoPrime PAP (approximate)
    comparison_ranges["pulmonary_pressure_mmHg__RVSP_vs_PAP"] = {
        "from_panecho_RVSP": panecho_rvsp_mmhg,
        "to_echoprime_PAP": echoprime_pap_mmhg,
        "range": f"{panecho_rvsp_mmhg} → {echoprime_pap_mmhg}" if (panecho_rvsp_mmhg is not None and echoprime_pap_mmhg is not None) else None,
        "units": "mmHg",
        "note": "Comparing PanEcho RVSP vs EchoPrime PAP (approximate).",
        "flag_large_gap": _has_large_gap(panecho_rvsp_mmhg, echoprime_pap_mmhg, pap_vs_rvsp_gap_threshold_mmhg),
    }
    if comparison_ranges["pulmonary_pressure_mmHg__RVSP_vs_PAP"]["flag_large_gap"]:
        alert_flags.append("pap_rvsp_disagreement")
    
    # 5.5 Probability-style comparisons for overlapping categorical tasks
    OVERLAP_PROBABILITY_TASKS_MAPPING: List[Tuple[str, str, str]] = [
        ("pericardial-effusion", "pericardial_effusion", "pericardial_effusion_prob"),
        ("LASize", "left_atrium_dilation", "la_dilation_prob"),
        ("RVSize", "right_ventricle_dilation", "rv_dilation_prob"),
        ("RASize", "right_atrium_dilation", "ra_dilation_prob"),
        ("MVRegurgitation", "mitral_regurgitation", "mitral_regurgitation_prob"),
        ("TVRegurgitation", "tricuspid_valve_regurgitation", "tricuspid_regurgitation_prob"),
        ("AVRegurg", "aortic_regurgitation", "aortic_regurgitation_prob"),
        ("AVStenosis", "aortic_stenosis", "aortic_stenosis_prob"),
        ("AVStructure", "bicuspid_aov_morphology", "bicuspid_aortic_valve_prob"),
        ("MVStenosis", "mitral_stenosis", "mitral_stenosis_prob"),
    ]

    for panecho_task_name, echoprime_key_name, output_key in OVERLAP_PROBABILITY_TASKS_MAPPING:
        # 5.5.1 Convert PanEcho to "abnormal probability"
        panecho_abnormal_probability = _panecho_abnormal_probability(panecho_task_name, panecho_normalized)
        # 5.5.2 EchoPrime ia assumed to already be a probability in [0,1]
        echoprime_probability = echoprime_normalized.get(echoprime_key_name, {}).get("probability_present")
        # 5.5.3 Build a human-readable range + flag if the gap is large
        comparison_ranges[output_key] = {
            "from_panecho_abnormal_prob": panecho_abnormal_probability,
            "to_echoprime_prob": echoprime_probability,
            "range": f"{panecho_abnormal_probability} -> {echoprime_probability}",
            "flag_large_gap": _has_large_gap(panecho_abnormal_probability, echoprime_probability, probability_gap_threshold),
        }
        if comparison_ranges[output_key]["flag_large_gap"]:
            alert_flags.append(f"{output_key}_disagreement")

    # 5.6 Partition model-specific outputs (everything not compared above)
    panecho_only_outputs = {}
    for task_name, normalized_node in panecho_normalized.items():
        is_compared_task = (
            task_name in {"EF", "RVSP"} or
            task_name in {x[0] for x in OVERLAP_PROBABILITY_TASKS_MAPPING}
        )
        if not is_compared_task:
            panecho_only_outputs[task_name] = normalized_node
    
    echoprime_only_outputs = {}
    echoprime_compared_keys = {"ejection_fraction", "pulmonary_artery_pressure_continuous"} | {x[1] for x in OVERLAP_PROBABILITY_TASKS_MAPPING}
    for task_name, normalized_node in echoprime_normalized.items():
        if task_name not in echoprime_compared_keys:
            echoprime_only_outputs[task_name] = normalized_node
    
    # 5.7 Return a compact, clinican-ready payload
    return {
        "study_uid": study_uid,
        "ranges": comparison_ranges,                        # doctor-facing comparisons (PanEcho -> EchoPrime); tasks provided by both models #12
        "panecho_normalized": panecho_normalized,           # full normalized PanEcho #40
        "echoprime_normalized": echoprime_normalized,       # full normalized EchoPrime #21
        "panecho_only": panecho_only_outputs,               # tasks only PanEcho predicts #28
        "echoprime_only": echoprime_only_outputs,           # tasks only EchoPrime predicts #9
        "integrated_tasks": integrated_tasks,               # combined task-level results #49
        "flags": sorted(set(alert_flags)),                  # disagreement flags (if any)
    }                                                       # 49 tasks predicted in total
