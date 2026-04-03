from fastapi import HTTPException, Request

LOOPBACK_CLIENT_HOSTS = {"127.0.0.1", "::1"}


def is_loopback_request(request: Request) -> bool:
    client = request.client
    return bool(client and client.host in LOOPBACK_CLIENT_HOSTS)


def require_loopback_request(request: Request) -> None:
    if is_loopback_request(request):
        return

    raise HTTPException(
        status_code=403,
        detail="This server setup action is only available from the local server machine.",
    )
