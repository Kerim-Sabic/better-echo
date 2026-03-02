import logging
from typing import List, Dict, Any, Optional

import requests

from app.core.config import settings


logger = logging.getLogger(__name__)


class LLMClient:
    """
    Thin wrapper over an OpenAI-compatible Chat Completions endpoint.
    Uses requests to avoid adding new dependencies.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: float = 60.0,
    ) -> None:
        self.base_url = (base_url or settings.LLM_BASE_URL).rstrip("/")
        self.api_key = api_key or settings.LLM_API_KEY
        self.model = model or settings.LLM_MODEL
        self.timeout_seconds = timeout_seconds
        self._health_endpoint = f"{self.base_url}/models"

    def wait_until_ready(self, retries: int = 5, delay_seconds: float = 2.0) -> bool:
        """
        Probe the LLM server for readiness. Returns True if ready, False otherwise.
        """
        for attempt in range(retries):
            try:
                resp = requests.get(self._health_endpoint, timeout=3.0)
                if resp.ok:
                    return True
            except Exception:
                pass
            if attempt < retries - 1:
                import time
                time.sleep(delay_seconds)
        return False

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 1024,
        top_p: Optional[float] = None,
        seed: Optional[int] = None,
    ) -> str:
        """
        Calls POST {base_url}/chat/completions and returns assistant content.
        """
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            # Local server still expects an Authorization header, value is not validated
            "Authorization": f"Bearer {self.api_key}",
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "seed": seed,
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=self.timeout_seconds)
            resp.raise_for_status()
            data = resp.json()

            # Expected format: choices[0].message.content
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("LLM returned no choices")
            message = choices[0].get("message") or {}
            content = message.get("content")
            if not isinstance(content, str):
                raise RuntimeError("LLM returned empty content")
            return content
        except Exception as e:
            logger.exception(f"[LLM] chat_completion failed: {e}")
            raise


__all__ = ["LLMClient"]
