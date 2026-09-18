# CoalGov AI

**v1.1.0 update:** production reporting and grievance handling are now included on web and mobile. See [the new workflows and upgrade instructions](docs/OPERATIONS.md).

An end-to-end **runnable governance pilot** built from the supplied Team MineX presentation, *SIH2026-CoalGovAI (2)(3).pptx*, problem statement **SIH26024**.

The project includes a React web dashboard, an Expo field app, a FastAPI backend, persistent data, authenticated APIs, offline synchronization, evidence handling, corrective-action workflows, shift production approvals, and access-controlled grievance resolution.

The default workspace contains **fictional mine records**. It does not connect to real mines, government systems, or CCTV streams. Operational risk scores use explicit rules; no trained accident-prediction accuracy is claimed. See [the feature map](docs/FEATURE_MAP.md) for exactly what is implemented and what needs external configuration.

## Start on Windows without Docker or WSL

Install **Python 3.12** and **Node.js 22 LTS**. Verify `python --version` and `node --version` in a new terminal. Extract this folder to a location such as `D:\coalgov-ai` to keep the code, database, uploads, and dependencies on D:.

From the project root, run:

```powershell
.\scripts\setup.cmd
```

This creates a Python virtual environment, installs the dependencies, runs database migrations, loads the demo records, and installs the web dependencies. The first installation requires internet access.

Start these commands in **separate terminals**:

```powershell
.\scripts\start-backend.cmd
```

```powershell
.\scripts\start-web.cmd
```

Optional third terminal for automatic reminders and risk refresh:

```powershell
.\scripts\start-reminders.cmd
```

Open:

- Web dashboard: [http://localhost:5173](http://localhost:5173)
- Interactive API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health endpoint: [http://localhost:8000/api/health](http://localhost:8000/api/health)

For image and scanned PDF OCR, install **Tesseract OCR** and add its executable to PATH, or use the Docker setup. Plain text and text-based PDF extraction work without Tesseract. If OCR is unavailable, original evidence is still preserved and the extraction status explains the problem.

The SQLite database and uploaded evidence live in `backend/data/`. Keep that directory to preserve local work. Do not delete it when updating the code.

## Demo accounts

All demo accounts use password **`MineX-Demo-2026!`**. These credentials exist only when `SEED_DEMO=true` initializes an empty database. Demo role buttons on the web login fill the fields for you.

| Role | Email | Access |
|---|---|---|
| Administrator | `admin@coalgov.demo` | All mines, users, oversight, workflow administration |
| Mine official | `official@coalgov.demo` | Assigned mines, assignments, reviews, permits, closure |
| Field officer | `officer@coalgov.demo` | North Pit reporting, inspections, assigned actions |
| Contractor | `contractor@coalgov.demo` | North Pit, own/assigned cases, own permits and attendance |
| Third-party agency | `agency@coalgov.demo` | North Pit inspections and independent verification |
| Corporate management | `management@coalgov.demo` | Read access across mines, analytics and exports |
| Regulator | `regulator@coalgov.demo` | Read access across mines, audit verification |

`North Pit`, `East Extension`, and `South Block` are fictional demonstration mines. Their coordinates and boundaries are illustrative.

## Try the complete workflow

1. Sign in as the **officer**. Report an observation in North Pit. Add a title, description, category, severity, and likelihood. GPS is optional on the web.
2. Sign out and sign in as the **official**. Open the observation, choose **assign**, and select **Ravi Kumar (contractor)**.
3. Sign in as the **contractor**. Open the assigned case. In **Evidence**, select **Corrective action** and upload `sample-data/corrective-action.txt` or a photo.
4. In **Details**, choose **submit action** and describe the work. The server requires evidence and records the submitter.
5. Sign in as the **official** or **agency**. Choose **verify** and add the independent verification note. The action submitter cannot verify their own work.
6. Sign in as the **official** and choose **close**. The record now includes the action, verifier, closure timestamp, evidence fingerprint, and audit history.
7. Sign in as **admin** and use **Audit trail → Verify audit chain**.

Other flows: schedule an inspection and complete its checklist; create a compliance obligation, upload supporting evidence and submit it for independent review; request and approve a contractor permit; check in and out; inspect the GIS map; search document evidence; export accessible cases as CSV.

**Production:** submit a shift report as the officer, then approve or return it as the official. Approved totals appear in Production reporting. Returned reports can be corrected and resubmitted by their author.

**Grievances:** submit a concern as the contractor, assign it as the official, resolve it as the assigned officer, and accept closure as the contractor. Details stay within the reporter/handler/official access scope; management and regulators see aggregate counts.

## Run the mobile field app

In another terminal:

```powershell
cd mobile
copy .env.example .env
npm ci
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer's LAN address, for example `http://192.168.1.10:8000`. You can also enter the address on the app's login screen. Use `ipconfig` on Windows to find your IPv4 address. Your physical phone and computer must be on the same Wi-Fi, and the Windows firewall must allow the backend on your private network. The backend script listens on `0.0.0.0` for this purpose. Android Emulator uses `http://10.0.2.2:8000`.

The app targets **Expo SDK 54 / React Native 0.81**. Use a compatible Expo Go client or a development build. A newer Expo Go client may no longer open SDK 54 projects. For a local Android development build, install Android Studio and run `npx expo run:android`. An optional EAS configuration is included for building an APK with your own Expo account. No signed APK or iOS binary is included.

The mobile app supports:

- Sign-in with tokens stored in Expo SecureStore.
- Cached mine, observation, and inspection records partitioned by server and account.
- GPS permission and location capture.
- Camera photos copied into persistent app storage.
- Offline observation creation, incident reporting, corrective action notes/photos, and inspection checklist updates.
- Offline production submissions/corrections and grievance submissions, comments, resolutions, closure and reopening.
- SQLite queues that retain operations until the server confirms them.
- Idempotent retries and explicit stale-version conflict review.

**Offline demo:** sign in and refresh once; disable your phone's connection; save an observation with a photo and GPS; reopen the app while offline; inspect the queue; reconnect and press **Sync drafts**. Both the case and photo must be confirmed before the draft is removed. Photos are cleaned up only after confirmation.

Assignment, compliance review, independent verification, and closure use the web dashboard. Voice dictation, if desired, can use the phone keyboard's dictation feature; the app does not include a separate speech-recognition service.

## Docker: PostgreSQL, PostGIS, Redis, Celery and NGINX

From the project root:

```powershell
copy .env.example .env
docker compose up --build -d
```

Open [http://localhost:8080](http://localhost:8080). The gateway serves the React app and forwards `/api` to FastAPI. A one-time migration container initializes PostgreSQL/PostGIS. Redis supports Celery; the scheduler creates reminders and escalations every minute. The worker processes notification delivery. Evidence and database volumes persist across container restarts.

```powershell
docker compose logs -f backend worker scheduler
docker compose --profile monitoring up -d
```

Grafana is available locally at [http://localhost:3001](http://localhost:3001), username `admin`, password `GRAFANA_PASSWORD` from `.env`. It includes request volume, API latency, and scrape-health panels. Prometheus and database services are not exposed publicly by the compose file.

The default gateway is the **NGINX option from slide 3**. FastAPI remains authoritative for JWT validation, session revocation, role checks, and mine scope. This package does not add a second Go authentication implementation.

## Linux / macOS manual setup

```bash
bash scripts/setup.sh
cd backend
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In another terminal, run `cd web && npm run dev`. In an optional third terminal, run `cd backend && .venv/bin/python -m app.scheduler_local`.

## Optional integrations

Configure only the integrations you will use. Do not put secret keys in the web or mobile environment files.

| Integration | Configuration |
|---|---|
| Cloudflare R2 | Set `STORAGE_BACKEND=r2`, endpoint, bucket and server-side access keys. Evidence downloads still pass through authorization and integrity checks. |
| Email | Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional SMTP credentials. Delivery uses STARTTLS. |
| SMS | Supply an HTTPS `SMS_WEBHOOK_URL` and token for an approved provider adapter. See the payload contract in `docs/INTEGRATIONS.md`. |
| Document summarization | Set `LLM_API_KEY`, an OpenAI-compatible `LLM_BASE_URL`, and `LLM_MODEL`. Without these, local TF-IDF retrieval returns source passages. |
| IoT | Post validated readings to `/api/telemetry` using a configured `X-Telemetry-Key` or mine official's session. |
| CCTV / computer vision | Send reviewed, standardized detections to `/api/integrations/vision-events`. A detector and camera access must be supplied externally. |
| Learned risk prediction | Optional XGBoost training and SHAP explanation scripts are in `ml/`. No real training data or trained safety model was provided. |
| Government systems and SSO | Require approved access, API contracts and identity-provider configuration. See the integration boundary document. |

If you enable a hosted language model, relevant document passages and your question are sent to that provider. Keep the key unset for fully local document retrieval.

## Tests and project guide

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
cd ..\web
npm run build
cd ..\mobile
npm run typecheck
npx expo export --platform android --max-workers 2
```

- [Architecture and data model](docs/ARCHITECTURE.md)
- [Production, grievances and upgrade guide](docs/OPERATIONS.md)
- [Presentation feature map](docs/FEATURE_MAP.md)
- [API and workflow contracts](docs/API.md)
- [External integrations](docs/INTEGRATIONS.md)
- [Deployment and recovery](docs/DEPLOYMENT.md)
- [Validation results and limits](docs/VALIDATION.md)
- [OpenAPI specification](docs/openapi.json)

## Project layout

| Folder | Purpose |
|---|---|
| `web/` | React, TypeScript, Tailwind, Leaflet dashboard |
| `mobile/` | Expo field app, SecureStore, camera/GPS and SQLite outbox |
| `backend/app/routers/` | Authenticated HTTP API modules |
| `backend/app/services/` | Workflow rules, risk, evidence, audit and inspections |
| `backend/alembic/` | Versioned database migration |
| `backend/tests/` | Workflow, security, evidence and sync regression tests |
| `gateway/` | NGINX routing, request limits and WebSocket forwarding |
| `infra/` | Prometheus and Grafana configuration |
| `ml/` | Optional supervised risk experiment and SHAP explanation |
| `scripts/` | Windows/local startup and Docker backup helpers |
| `sample-data/` | Clearly labeled evidence and integration examples |

This pilot still needs approved statutory rules, real integrations, deployment credentials, a qualified operational review, and testing on actual field devices before use in a working mine.
