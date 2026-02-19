# Documentation Quality Checklist

Use this checklist before merging docs-heavy changes.

## Privacy and Audience Checks

1. No private/personal folder references in canonical docs.
2. Documentation tone is engineering-only and implementation-oriented.

## Link and Navigation Checks

1. Root `README.md` links resolve.
2. `docs/README.md` links resolve.
3. `docs/HANDBOOK.md` links resolve.
4. Deep links (`file.md#section-anchor`) resolve to target sections.
5. No references to deleted or moved paths.
6. Heading titles used as link targets are stable and unambiguous.

## File Reference Format Checks

1. Implementation-critical file mentions use clickable code links:
1. ``[`main.py`](../../backend/app/main.py)``
2. Line-specific references use `#L` anchors in the file link:
1. Example: ``[`main.ts`](../../electron/main.ts#L60)``
3. No trailing legacy hint format:
1. Do not use ``(`path:line`)`` after links.
4. No mixed reference styles within the same section.

## Consistency Checks

1. Setup instructions are not duplicated with conflicting commands.
2. API shape notes align with current backend schemas/routes.
3. Runbook commands match current scripts.
4. Frontend README does not duplicate full-stack setup details.

## Source-of-Truth Checks

1. Setup/run docs point to root README + `docs/ops/SETUP_FIRST_RUN.md`.
2. API contract changes update `docs/API_SCHEMA_NOTES.md`.
3. Active roadmap updates `docs/CURRENT_TASKS.md`.

## Repository Scope Checks

1. Canonical docs are under `docs/`.
2. Non-canonical/private directories are not referenced in canonical docs.

## Maintenance Metadata

1. Major docs include `Last Updated`.
2. Owner is clear for major docs.
