# Cloud deployment — configuration model

This directory holds the AWS hospital-trial server stack (docker-compose +
Caddy + the cloud backend image). Configuration flows through **three layers**,
each owning a distinct kind of value. Knowing which layer to touch is the whole
point of this doc.

```
┌─ Layer A ──────────┐   ┌─ Layer B ───────────────┐   ┌─ Layer C ──────────┐
│ Terraform inputs   │   │ The generated .env      │   │ Backend schema     │
│                    │   │                         │   │                    │
│ deploy/terraform/  │──►│ deploy/cloud/.env       │──►│ backend/app/core/  │
│   tenants/*.tfvars │   │ (written on the EC2 by  │   │   config.py        │
│   variables.tf     │   │  bootstrap.sh; read by  │   │ (pydantic Settings │
│   user_data.tftpl  │   │  docker-compose)        │   │  + safe defaults)  │
└────────────────────┘   └─────────────────────────┘   └────────────────────┘
   per-tenant + secrets      single source of runtime      typed contract +
   (infra provisioning)      config for the containers     on-prem fallbacks
```

## The one rule

- **Runtime config change** (a value the running containers read) → edit the
  **`.env` template**: add it to [`.env.example`](.env.example), render it in
  [`bootstrap.sh`](bootstrap.sh), and reference it in
  [`docker-compose.cloud.yml`](docker-compose.cloud.yml) as `KEY: "${KEY}"`.
- **Infra / per-tenant / secret change** (domain, instance size, GPU, S3 URIs,
  license keys) → edit **Terraform** (`deploy/terraform/tenants/<slug>.tfvars`).

## Layer details

### Layer A — Terraform (per-tenant + secrets)
`tenants/<slug>.tfvars` holds what differs per hospital; `variables.tf` holds
defaults. `templates/user_data.sh.tftpl` writes the per-tenant subset into
`/etc/horalix/bootstrap.env` on the instance, which `bootstrap.sh` sources.

### Layer B — the generated `.env` (single source of runtime config)
`bootstrap.sh` is the **only** thing that writes `deploy/cloud/.env`, on first
boot. It is never committed and never hand-edited (re-running bootstrap
overwrites it). `docker-compose.cloud.yml` reads only this file; it must not
hardcode app config. [`.env.example`](.env.example) is the authoritative,
documented key list and must stay in lockstep with bootstrap.sh's heredoc.

The `.env` separates **per-tenant** values (from Layer A) from **fixed cloud
defaults** (identical for every tenant, e.g. `POSTGRES_DB`, `COOKIE_SECURE`,
`LICENSE_ENFORCEMENT`).

### Layer C — backend schema (`config.py`)
Pydantic `Settings` defines the typed contract and **safe defaults for the
on-prem/local path**. The cloud `.env` overrides whatever the cloud needs.
Don't duplicate cloud values here — this layer only provides fallbacks.

## What deliberately does NOT live in `.env`

- **Internal service topology** — `DATABASE_URL`, `ORTHANC_URL`, `LLM_BASE_URL`
  point at other containers on the compose network. They are deployment-
  invariant wiring and stay inline in `docker-compose.cloud.yml`.
- **Image-intrinsic values** — `BACKEND_HOST`, `BACKEND_PORT`,
  `PYTHONUNBUFFERED` are set in [`backend.Dockerfile`](backend.Dockerfile); the
  container always binds `0.0.0.0:8000`.

## Don't reintroduce drift

- No `${VAR:-default}` fallbacks on `environment:` values — that creates a
  second home for the default. Defaults live in `.env.example` + `bootstrap.sh`.
  (The `image:` tag lines keep a `:-` fallback on purpose: an empty tag breaks
  every `docker compose` subcommand, so that's operational safety, not config.)
- No `ENV` lines in the Dockerfile for deployment config — only image-intrinsic
  values.
- `backend/.env` (local dev secrets) is excluded from the image build context
  via `backend.Dockerfile.dockerignore`.
