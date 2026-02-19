# Testing Strategy

Last Updated: 2026-02-17  
Owner: Engineering

## Scope

Testing approach across frontend, backend, and regression-sensitive workflows.

## 1) Frontend Testing

Current baseline:

1. Jest + React Testing Library with a hybrid layout:
1. Integration tests in [`frontend/src/__tests__/integration/`](../../frontend/src/__tests__/integration/).
2. Feature tests co-located near source in [`frontend/src/features/`](../../frontend/src/features/).
2. Shared test environment setup in [`setupTests.js`](../../frontend/src/setupTests.js#L1).

Primary commands:

```powershell
npm run test:frontend
```

Direct frontend run:

```powershell
cd frontend
$env:CI='true'
npm test -- --watchAll=false
```

## 2) Backend Testing (Pytest)

Current backend baseline:

1. Pytest configuration in [`backend/pytest.ini`](../../backend/pytest.ini#L1).
2. Unit tests in [`backend/tests/unit/`](../../backend/tests/unit/).
3. Integration contract tests in [`backend/tests/integration/`](../../backend/tests/integration/).
4. Shared fixtures and FastAPI dependency overrides in [`backend/tests/conftest.py`](../../backend/tests/conftest.py#L1).

Primary commands:

```powershell
npm run test:backend
```

Direct backend run:

```powershell
cd backend
python -m pytest -q
```

Targeted runs:

```powershell
cd backend
python -m pytest tests/unit -q
python -m pytest tests/integration -q
```

## 3) Full Test Matrix

Run everything from repo root:

```powershell
npm run test:all
```

## 4) High-Risk Regression Areas

Always verify after major merges:

1. Upload flow to study materialization.
2. StudyResults polling state transitions.
3. Override edit persistence and report regeneration.
4. LLM report availability and regeneration behavior.
5. Dark mode/readability for core clinical pages.

## 5) Current Limitations

1. Backend integration coverage is currently contract-focused, not full end-to-end orchestration execution.
2. Frontend test coverage is strongest around StudyResults and should expand as Dashboard/NewStudy logic grows.
3. No centralized CI enforcement is documented yet for running `test:all` on every PR.

## 6) Suggested Regression Checklist

1. Login -> Dashboard -> New Study -> StudyResults end-to-end.
2. Run one study through all available AI sections.
3. Edit an AI measurement override and regenerate report.
4. Validate print/report rendering.
5. Run `npm run test:all`.

## 7) Documentation Sync Requirement

If test strategy or critical regression checklist changes:

1. Update this file.
2. Update related runbook/docs references in same PR.
