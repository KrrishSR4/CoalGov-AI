# Deployment, security and recovery

## Local development

The Windows setup uses SQLite and local evidence files. It does not require Docker, WSL, cloud keys, or a language model. Run the reminder script separately if you want deadline scans while developing. The first dependency installation requires internet access.

The Docker setup uses PostgreSQL/PostGIS, Redis, Celery, local evidence volumes, React and NGINX. This deployment can run on a Linux VM from your chosen cloud provider. No cloud account, public hostname, TLS certificate, or remote backend was supplied; the source package is not a deployed live service.

## Prepare a real deployment

1. Use a new database, `SEED_DEMO=false`, a random `JWT_SECRET` of at least 32 characters, and strong database/Grafana credentials. Production startup rejects the development secret or enabled demo seeding.
2. Put the gateway behind trusted HTTPS termination. Set `APP_ENV=production`, `COOKIE_SECURE=true`, and `ALLOWED_ORIGINS` to the exact public app origin. Keep web and API under the same origin for the HttpOnly cookie flow.
3. Run `python -m app.migrate` once before serving traffic. Then run `python -m app.create_admin` in the backend environment to create the first administrator using an interactive password prompt.
4. Add mines, approved boundaries, users and mine assignments. Add a reviewed obligation catalog with official references; the sample obligation text is not a statutory catalog.
5. Configure the evidence backend. Keep it private and encrypted at rest through your storage/database platform. The local pilot does not add custom disk encryption.
6. Keep database, Redis and metrics services on private networks. Restrict database privileges and separate migration privileges from runtime privileges as part of deployment hardening. The demonstration compose file uses one database owner for simplicity.
7. Configure email/SMS only after validating contacts and provider behavior. Keep one default notification delivery worker or add durable multi-worker delivery claims before scaling it out.
8. Complete real-device, PostgreSQL, load, recovery and operational acceptance testing. Qualify any predictive model with appropriate data and expert review before using it for safety decisions.

Client GPS and capture times are reported by the device. They are not proof against location spoofing or a manipulated device clock. Receipt time, actor identity and audit history provide additional traceability. Browser WebSockets update on a ten-second cycle.

The native app permits HTTP for the local development setup. Build a production variant that uses HTTPS and disables cleartext transport before distribution. Protect field devices with a screen lock and storage encryption; SQLite snapshots are not separately encrypted by this pilot.

## Migrations

The initial schema lives in Alembic revision `0001_initial`. The current head is `0002_operations`, which adds production reports, grievances and grievance history. Run the setup script again or `python -m app.migrate` after updating the source. See [the v1.1.0 upgrade guide](OPERATIONS.md#upgrade-an-existing-installation). For later changes, update the SQLAlchemy models, generate a new revision, review it and test it against a backup. Do not modify an applied migration. `create_all` alone does not migrate existing columns.

```bash
python -m alembic revision --autogenerate -m "describe schema change"
python -m alembic upgrade head
```

The baseline downgrade deliberately refuses to delete governance/audit records. Restore a verified backup for rollback instead.

## Backup

From the project root, with Docker services running:

```bash
python scripts/backup.py
```

This writes a PostgreSQL custom-format dump, an evidence archive and an audit checkpoint into a timestamped `backups/` folder. Copy that directory to protected off-site storage. Quiesce writes first if you require one coordinated point across the database and evidence files; otherwise the sequential backup can span writes. For R2, use bucket versioning/backup and export a consistent object manifest instead of relying on the local evidence archive.

The script is a backup producer, not proof of a working recovery process. Regularly restore into a separate environment and verify record counts, evidence hashes, access boundaries and the audit chain.

## Restore procedure

1. Stop application writers, including the backend, scheduler and worker.
2. Create an isolated replacement database and restore `database.dump` with `pg_restore` using the appropriate database owner.
3. Extract `evidence.tar.gz` into the replacement evidence directory, retaining ownership readable by the backend. For R2, restore the corresponding private objects.
4. Point a staging backend at the restored database/evidence store. Do not seed demo data.
5. Verify `/api/audit/verify` and compare its head hash with the retained checkpoint; download representative evidence and inspect actual records.
6. Switch traffic only after the recovery checks and operational review pass.

Do not restore over the only available copy of the database or evidence. The project does not run destructive restore commands automatically.

## Troubleshooting

| Symptom | Check |
|---|---|
| `python` or `npm` not recognized | Install Python 3.12 / Node 22 and reopen the terminal. |
| Login says incorrect password | Use the demo password only on a seeded demo database. Changing `DEMO_PASSWORD` does not reset existing users. |
| Database table missing | Run `python -m app.migrate` from `backend/` with the same environment as the server. |
| Browser requests fail | Start backend and web separately; keep `VITE_API_URL` empty for the supplied proxy setup. |
| Mobile cannot connect | Use your PC's LAN IP, not phone localhost; check private-network firewall rules and Wi-Fi. |
| Expo Go rejects SDK version | Use a compatible client or create a development build for the pinned SDK. |
| OCR unavailable | Install Tesseract or use the backend Docker image. Inspect the original file and extraction status. |
| Notifications absent | Run the local scheduler or the Docker worker/scheduler; verify deadlines and assignments. |
| 409 after offline sync | Review the current server record; do not reuse an acknowledged operation ID with changed content. |
| Map background absent | OpenStreetMap tiles require internet. Asset and observation coordinates remain stored locally/server-side. |
