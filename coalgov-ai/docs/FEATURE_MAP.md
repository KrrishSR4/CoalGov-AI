# Presentation-to-implementation map

Source: `SIH2026-CoalGovAI (2)(3).pptx`, Team MineX, SIH26024. This document distinguishes executable features from external systems, model training and deployment dependencies.

Version 1.1.0 also implements production reporting and grievance handling from the subsequently supplied problem statement.

| Presentation requirement | Implementation | Status |
|---|---|---|
| React, Tailwind, TypeScript web app | `web/src/` | Implemented |
| React Native + Expo field app | `mobile/App.tsx`, `mobile/src/` | Implemented; native device testing remains |
| Go API gateway / NGINX | `gateway/nginx.conf` | NGINX alternative implemented |
| FastAPI and WebSocket | `backend/app/main.py`, authenticated `/api/ws` | Implemented |
| PostgreSQL | SQLAlchemy models and Alembic migration, Docker database | Implemented configuration; requires runtime validation on PostgreSQL |
| PostGIS locations | Geography views, GiST expression indexes, nearby query, GeoJSON | Implemented; SQLite uses Haversine fallback |
| SQLite offline storage | Expo SQLite outbox and snapshots | Implemented |
| Role-based dashboards | Seven roles, server-side mine and action permissions | Implemented |
| User management | Admin creates/deactivates accounts and assigns mine scope | Implemented |
| Inspection management | Schedule, assigned inspector, checked results, completion, linked observations | Implemented |
| Observations, incidents, violations | `Case.kind`, risk/category/location/time, searchable case register | Implemented |
| Closed-loop corrective action | Assignment → evidence → submission → independent verification → closure/reopen | Implemented and tested |
| Statutory compliance tracking | Obligation, reference URL, deadline, owner, evidence, independent review | Implemented; authoritative rule catalog must be supplied |
| Contractor and permit management | Contractor user role, scoped work permits, precautions, approval, expiry | Implemented |
| Workforce and attendance | Mine-scoped users, one check-in per IST date, own checkout | Implemented |
| Production reporting | Mine/date/shift records, decimal tonnages, downtime, independent approval, returned-report correction, approved totals, daily trend and CSV | Implemented; web and offline mobile submission |
| Grievance handling | Restricted register, assignment, resolution, reporter acceptance/reopening, comments, target reminders and aggregate oversight | Implemented; web and offline mobile workflows |
| Geo-tagged field reporting | Browser/mobile GPS capture, server timestamp, captured timestamp | Implemented; coordinates remain client-reported |
| Offline observations and photos | Durable local files, SQLite operations, record/evidence receipts | Implemented |
| Offline conflicts and retries | Per-account operation IDs, payload hashes, versions, explicit conflict review | Implemented and server tests pass |
| Offline inspection checklists | Versioned `update_inspection` sync operations | Implemented |
| Offline corrective evidence | Upload first, then submit action, retain queue until both finish | Implemented |
| Voice input | Operating-system keyboard dictation can populate mobile text | No dedicated speech service |
| OCR / document analysis | TXT, PDF extraction, Tesseract image/scanned-page OCR, candidate dates/topics | Implemented; OCR is bounded and requires Tesseract |
| RAG / NLP assistance | Local passage retrieval with citations; optional hosted summarization | Implemented; LLM needs credentials/model setting |
| Risk scoring / explainability | Explicit severity, likelihood, recurrence and overdue contributions | Implemented rule baseline; no claimed accident probability |
| Predictive ML and SHAP | Optional temporal XGBoost experiment and SHAP scripts in `ml/` | Code supplied; real data/training/validation required |
| Anomaly detection | Robust median/MAD comparisons of recent comparable sensor readings | Implemented statistical baseline |
| Cross-mine intelligence | Recurring categories, mine comparisons, actionable review suggestions | Implemented descriptive analytics |
| CCTV / visual evidence intelligence | Validated detection events linked idempotently to reviewable cases | Adapter implemented; camera streams and detector external |
| GIS / digital twin | Mine boundaries, assets, geotagged observations, layer toggles | Implemented operational map; no 3D physics simulation |
| Cloudflare R2 storage | S3-compatible adapter, authenticated reads and SHA-256 validation | Implemented; endpoint and keys required |
| Redis cache / queue | Redis-backed Celery broker/result store | Queue implemented; no speculative shared caching layer |
| In-app notifications | Per-user durable records, read state, authenticated WebSocket delivery | Implemented |
| Reminders / escalations | Due-soon, overdue and permit-expiry scans with daily deduplication | Implemented |
| Email / SMS | SMTP and provider webhook delivery with retained status | Implemented adapters; credentials/provider needed |
| Tamper-evident audit | Serialized SHA-256 chain, DB append-only guards, verification endpoint | Implemented and tested; privileged rewrite requires external checkpoint detection |
| Reports / analytics | Dashboards, mine comparisons, escaped CSV, browser print | Implemented |
| Docker / NGINX | Compose stack, migrations, storage volumes, request limits | Configured; Docker is unavailable in this build environment |
| Prometheus / Grafana | API request metrics, latency and provisioned dashboard | Configured |
| CI/CD | SQLite and PostgreSQL test jobs; web and Android bundle validation | Workflow supplied; remote execution/deployment needs a repository |
| Backup / disaster recovery | Database/evidence backup script, audit checkpoint, recovery instructions | Implemented scripts; restoration drill required |
| AWS / Azure / GCP | Portable Docker deployment instructions | Infrastructure account/hostname not provided |
| DGMS / DigiCoal / ICCC / GPS-VTS / government APIs | Documented adapter contracts and access boundaries | Live access and mapping required |
| SSO / LDAP | Local JWT authentication is the runnable baseline | Identity-provider integration required |

The presentation proposes a safety/governance product, not a validated regulatory rule database. The sample obligations and detector events intentionally avoid inventing statutory thresholds, official live data, or predictive-accuracy claims.
