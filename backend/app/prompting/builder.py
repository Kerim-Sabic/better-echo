import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from jinja2 import Template

from app.core.config import settings
from app.core.runtime_paths import prompt_template_path
from app.prompting.params import LLMParams, safe_max_tokens


logger = logging.getLogger(__name__)


def _load_template(template_path: str) -> Template:
    p = Path(template_path)
    if not p.exists():
        runtime_default = prompt_template_path(p.name)
        if runtime_default.exists():
            p = runtime_default
        else:
            # Fallback: look for the template next to this file by filename
            alt = Path(__file__).resolve().parent / p.name
            if alt.exists():
                p = alt
            else:
                # Last resort: try two-level parent / prompting / filename
                alt2 = Path(__file__).resolve().parents[1] / "prompting" / p.name
                if alt2.exists():
                    p = alt2
    text = p.read_text(encoding="utf-8")
    return Template(text)


def build_report_messages(
    study_uid: str,
    combined_sections: Dict[str, Any],
    language: Optional[str],
    style: Optional[str],
    params: Optional[LLMParams] = None,
) -> Dict[str, Any]:
    """
    Renders the report prompt from template and returns messages + computed max_tokens.
    """
    params = params or LLMParams()

    # Compact JSON for prompt injection
    try:
        structured_json = json.dumps(combined_sections, ensure_ascii=False)
    except Exception:
        structured_json = "{}"

    # Render Jinja2 template
    tmpl = _load_template(settings.LLM_PROMPT_TEMPLATE_PATH)
    rendered_user = tmpl.render(structured_results_json=structured_json)

    # Optional language/style note as a short system guard
    sys_hint = (
        f"You are a clinical echocardiography assistant. Respond in {language or 'en'}. "
        f"Style: {style or 'concise'}. Do not fabricate data."
    )

    # Compute safe max_tokens against server budget
    max_tokens = safe_max_tokens(rendered_user, params.desired_output_tokens_report, params.server_max_len)

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": sys_hint},
        {"role": "user", "content": rendered_user},
    ]

    return {"messages": messages, "max_tokens": max_tokens}


def extract_report_blocks(raw_text: str) -> Dict[str, Any]:
    """
    Removes <think>, extracts <report> and <diagnoses_json> blocks, and cleans fences.
    Returns report_md, diagnoses_json (list | None), raw_text (str).
    """
    if raw_text is None:
        return {"report_md": "", "diagnoses_json": None, "raw_text": ""}

    # 1) Strip <think> blocks
    cleaned = re.sub(r"<think>.*?</think>\s*", "", raw_text, flags=re.S)

    # 2) Extract blocks
    m_rep = re.search(r"<report>\s*(.+?)\s*</report>", cleaned, flags=re.S | re.I)
    m_json = re.search(r"<diagnoses_json>\s*(\[.*?\])\s*</diagnoses_json>", cleaned, flags=re.S | re.I)

    report_md = (m_rep.group(1) if m_rep else cleaned).strip()
    diagnoses_text = (m_json.group(1) if m_json else "[]").strip()

    # 3) Clean accidental code fences or instruction echoes
    report_md = re.sub(r"```+.*?```+", "", report_md, flags=re.S)
    report_md = re.sub(r"\[Block .*?\]", "", report_md).strip()

    # 4) Validate JSON
    diagnoses = None
    try:
        obj = json.loads(diagnoses_text)
        if isinstance(obj, list):
            diagnoses = obj
    except Exception:
        diagnoses = None

    return {"report_md": report_md, "diagnoses_json": diagnoses, "raw_text": cleaned}


def build_chat_messages(
    study_uid: str,
    report_md: str,
    diagnoses_json: Optional[List[Dict[str, Any]]],
    combined_sections: Dict[str, Any],
    question: str,
    history: Optional[List[Dict[str, str]]],
    params: Optional[LLMParams] = None,
) -> Dict[str, Any]:
    params = params or LLMParams()
    # Minimal system guard
    system_prompt = (
        "You are a clinical assistant answering echo-related questions. "
        "Use the provided report and diagnoses JSON as context. Be concise, avoid speculation, and clarify uncertainty."
    )

    # Compose compact context
    try:
        combined_json = json.dumps(combined_sections, ensure_ascii=False)
    except Exception:
        combined_json = "{}"

    ctx = (
        f"Study UID: {study_uid}\n"
        f"Report:\n{report_md}\n\n"
        f"Diagnoses JSON:\n{json.dumps(diagnoses_json, ensure_ascii=False) if diagnoses_json is not None else '[]'}\n\n"
        f"Combined sections (compact):\n{combined_json}\n\n"
        f"Question: {question}"
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    # Keep last N history turns if provided
    if history:
        kept = history[-params.history_max_turns :]
        for t in kept:
            if t.get("role") in {"user", "assistant", "system"} and isinstance(t.get("content"), str):
                messages.append({"role": t["role"], "content": t["content"]})

    messages.append({"role": "user", "content": ctx})

    # Budgeting
    max_tokens = safe_max_tokens(ctx, params.desired_output_tokens_chat, params.server_max_len)
    return {"messages": messages, "max_tokens": max_tokens}
