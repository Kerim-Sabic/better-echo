from typing import Any, Dict, List, Optional
import json
import logging

from app.core.runtime_paths import config_path

logger = logging.getLogger(__name__)

# Load configuration file once.
CONFIG_FILE = config_path("thresholds.config.json")
try:
    with open(CONFIG_FILE) as f:
        TASK_CONFIG = json.load(f)
except Exception as e:
    TASK_CONFIG = {}
    logger.warning(f"[combine_results] Could not load config: {e}")


def _build_regression_task_set(config: Dict[str, Any], name_key: str) -> set:
    names = set()
    for cfg in (config or {}).values():
        if cfg.get("units") is None:
            continue
        name = cfg.get(name_key)
        if name:
            names.add(name)
    return names

# Part 1. Primary analysis task metadata (class orders and positive labels)
# These control how we interpret raw primary analysis outputs.
PRIMARY_ANALYSIS_MULTICLASS_LABELS = {
    "LVSize": ["Mildly Increased", "Moderately or Severely Increased", "Normal"],
    "LVSystolicFunction": ["Mildly Decreased", "Moderately or Severely Decreased", "Normal or Hyperdynamic"],
    "LVDiastolicFunction": ["Mild or Indeterminate", "Moderate or Severe", "Normal"],
    "RVSize": ["Mildly Increased", "Moderately or Severely Increased", "Normal"],
    "LASize": ["Mildly Dilated", "Moderately or Severely Dilated", "Normal"],
    "AVStenosis": ["Mild or Moderate", "None", "Severe"],
    "AVRegurg": ["Mild", "Moderate or Severe", "None or Trace"],
    "MVRegurgitation": ["Mild", "Moderate or Severe", "None or Trace"],
    "TVRegurgitation": ["Mild", "Moderate or Severe", "None or Trace"],
}
PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL = {
    "pericardial-effusion": "Present",
    "LVWallThickness-increased-any": "Increased",
    "LVWallThickness-increased-modsev": "Moderately or Severely Increased",
    "LVWallMotionAbnormalities": "Present",   # primary analysis may emit scalar p(Present)
    "RVSystolicFunction": "Decreased",        # scalar p(Decreased)
    "RASize": "Dilated",                      # scalar p(Dilated)
    "AVStructure": "Bicuspid",
    "LVOT20mmHg": "Present",
    "MVStenosis": "Mild or Moderate or Severe",
    "RAP-8-or-higher": "Present",
}
PRIMARY_ANALYSIS_REGRESSION_TASKS = _build_regression_task_set(TASK_CONFIG, "primary_source_name")
SECONDARY_ANALYSIS_REGRESSION_TASKS = _build_regression_task_set(TASK_CONFIG, "secondary_source_name")
PRIMARY_ANALYSIS_POSITIVE_CLASSES = {
    "MVRegurgitation": ["Moderate or Severe"],
    "TVRegurgitation": ["Moderate or Severe"],
    "AVRegurg": ["Moderate or Severe"],
    "AVStenosis": ["Severe"],
}

PRIMARY_ANALYSIS_BINARY_NEGATIVE_LABEL = {
    "pericardial-effusion": "Absent",
    "LVWallThickness-increased-any": "Not Increased",
    "LVWallThickness-increased-modsev": "Not Moderately or Severely Increased",
    "LVWallMotionAbnormalities": "Absent",
    "RVSystolicFunction": "Normal",
    "RASize": "Normal",
    "AVStructure": "Not Bicuspid",
    "LVOT20mmHg": "Absent",
    "MVStenosis": "None",
    "RAP-8-or-higher": "Below 8",
}


def _primary_analysis_negative_label(task_name: str) -> str:
    pos = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(task_name)
    if pos == "Present":
        return "Absent"
    return PRIMARY_ANALYSIS_BINARY_NEGATIVE_LABEL.get(task_name, f"Not {pos or 'Present'}")


def _primary_analysis_positive_probability(
    task_name: str,
    primary_analysis_normalized: Dict[str, Any],
) -> Optional[float]:
    """
    Returns the probability of a clinically significant finding from the primary analysis engine:
    - For binary tasks: just use the probability_present
    - For multiclass tasks: sum probabilities of 'positive' classes defined in PRIMARY_ANALYSIS_POSITIVE_CLASSES
    If no positive classes are defined, fall back to the existing 'abnormal' probability (1 - p(normal))
    """
    node = primary_analysis_normalized.get(task_name)
    if not node:
        return None

    kind = node.get("kind")
    if kind == "binary":
        return node.get("probability_present")

    if kind == "multiclass":
        class_probs = node.get("probs") or {}
        positive_labels = PRIMARY_ANALYSIS_POSITIVE_CLASSES.get(task_name)
        if positive_labels:
            # Sum up the probabilities for the positive labels
            return float(sum(class_probs.get(label, 0.0) for label in positive_labels))
        else:
            # Fallback: abnormal = 1 - probability of the normal class (existing behaviour)
            normal_class_by_task = {
                "LVSize": "Normal",
                "LVSystolicFunction": "Normal or Hyperdynamic",
                "LVDiastolicFunction": "Normal",
                "RVSize": "Normal",
                "LASize": "Normal",
                "AVStenosis": "None",
                "AVRegurg": "None or Trace",
                "MVRegurgitation": "None or Trace",
                "TVRegurgitation": "None or Trace",
            }
            normal_label = normal_class_by_task.get(task_name)
            if not normal_label:
                return None
            p_norm = class_probs.get(normal_label)
            if p_norm is None:
                return None
            return 1.0 - p_norm

    return None


def _to_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except Exception:
        return None


def _normalize_primary_analysis_multiclass(task_name: str, raw_value: Any) -> Dict[str, Any]:
    """
    Convert raw primary analysis multiclass outputs (list[float] or dict) into
    a dict with class probabilities and top-label confidence.
    """
    labels = PRIMARY_ANALYSIS_MULTICLASS_LABELS.get(task_name)
    if not labels:
        return {"raw": raw_value, "kind": "unknown"}

    if isinstance(raw_value, dict):
        class_probs = {str(k): float(v) for k, v in raw_value.items()}
    elif isinstance(raw_value, (list, tuple)):
        probs: List[float] = []
        for v in raw_value:
            fv = _to_float_or_none(v)
            if fv is None:
                return {"raw": raw_value, "kind": "unknown"}
            probs.append(fv)
        total = sum(probs)
        if total <= 0.0:
            return {"raw": raw_value, "kind": "unknown"}
        probs = [p / total for p in probs]
        class_probs = {labels[i]: probs[i] for i in range(min(len(labels), len(probs)))}
    else:
        return {"raw": raw_value, "kind": "unknown"}

    top_label = None
    top_prob = None
    for lab, p in class_probs.items():
        if top_prob is None or float(p) > float(top_prob):
            top_label = lab
            top_prob = float(p)

    return {
        "kind": "multiclass",
        "probs": class_probs,
        "label": top_label,
        "confidence": top_prob,
    }


def normalize_primary_analysis_predictions(primary_analysis_raw: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Normalize primary analysis outputs into a shared schema:
    - binary/binary_like: {"probability_present": float, "kind": "binary"}
    - multiclass: via _normalize_primary_analysis_multiclass
    - regression/regression_like: {"value": float, "kind": "regression_like"}
    """
    normalized: Dict[str, Dict[str, Any]] = {}

    for task_name, raw_val in primary_analysis_raw.items():
        if task_name in PRIMARY_ANALYSIS_MULTICLASS_LABELS:
            normalized[task_name] = _normalize_primary_analysis_multiclass(task_name, raw_val)
            continue

        if task_name in PRIMARY_ANALYSIS_REGRESSION_TASKS:
            val = _to_float_or_none(raw_val)
            if val is None:
                normalized[task_name] = {"raw": raw_val, "kind": "unknown"}
            else:
                if task_name == "GLS":
                    val = -1.0 * val
                normalized[task_name] = {"value": val, "kind": "regression_like"}
            continue

        val = _to_float_or_none(raw_val)
        if val is None:
            normalized[task_name] = {"raw": raw_val, "kind": "unknown"}
            continue

        if 0.0 <= val <= 1.0:
            normalized[task_name] = {"probability_present": val, "kind": "binary"}
        else:
            normalized[task_name] = {"value": val, "kind": "regression_like"}

    return normalized


def normalize_secondary_analysis_predictions(secondary_analysis_raw: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Normalize secondary analysis outputs into a shared schema. Heuristic rules:
    - 0 <= value <= 1: treat as probability_present (binary_like)
    - otherwise: treat as regression_like numeric value
    """
    normalized: Dict[str, Dict[str, Any]] = {}

    for task_name, raw_value in secondary_analysis_raw.items():
        if task_name in SECONDARY_ANALYSIS_REGRESSION_TASKS:
            numeric_value = _to_float_or_none(raw_value)
            if numeric_value is None:
                normalized[task_name] = {
                    "raw": raw_value,
                    "kind": "unknown",
                }
            else:
                normalized[task_name] = {
                    "value": numeric_value,
                    "kind": "regression_like",
                }
            continue

        numeric_value = _to_float_or_none(raw_value)
        if numeric_value is None:
            normalized[task_name] = {
                "raw": raw_value,
                "kind": "unknown",
            }
        elif 0.0 <= numeric_value <= 1.0:
            normalized[task_name] = {
                "probability_present": numeric_value,
                "kind": "binary_like",
            }
        else:
            normalized[task_name] = {
                "value": numeric_value,
                "kind": "regression_like",
            }

    return normalized


# Part 4. Main combiner - orchestrates normalization, comparison, and packaging
def combine_results(
    study_uid: str,
    primary_analysis_predictions: Dict[str, Any],
    secondary_analysis_predictions: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Combine primary and secondary analysis outputs into a single integrated_tasks mapping.

    Returns:
        {"integrated_tasks": {task_key: {...}}}
    where each task entry includes per-model values/probabilities, integrated label/value,
    units (from TASK_CONFIG), sources, and a discrepancy flag.
    """
    # 5.1 Normalize both analysis engines into a shared schema
    primary_analysis_normalized = normalize_primary_analysis_predictions(primary_analysis_predictions)
    secondary_analysis_normalized = normalize_secondary_analysis_predictions(secondary_analysis_predictions)

    integrated_tasks: Dict[str, Dict[str, Any]] = {}

    for task_key, cfg in TASK_CONFIG.items():
        primary_source_name = cfg.get("primary_source_name")
        secondary_source_name = cfg.get("secondary_source_name")

        # Fetch primary analysis probability or value
        primary_prob = None
        primary_value = None
        primary_source_node = None
        if primary_source_name:
            primary_source_node = primary_analysis_normalized.get(primary_source_name)
            if primary_source_node:
                if primary_source_node["kind"] in ("binary", "binary_like"):
                    primary_prob = _primary_analysis_positive_probability(primary_source_name, primary_analysis_normalized)
                elif primary_source_node["kind"] == "multiclass":
                    primary_prob = _primary_analysis_positive_probability(primary_source_name, primary_analysis_normalized)
                elif primary_source_node["kind"] in ("regression", "regression_like"):
                    primary_value = primary_source_node.get("value")

        # Fetch secondary analysis probability or value
        secondary_prob = None
        secondary_value = None
        if secondary_source_name:
            node = secondary_analysis_normalized.get(secondary_source_name)
            if node:
                if node["kind"] in ("binary", "binary_like"):
                    secondary_prob = node.get("probability_present")
                elif node["kind"] in ("regression", "regression_like"):
                    secondary_value = node.get("value")

        # Apply thresholds
        primary_source_pass = (
            primary_prob is not None
            and cfg.get("primary_threshold") is not None
            and primary_prob >= cfg.get("primary_threshold")
        )
        secondary_source_pass = (
            secondary_prob is not None
            and cfg.get("secondary_threshold") is not None
            and secondary_prob >= cfg.get("secondary_threshold")
        )

        # Decide integrated value / label based on combine_rule
        rule = cfg.get("combine_rule")
        integrated_label = None
        integrated_value = None
        sources: List[str] = []
        discrepancy: Optional[bool] = None
        preferred_model = (
            rule.split(":", 1)[1].strip()
            if isinstance(rule, str) and (rule.startswith("prefer_source") or rule.startswith("prefer_model"))
            else None
        )

        if rule == "average_value":
            # For continuous metrics like EF and PAP
            if primary_value is not None and secondary_value is not None:
                integrated_value = (primary_value + secondary_value) / 2.0
                sources = ["primary_analysis", "secondary_analysis"]
                thr = cfg.get("discrepancy_threshold")
                if thr is not None:
                    try:
                        discrepancy = abs(float(primary_value) - float(secondary_value)) > float(thr)
                    except Exception:
                        discrepancy = False
            elif primary_value is not None:
                integrated_value = primary_value
                sources = ["primary_analysis"]
            elif secondary_value is not None:
                integrated_value = secondary_value
                sources = ["secondary_analysis"]
        elif isinstance(rule, str) and (rule.startswith("prefer_source") or rule.startswith("prefer_model")):
            # Example: "prefer_source:primary" or "prefer_source:secondary"
            preferred_model = rule.split(":", 1)[1].strip()

            # Numeric (regression) path if any numeric value present
            is_numeric = (primary_value is not None) or (secondary_value is not None)
            if is_numeric:
                # Choose preferred model's numeric value if present, else fallback
                if preferred_model in {"primary"} and (primary_value is not None):
                    integrated_value = primary_value
                    sources = ["primary_analysis"]
                elif preferred_model in {"secondary"} and (secondary_value is not None):
                    integrated_value = secondary_value
                    sources = ["secondary_analysis"]
                else:
                    # Fallback to whichever numeric value exists
                    if primary_value is not None:
                        integrated_value = primary_value
                        sources = ["primary_analysis"]
                    elif secondary_value is not None:
                        integrated_value = secondary_value
                        sources = ["secondary_analysis"]

                # Optional: numeric discrepancy if both present and threshold in config
                thr = cfg.get("discrepancy_threshold")
                if (thr is not None) and (primary_value is not None) and (secondary_value is not None):
                    try:
                        discrepancy = abs(float(primary_value) - float(secondary_value)) > float(thr)
                    except Exception:
                        discrepancy = False

                # No integrated_label for numeric tasks
            else:
                # Classification (prob/prob-like): prefer chosen model only
                if preferred_model in {"primary"}:
                    pos = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(primary_source_name, "Present")
                    neg = _primary_analysis_negative_label(primary_source_name) if primary_source_name else "Absent"
                    is_pos = bool(primary_source_pass)
                    integrated_label, integrated_value = _binary_label_and_conf(primary_prob, pos, neg, is_pos)
                    sources = ["primary_analysis"] if integrated_label else []
                else:
                    pos, neg = _ep_labels()
                    is_pos = bool(secondary_source_pass)
                    integrated_label, integrated_value = _binary_label_and_conf(secondary_prob, pos, neg, is_pos)
                    sources = ["secondary_analysis"] if integrated_label else []
        elif rule == "positive_if_either_positive":
            if primary_source_pass or secondary_source_pass:
                # Choose the passing model with higher p_present
                primary_pass_prob = primary_prob if primary_source_pass else None
                secondary_pass_prob = secondary_prob if secondary_source_pass else None
                use_pan = (primary_pass_prob is not None) and (secondary_pass_prob is None or primary_pass_prob >= secondary_pass_prob)
                if use_pan:
                    pos = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(primary_source_name, "Present")
                    neg = _primary_analysis_negative_label(primary_source_name) if primary_source_name else "Absent"
                    integrated_label, integrated_value = _binary_label_and_conf(primary_prob, pos, neg, True)
                    sources = ["primary_analysis"]
                else:
                    pos, neg = _ep_labels()
                    integrated_label, integrated_value = _binary_label_and_conf(secondary_prob, pos, neg, True)
                    sources = ["secondary_analysis"]
            else:
                # Neither passes -> negative with highest negative confidence
                primary_positive_label = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(primary_source_name, "Present")
                primary_negative_label = _primary_analysis_negative_label(primary_source_name) if primary_source_name else "Absent"
                pos_ep, neg_ep = _ep_labels()
                # Use the model with larger (1 - p_present) to name negative label
                pan_neg_conf = (1.0 - primary_prob) if primary_prob is not None else None
                ep_neg_conf = (1.0 - secondary_prob) if secondary_prob is not None else None
                use_pan = (pan_neg_conf is not None) and (ep_neg_conf is None or pan_neg_conf >= ep_neg_conf)
                if use_pan:
                    integrated_label, integrated_value = _binary_label_and_conf(primary_prob, primary_positive_label, primary_negative_label, False)
                    sources = ["primary_analysis"]
                else:
                    integrated_label, integrated_value = _binary_label_and_conf(secondary_prob, pos_ep, neg_ep, False)
                    sources = ["secondary_analysis"]
        elif rule == "agree_if_both_positive":
            if primary_source_pass and secondary_source_pass:
                # Positive only if both; confidence = min()
                pos = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(primary_source_name, "Present")
                integrated_label = pos  # prefer primary analysis wording when available
                integrated_value = float(min(primary_prob, secondary_prob))
                sources = ["primary_analysis", "secondary_analysis"]
            else:
                # Negative; confidence = 1 - max()
                neg = _primary_analysis_negative_label(primary_source_name) if primary_source_name else "Absent"
                worst = max([p for p in [primary_prob, secondary_prob] if p is not None], default=None)
                integrated_label = neg
                integrated_value = (1.0 - worst) if worst is not None else None
                sources = []
        elif rule == "prefer_primary_if_secondary_zero":
            if secondary_source_pass:
                pos, neg = _ep_labels()
                integrated_label, integrated_value = _binary_label_and_conf(secondary_prob, pos, neg, True)
                sources = ["secondary_analysis"]
            elif primary_source_pass:
                pos = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(primary_source_name, "Present")
                neg = _primary_analysis_negative_label(primary_source_name) if primary_source_name else "Absent"
                integrated_label, integrated_value = _binary_label_and_conf(primary_prob, pos, neg, True)
                sources = ["primary_analysis"]
            else:
                # Neither passes -> negative; pick the model with higher negative confidence for labeling
                primary_positive_label = PRIMARY_ANALYSIS_BINARY_POSITIVE_LABEL.get(primary_source_name, "Present")
                primary_negative_label = _primary_analysis_negative_label(primary_source_name) if primary_source_name else "Absent"
                pos_ep, neg_ep = _ep_labels()
                pan_neg_conf = (1.0 - primary_prob) if primary_prob is not None else None
                ep_neg_conf = (1.0 - secondary_prob) if secondary_prob is not None else None
                use_pan = (pan_neg_conf is not None) and (ep_neg_conf is None or pan_neg_conf >= ep_neg_conf)
                if use_pan:
                    integrated_label, integrated_value = _binary_label_and_conf(primary_prob, primary_positive_label, primary_negative_label, False)
                    sources = ["primary_analysis"]
                else:
                    integrated_label, integrated_value = _binary_label_and_conf(secondary_prob, pos_ep, neg_ep, False)
                    sources = ["secondary_analysis"]

        prefer_pan_multiclass = (
            preferred_model in {"primary"}
            and primary_source_node is not None
            and primary_source_node.get("kind") == "multiclass"
        )
        if prefer_pan_multiclass:
            probs = primary_source_node.get("probs") or {}
            integrated_label = primary_source_node.get("label")
            integrated_value = primary_source_node.get("confidence")
            sources = ["primary_analysis"]
        else:
            probs = None

        primary_payload = (
            probs if prefer_pan_multiclass else (primary_value if primary_value is not None else primary_prob)
        )

        integrated_tasks[task_key] = {
            "primary_value_or_prob": primary_payload,
            "secondary_value_or_prob": secondary_value if secondary_value is not None else secondary_prob,
            "integrated_value": integrated_value,
            "integrated_label": integrated_label,
            "units": cfg.get("units"),
            "sources": sources,
            "discrepancy": (
                discrepancy
                if discrepancy is not None
                else (
                    (primary_source_pass != secondary_source_pass)
                    if (primary_prob is not None and secondary_prob is not None)
                    else None
                )
            ),
        }

    # Return only the integrated tasks (legacy ranges/flags/partitions were removed)
    return {
        "integrated_tasks": integrated_tasks,
    }


def _binary_label_and_conf(
    prob_present: Optional[float],
    positive_label: str,
    negative_label: str,
    is_positive: bool,
) -> tuple[Optional[str], Optional[float]]:
    """
    Helper to convert a probability + decision into a label/confidence pair.
    """
    if prob_present is None:
        return None, None
    if is_positive:
        return positive_label, float(prob_present)
    return negative_label, float(1.0 - prob_present)


def _ep_labels() -> tuple[str, str]:
    """
    Default positive/negative labels for secondary analysis binary tasks.
    """
    return "Present", "Absent"



