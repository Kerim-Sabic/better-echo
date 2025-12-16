from typing import Any, Dict, Optional, Tuple

"""
In-memory pending state for WebAuthn ceremonies.

These states store the server-generated challenge and are required to complete
register/auth flows. In dev mode (single-process uvicorn) this is fine; in a
multi-worker deployment you'd replace this with a shared store (e.g. Redis).
"""

pending_register: Dict[int, Any] = {}
pending_auth: Dict[str, Tuple[Any, Optional[int]]] = {}
