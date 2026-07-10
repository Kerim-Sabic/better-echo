from app.main import app


def test_application_does_not_expose_upload_storage_as_a_static_route():
    route_paths = {getattr(route, "path", None) for route in app.routes}

    assert "/uploads" not in route_paths
