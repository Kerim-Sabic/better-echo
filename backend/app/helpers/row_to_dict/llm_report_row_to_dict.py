from typing import Optional, Dict, Any, List

from app.database_models.derived_results import DerivedResult


def _parse_report_display(report_text: Any) -> Dict[str, Any]:
    text = str(report_text or "").replace("\r\n", "\n").strip()
    if not text:
        return {"mainTitle": "Clinical Echocardiography Report", "sections": []}

    lines = text.split("\n")
    main_title = "Clinical Echocardiography Report"
    start_index = 0

    if lines[0].startswith("# "):
        title = lines[0].replace("# ", "", 1).strip()
        if title:
            main_title = title
        start_index = 1
    else:
        heading_index = next((idx for idx, line in enumerate(lines) if line.startswith("# ")), -1)
        if heading_index != -1:
            title = lines[heading_index].replace("# ", "", 1).strip()
            if title:
                main_title = title
            start_index = heading_index + 1

    remainder = "\n".join(lines[start_index:]).strip()
    if not remainder:
        return {"mainTitle": main_title, "sections": []}

    raw_sections = remainder.split("\n## ")
    sections: List[Dict[str, str]] = []

    for index, chunk in enumerate(raw_sections):
        normalized_chunk = chunk if index == 0 else f"## {chunk}"
        chunk_lines = normalized_chunk.split("\n")
        title = ""
        body_lines = chunk_lines

        if chunk_lines[0].startswith("## "):
            title = chunk_lines[0].replace("## ", "", 1).strip()
            body_lines = chunk_lines[1:]

        body = "\n".join(body_lines).strip()
        if not title and body:
            first_non_empty = next((line for line in body_lines if line.strip()), "")
            title = first_non_empty.lstrip("#").strip()

        if body:
            sections.append({"title": title, "body": body})

    return {"mainTitle": main_title, "sections": sections}


def build_llm_report_from_row(llm_report_row: Optional[DerivedResult]) -> Dict[str, Any]:
    """Return structured LLM report payload for the observer response."""
    if not llm_report_row or llm_report_row.value_json is None:
        return {}

    if not isinstance(llm_report_row.value_json, dict):
        return {}

    payload = dict(llm_report_row.value_json)
    report_text = payload.get("report_md") or payload.get("raw_text")
    payload["display"] = _parse_report_display(report_text)
    return payload
