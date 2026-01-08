from dataclasses import dataclass
from app.core.config import settings


@dataclass(frozen=True)
class LLMParams:
    # Report generation
    temperature_report: float = settings.LLM_TEMPERATURE_REPORT
    top_p_report: float = settings.LLM_TOP_P_REPORT
    seed_report: int = settings.LLM_SEED_REPORT
    desired_output_tokens_report: int = settings.LLM_DESIRED_OUTPUT_TOKENS_REPORT

    # Chat
    temperature_chat: float = settings.LLM_TEMPERATURE_CHAT
    top_p_chat: float = settings.LLM_TOP_P_CHAT
    seed_chat: int = settings.LLM_SEED_CHAT
    desired_output_tokens_chat: int = settings.LLM_DESIRED_OUTPUT_TOKENS_CHAT
    history_max_turns: int = settings.LLM_HISTORY_MAX_TURNS

    # Server budget
    server_max_len: int = settings.LLM_SERVER_MAX_LEN

    # Versioning
    prompt_version: str = settings.LLM_PROMPT_VERSION


def approx_token_count(text: str) -> int:
    """Rough heuristic: ~4 chars per token (conservative for English text)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def safe_max_tokens(prompt_text: str, desired_output: int, server_max_len: int) -> int:
    """Compute a safe max_tokens given estimated prompt size and server cap."""
    prompt_tokens = approx_token_count(prompt_text)
    # keep a little headroom for the server
    return max(256, min(desired_output, max(256, server_max_len - prompt_tokens - 64)))

