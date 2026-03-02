from typing import Any, Dict, List, Optional
import json
import pathlib
import logging

logger = logging.getLogger(__name__)

# Load configuration file once.
# File location is backend/app/helpers/ensemble/, so parents[2] resolves to backend/app/.
CONFIG_FILE = pathlib.Path(__file__).resolve().parents[2] / "configs" / "thresholds.config.json"
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

# Part 1. PanEcho task metadata (class orders, positive labels, units)
# These control how we interpret raw PanEcho outputs
PANECHO_MULTICLASS_LABELS = {
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
PANECHO_BINARY_POSITIVE_LABEL = {
    "pericardial-effusion": "Present",
    "LVWallThickness-increased-any": "Increased",
    "LVWallThickness-increased-modsev": "Moderately or Severely Increased",
    "LVWallMotionAbnormalities": "Present",   # PanEcho may emit scalar p(Present)
    "RVSystolicFunction": "Decreased",        # scalar p(Decreased)
    "RASize": "Dilated",                      # scalar p(Dilated)
    "AVStructure": "Bicuspid",
    "LVOT20mmHg": "Present",
    "MVStenosis": "Mild or Moderate or Severe",
    "RAP-8-or-higher": "Present",
}
PANECHO_REGRESSION_UNITS = {
    "EF": "%", "GLS": "%", "LVEDV": "cm^3", "LVESV": "cm^3", "LVSV": "cm^3",
    "IVSd": "cm", "LVPWd": "cm", "LVIDs": "cm", "LVIDd": "cm", "LVOTDiam": "cm",
    "E|EAvg": "E/E' ratio", "RVSP": "mmHg", "RVIDd": "cm", "TAPSE": "cm", "RVSVel": "cm/s",
    "LAIDs2D": "cm", "LAVol": "cm^3", "RADimensionM-L(cm)": "cm", "AVPkVel(m|s)": "m/s",
    "TVPkGrad": "mmHg", "AORoot": "cm",
}
PANECHO_REGRESSION_TASKS = _build_regression_task_set(TASK_CONFIG, "panecho_name")
ECHOPRIME_REGRESSION_TASKS = _build_regression_task_set(TASK_CONFIG, "echoprime_name")
PANECHO_POSITIVE_CLASSES = {
    "MVRegurgitation": ["Moderate or Severe"],
    "TVRegurgitation": ["Moderate or Severe"],
    "AVRegurg": ["Moderate or Severe"],
    "AVStenosis": ["Severe"],
}

PANECHO_BINARY_NEGATIVE_LABEL = {
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


def _panecho_negative_label(task_name: str) -> str:
    pos = PANECHO_BINARY_POSITIVE_LABEL.get(task_name)
    if pos == "Present":
        return "Absent"
    return PANECHO_BINARY_NEGATIVE_LABEL.get(task_name, f"Not {pos or 'Present'}")


def _panecho_positive_probability(
    task_name: str,
    panecho_normalized: Dict[str, Any],
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


def _normalize_panecho_multiclass(task_name: str, raw_value: Any) -> Dict[str, Any]:
    """
    Convert raw PanEcho multiclass outputs (list[float] or dict) into
    a dict with class probabilities and top-label confidence.
    """
    labels = PANECHO_MULTICLASS_LABELS.get(task_name)
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


def normalize_panecho_predictions(panecho_raw: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Normalize PanEcho outputs into a shared schema:
    - binary/binary_like: {"probability_present": float, "kind": "binary"}
    - multiclass: via _normalize_panecho_multiclass
    - regression/regression_like: {"value": float, "kind": "regression_like"}
    """
    normalized: Dict[str, Dict[str, Any]] = {}

    for task_name, raw_val in panecho_raw.items():
        if task_name in PANECHO_MULTICLASS_LABELS:
            normalized[task_name] = _normalize_panecho_multiclass(task_name, raw_val)
            continue

        if task_name in PANECHO_REGRESSION_TASKS:
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


def normalize_echoprime_predictions(echoprime_raw: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Normalize EchoPrime outputs into a shared schema. Heuristic rules:
    - 0 <= value <= 1: treat as probability_present (binary_like)
    - otherwise: treat as regression_like numeric value
    """
    normalized: Dict[str, Dict[str, Any]] = {}

    for task_name, raw_value in echoprime_raw.items():
        if task_name in ECHOPRIME_REGRESSION_TASKS:
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
) -> Dict[str, Any]:
    """
    Combine PanEcho and EchoPrime outputs into a single integrated_tasks mapping.

    Returns:
        {"integrated_tasks": {task_key: {...}}}
    where each task entry includes per-model values/probabilities, integrated label/value,
    units (from TASK_CONFIG), sources, and a discrepancy flag.
    """
    # 5.1 Normalize both models into a shared schema
    panecho_normalized = normalize_panecho_predictions(panecho_predictions)
    echoprime_normalized = normalize_echoprime_predictions(echoprime_predictions)

    integrated_tasks: Dict[str, Dict[str, Any]] = {}

    for task_key, cfg in TASK_CONFIG.items():
        panecho_name = cfg.get("panecho_name")
        echoprime_name = cfg.get("echoprime_name")

        # Fetch PanEcho probability or value
        pan_prob = None
        pan_val = None
        panecho_node = None
        if panecho_name:
            panecho_node = panecho_normalized.get(panecho_name)
            if panecho_node:
                if panecho_node["kind"] in ("binary", "binary_like"):
                    pan_prob = _panecho_positive_probability(panecho_name, panecho_normalized)
                elif panecho_node["kind"] == "multiclass":
                    pan_prob = _panecho_positive_probability(panecho_name, panecho_normalized)
                elif panecho_node["kind"] in ("regression", "regression_like"):
                    pan_val = panecho_node.get("value")

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
        panecho_pass = (
            pan_prob is not None
            and cfg.get("panecho_threshold") is not None
            and pan_prob >= cfg["panecho_threshold"]
        )
        echoprime_pass = (
            echo_prob is not None
            and cfg.get("echoprime_threshold") is not None
            and echo_prob >= cfg["echoprime_threshold"]
        )

        # Decide integrated value / label based on combine_rule
        rule = cfg.get("combine_rule")
        integrated_label = None
        integrated_value = None
        sources: List[str] = []
        discrepancy: Optional[bool] = None
        preferred_model = (
            rule.split(":", 1)[1].strip()
            if isinstance(rule, str) and rule.startswith("prefer_model")
            else None
        )

        if rule == "average_value":
            # For continuous metrics like EF and PAP
            if pan_val is not None and echo_val is not None:
                integrated_value = (pan_val + echo_val) / 2.0
                sources = ["PanEcho", "EchoPrime"]
                thr = cfg.get("discrepancy_threshold")
                if thr is not None:
                    try:
                        discrepancy = abs(float(pan_val) - float(echo_val)) > float(thr)
                    except Exception:
                        discrepancy = False
            elif pan_val is not None:
                integrated_value = pan_val
                sources = ["PanEcho"]
            elif echo_val is not None:
                integrated_value = echo_val
                sources = ["EchoPrime"]
            # Optionally: check discrepancy threshold here
        elif isinstance(rule, str) and rule.startswith("prefer_model"):
            # Example: "prefer_model:PanEcho" or "prefer_model:EchoPrime"
            preferred_model = rule.split(":", 1)[1].strip()

            # Numeric (regression) path if any numeric value present
            is_numeric = (pan_val is not None) or (echo_val is not None)
            if is_numeric:
                # Choose preferred model's numeric value if present, else fallback
                if preferred_model == "PanEcho" and (pan_val is not None):
                    integrated_value = pan_val
                    sources = ["PanEcho"]
                elif preferred_model == "EchoPrime" and (echo_val is not None):
                    integrated_value = echo_val
                    sources = ["EchoPrime"]
                else:
                    # Fallback to whichever numeric value exists
                    if pan_val is not None:
                        integrated_value = pan_val
                        sources = ["PanEcho"]
                    elif echo_val is not None:
                        integrated_value = echo_val
                        sources = ["EchoPrime"]

                # Optional: numeric discrepancy if both present and threshold in config
                thr = cfg.get("discrepancy_threshold")
                if (thr is not None) and (pan_val is not None) and (echo_val is not None):
                    try:
                        discrepancy = abs(float(pan_val) - float(echo_val)) > float(thr)
                    except Exception:
                        discrepancy = False

                # No integrated_label for numeric tasks
            else:
                # Classification (prob/prob-like): prefer chosen model only
                if preferred_model == "PanEcho":
                    pos = PANECHO_BINARY_POSITIVE_LABEL.get(panecho_name, "Present")
                    neg = _panecho_negative_label(panecho_name) if panecho_name else "Absent"
                    is_pos = bool(panecho_pass)
                    integrated_label, integrated_value = _binary_label_and_conf(pan_prob, pos, neg, is_pos)
                    sources = ["PanEcho"] if integrated_label else []
                else:
                    pos, neg = _ep_labels()
                    is_pos = bool(echoprime_pass)
                    integrated_label, integrated_value = _binary_label_and_conf(echo_prob, pos, neg, is_pos)
                    sources = ["EchoPrime"] if integrated_label else []
        elif rule == "positive_if_either_positive":
            if panecho_pass or echoprime_pass:
                # Choose the passing model with higher p_present
                pan_p = pan_prob if panecho_pass else None
                ep_p = echo_prob if echoprime_pass else None
                use_pan = (pan_p is not None) and (ep_p is None or pan_p >= ep_p)
                if use_pan:
                    pos = PANECHO_BINARY_POSITIVE_LABEL.get(panecho_name, "Present")
                    neg = _panecho_negative_label(panecho_name) if panecho_name else "Absent"
                    integrated_label, integrated_value = _binary_label_and_conf(pan_prob, pos, neg, True)
                    sources = ["PanEcho"]
                else:
                    pos, neg = _ep_labels()
                    integrated_label, integrated_value = _binary_label_and_conf(echo_prob, pos, neg, True)
                    sources = ["EchoPrime"]
            else:
                # Neither passes -> negative with highest negative confidence
                pos_pan = PANECHO_BINARY_POSITIVE_LABEL.get(panecho_name, "Present")
                neg_pan = _panecho_negative_label(panecho_name) if panecho_name else "Absent"
                pos_ep, neg_ep = _ep_labels()
                # Use the model with larger (1 - p_present) to name negative label
                pan_neg_conf = (1.0 - pan_prob) if pan_prob is not None else None
                ep_neg_conf = (1.0 - echo_prob) if echo_prob is not None else None
                use_pan = (pan_neg_conf is not None) and (ep_neg_conf is None or pan_neg_conf >= ep_neg_conf)
                if use_pan:
                    integrated_label, integrated_value = _binary_label_and_conf(pan_prob, pos_pan, neg_pan, False)
                    sources = ["PanEcho"]
                else:
                    integrated_label, integrated_value = _binary_label_and_conf(echo_prob, pos_ep, neg_ep, False)
                    sources = ["EchoPrime"]
        elif rule == "agree_if_both_positive":
            if panecho_pass and echoprime_pass:
                # Positive only if both; confidence = min()
                pos = PANECHO_BINARY_POSITIVE_LABEL.get(panecho_name, "Present")
                integrated_label = pos  # prefer PanEcho wording when available
                integrated_value = float(min(pan_prob, echo_prob))
                sources = ["PanEcho", "EchoPrime"]
            else:
                # Negative; confidence = 1 - max()
                neg = _panecho_negative_label(panecho_name) if panecho_name else "Absent"
                worst = max([p for p in [pan_prob, echo_prob] if p is not None], default=None)
                integrated_label = neg
                integrated_value = (1.0 - worst) if worst is not None else None
                sources = []
        elif rule == "prefer_panecho_if_echoprime_zero":
            if echoprime_pass:
                pos, neg = _ep_labels()
                integrated_label, integrated_value = _binary_label_and_conf(echo_prob, pos, neg, True)
                sources = ["EchoPrime"]
            elif panecho_pass:
                pos = PANECHO_BINARY_POSITIVE_LABEL.get(panecho_name, "Present")
                neg = _panecho_negative_label(panecho_name) if panecho_name else "Absent"
                integrated_label, integrated_value = _binary_label_and_conf(pan_prob, pos, neg, True)
                sources = ["PanEcho"]
            else:
                # Neither passes -> negative; pick the model with higher negative confidence for labeling
                pos_pan = PANECHO_BINARY_POSITIVE_LABEL.get(panecho_name, "Present")
                neg_pan = _panecho_negative_label(panecho_name) if panecho_name else "Absent"
                pos_ep, neg_ep = _ep_labels()
                pan_neg_conf = (1.0 - pan_prob) if pan_prob is not None else None
                ep_neg_conf = (1.0 - echo_prob) if echo_prob is not None else None
                use_pan = (pan_neg_conf is not None) and (ep_neg_conf is None or pan_neg_conf >= ep_neg_conf)
                if use_pan:
                    integrated_label, integrated_value = _binary_label_and_conf(pan_prob, pos_pan, neg_pan, False)
                    sources = ["PanEcho"]
                else:
                    integrated_label, integrated_value = _binary_label_and_conf(echo_prob, pos_ep, neg_ep, False)
                    sources = ["EchoPrime"]

        prefer_pan_multiclass = (
            preferred_model == "PanEcho"
            and panecho_node is not None
            and panecho_node.get("kind") == "multiclass"
        )
        if prefer_pan_multiclass:
            probs = panecho_node.get("probs") or {}
            integrated_label = panecho_node.get("label")
            integrated_value = panecho_node.get("confidence")
            sources = ["PanEcho"]
        else:
            probs = None

        panecho_payload = (
            probs if prefer_pan_multiclass else (pan_val if pan_val is not None else pan_prob)
        )

        integrated_tasks[task_key] = {
            "panecho_value_or_prob": panecho_payload,
            "echoprime_value_or_prob": echo_val if echo_val is not None else echo_prob,
            "integrated_value": integrated_value,
            "integrated_label": integrated_label,
            "units": cfg.get("units"),
            "sources": sources,
            "discrepancy": (
                discrepancy
                if discrepancy is not None
                else (
                    (panecho_pass != echoprime_pass)
                    if (pan_prob is not None and echo_prob is not None)
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
) -> (Optional[str], Optional[float]):
    """
    Helper to convert a probability + decision into a label/confidence pair.
    """
    if prob_present is None:
        return None, None
    if is_positive:
        return positive_label, float(prob_present)
    return negative_label, float(1.0 - prob_present)


def _ep_labels() -> (str, str):
    """
    Default positive/negative labels for EchoPrime binary tasks.
    """
    return "Present", "Absent"

