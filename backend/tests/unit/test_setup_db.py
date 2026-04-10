from app.database import setup_db


class _DummyConnection:
    def __init__(self, statements):
        self._statements = statements

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, statement):
        self._statements.append(str(statement))


class _DummyEngine:
    def __init__(self, statements):
        self._statements = statements

    def begin(self):
        return _DummyConnection(self._statements)


def test_ensure_users_last_login_column_adds_missing_column(monkeypatch):
    statements = []

    class DummyInspector:
        def get_table_names(self):
            return ["users"]

        def get_columns(self, _table_name):
            return [{"name": "id"}, {"name": "username"}]

    monkeypatch.setattr(setup_db, "inspect", lambda _engine: DummyInspector())
    monkeypatch.setattr(setup_db, "engine", _DummyEngine(statements))

    setup_db._ensure_users_last_login_column()

    assert len(statements) == 1
    assert "ADD COLUMN IF NOT EXISTS last_login_at" in statements[0]


def test_ensure_users_last_login_column_noops_when_column_present(monkeypatch):
    statements = []

    class DummyInspector:
        def get_table_names(self):
            return ["users"]

        def get_columns(self, _table_name):
            return [{"name": "id"}, {"name": "last_login_at"}]

    monkeypatch.setattr(setup_db, "inspect", lambda _engine: DummyInspector())
    monkeypatch.setattr(setup_db, "engine", _DummyEngine(statements))

    setup_db._ensure_users_last_login_column()

    assert statements == []
