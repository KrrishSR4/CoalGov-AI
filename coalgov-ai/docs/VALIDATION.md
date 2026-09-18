# Validation record

Final source validation: **16 September 2026**, release **v1.1.0**.

This package is a runnable governance pilot. Validation covers the implemented application workflows; it does not certify operational mine safety or statutory compliance.

## Completed checks

| Check | Result | Scope |
|---|---|---|
| Backend regression suite | **35 passed** in 8.85 seconds | FastAPI request handling with a temporary SQLite database and seeded fictional accounts |
| Web production build | **Passed** | TypeScript compilation and Vite production bundling; 1,590 modules |
| Mobile TypeScript check | **Passed** | Expo application and offline queue source |
| Android JavaScript export | **Passed** | Expo SDK 54 Android/Hermes bundle; 630 modules, approximately 1.96 MB |
| Fresh SQLite migration | **Passed** | All migrations through `0002_operations`; 18 application tables plus Alembic version table |
| Existing SQLite upgrade | **Passed** | Upgrade from `0001_initial` to `0002_operations` preserved an existing observation and audit history; Alembic detected no model/schema differences |
| OpenAPI generation | **Passed** | 48 documented HTTP paths in `openapi.json`; some paths expose multiple methods |
| Configuration checks | **Passed** | Compose and CI YAML parsing, Python source parsing, and documentation file references |

The backend suite exercises authentication and logout, cookie mutation protection, role and mine scope, contractor access boundaries, the full corrective-action lifecycle, independent verification, required evidence, optimistic concurrency, idempotent synchronization, partial sync failures, offline inspection updates, evidence upload retries and file validation, compliance review, attendance and permits, nearby asset filtering, sensor validation and anomaly analysis, source-backed retrieval, reminder deduplication, safe CSV output, vision-event ingestion, and append-only audit checks.

The 14 added test cases cover production date/shift uniqueness, numeric/date/coordinate validation, independent review, return/correction/resubmission, approved-only totals, export escaping, role and mine boundaries, grievance privacy, handler reassignment, reporter acceptance and reopening, event fingerprints, duplicate offline retries, version conflicts, and private overdue escalation. The migration checks used an isolated SQLite database rather than overwriting a working database.

The test run produced two dependency deprecation warnings from Starlette's test client. Neither caused a test failure.

## Reproduce

After following the root README setup instructions, run these from their respective folders:

```powershell
# backend/
.venv\Scripts\python.exe -m pytest -q

# web/
npm run build

# mobile/
npm run typecheck
npx expo export --platform android --max-workers 2
```

On Linux or macOS, use `.venv/bin/python` for the backend command. The CI workflow additionally defines a PostgreSQL/PostGIS test job; that remote job has not been executed as part of this delivery.

## Verification boundaries

- The web production build was checked, but an interactive browser session was unavailable. Visual layout and interactive browser behavior still need a local review.
- The Android export is a JavaScript/Hermes bundle, not a signed APK. Camera, GPS, permissions, offline persistence across native app restarts, and iOS behavior require physical-device or emulator testing.
- Docker services and PostgreSQL/PostGIS were not run in this workspace. Their configuration and migration source are included; the executed database tests used SQLite.
- R2, SMTP, SMS, hosted language models, government services, CCTV detectors, and real IoT devices were not connected. Included adapters need the relevant configuration or external systems.
- The optional XGBoost/SHAP scripts were syntax-checked. No real mine training dataset or trained predictive model was provided, so no prediction accuracy is claimed. Runtime risk scoring is the documented rules-based baseline.
- Backup and restore procedures are supplied but need a restore rehearsal against the deployment's actual database and evidence storage.

See `FEATURE_MAP.md` for the mapping from the presentation to delivered features, and `DEPLOYMENT.md` for deployment preparation.
