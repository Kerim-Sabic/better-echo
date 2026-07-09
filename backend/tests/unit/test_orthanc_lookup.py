import app.helpers.inference_runtime.inference_functions as fn


class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise fn.requests.HTTPError(f"status {self.status_code}")

    def json(self):
        return self._payload


def test_check_instance_uses_lookup(monkeypatch):
    calls = {}

    def fake_post(url, data=None, **_kw):
        calls["url"] = url
        calls["data"] = data
        return _Resp([{"Type": "Instance", "ID": "abc", "Path": "/instances/abc"}])

    monkeypatch.setattr(fn.requests, "post", fake_post)
    # If lookup is used, no GET scan should be needed.
    monkeypatch.setattr(fn.requests, "get", lambda *a, **k: (_ for _ in ()).throw(AssertionError("scan used")))

    assert fn.check_instance_exists_in_orthanc("1.2.3") is True
    assert calls["url"].endswith("/tools/lookup")
    assert calls["data"] == "1.2.3"


def test_check_instance_not_found_via_lookup(monkeypatch):
    monkeypatch.setattr(fn.requests, "post", lambda *a, **k: _Resp([]))
    monkeypatch.setattr(fn.requests, "get", lambda *a, **k: (_ for _ in ()).throw(AssertionError("scan used")))
    assert fn.check_instance_exists_in_orthanc("nope") is False


def test_check_instance_falls_back_to_scan_on_lookup_error(monkeypatch):
    def failing_post(*a, **k):
        raise fn.requests.RequestException("no lookup")

    scanned = {"count": 0}

    def fake_get(url, **_kw):
        scanned["count"] += 1
        if url.endswith("/instances"):
            return _Resp(["iid-1"])
        return _Resp({"MainDicomTags": {"SOPInstanceUID": "1.2.3"}})

    monkeypatch.setattr(fn.requests, "post", failing_post)
    monkeypatch.setattr(fn.requests, "get", fake_get)
    assert fn.check_instance_exists_in_orthanc("1.2.3") is True
    assert scanned["count"] >= 1


def test_fetch_study_instances_uses_lookup(monkeypatch):
    def fake_post(url, data=None, **_kw):
        assert url.endswith("/tools/lookup")
        assert data == "study-uid"
        return _Resp([{"Type": "Study", "ID": "study-orthanc-id"}])

    def fake_get(url, **_kw):
        assert "/studies/study-orthanc-id/instances" in url
        return _Resp([{"ID": "i1"}, {"ID": "i2"}])

    monkeypatch.setattr(fn.requests, "post", fake_post)
    monkeypatch.setattr(fn.requests, "get", fake_get)
    assert fn.fetch_orthanc_instance_ids_from_study("study-uid") == ["i1", "i2"]


def test_fetch_study_no_match_returns_empty(monkeypatch):
    monkeypatch.setattr(fn.requests, "post", lambda *a, **k: _Resp([{"Type": "Instance", "ID": "x"}]))
    assert fn.fetch_orthanc_instance_ids_from_study("study-uid") == []
