# Docs Maintenance

Last Updated: 2026-04-04  
Owner: Engineering

## Purpose

This file defines how the tracked `docs/` folder is maintained.

`docs/` is the canonical engineering documentation set for this repository. It describes the system as it exists, not a branch plan, rollout note, or personal working area.

## What Belongs in `docs/`

Tracked canonical documentation belongs here when it describes:

1. stable system architecture
2. current runtime behavior
3. current API and payload contracts
4. setup and operations that apply to the maintained system
5. engineering standards and documentation quality rules
6. repeatable validation procedures that remain part of normal engineering work

## What Does Not Belong in `docs/`

The tracked `docs/` folder does not carry:

1. personal notes
2. branch-specific plans
3. migration diaries
4. rollout-only or customer-only notes
5. pilot-specific validation artifacts
6. temporary task boards
7. one-off handoff residue

Those materials belong outside canonical docs.

## Writing Standard

Canonical docs use these rules:

1. describe the current system in absolute terms
2. avoid rollout language such as `for now`, `temporary`, `pilot`, or `planned` unless the concept is a permanent system concept
3. keep the scope engineering-facing and implementation-oriented
4. link to the real source files when behavior depends on code
5. summarize important behavior without narrating incidental implementation detail

Reference style is defined in [`STYLE_GUIDE.md`](./STYLE_GUIDE.md).

## Folder Placement Rules

Use the top-level `docs/` structure deliberately:

1. `docs/backend/` for FastAPI, persistence, and service architecture
2. `docs/frontend/` for renderer structure and renderer-owned contracts
3. `docs/electron/` for desktop lifecycle and runtime orchestration
4. `docs/ai-pipelines/` for pipeline ownership and orchestration behavior
5. `docs/ops/` for canonical setup, runbook, and operational validation
6. `docs/testing/` for test strategy and regression expectations
7. `docs/adr/` for durable architecture decisions

Do not create ad hoc folders unless the topic is a durable part of the repository documentation structure.

## Naming Rules

Canonical doc names should:

1. reflect a stable system concern
2. avoid person-specific or rollout-specific wording
3. avoid names that imply temporary scope when the file is meant to persist

Examples of acceptable canonical names:

1. `ARCHITECTURE.md`
2. `API_SCHEMA_NOTES.md`
3. `RUNBOOK.md`
4. `SETUP_FIRST_RUN.md`
5. `TESTING_STRATEGY.md`
6. `DOCS_MAINTENANCE.md`

Examples of names that do not belong in tracked canonical docs:

1. `*_PILOT_*`
2. `*_TEMP_*`
3. `*_TODO_*`
4. `*_MY_NOTES_*`

## Update Rules

When code changes any of these, update the matching docs in the same workstream:

1. route names or payload shapes
2. runtime startup behavior
3. client/server packaging behavior
4. setup commands
5. file/folder structure that canonical docs describe
6. operational checks that are part of standard engineering validation

## Maintenance Checklist

Before finishing a docs update:

1. confirm the file still belongs in `docs/`
2. confirm links resolve
3. confirm deleted paths are removed from references
4. confirm the language describes the current system, not a rollout state
5. confirm the file name still matches its actual scope

Use [`docs/ops/DOC_QUALITY_CHECKLIST.md`](./ops/DOC_QUALITY_CHECKLIST.md) as the merge-time review checklist.
