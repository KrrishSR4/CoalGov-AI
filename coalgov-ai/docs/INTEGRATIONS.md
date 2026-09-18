# Integrations and supplied boundaries

## Sensor ingestion

`POST /api/telemetry` accepts a mine official's bearer session or a configured `X-Telemetry-Key`. The key is server-side deployment configuration; do not embed it in a public web build. A sample body is supplied in `sample-data/telemetry.json`. Replace its timestamp with the current observation time for a live test.

Supported metric/unit pairs:

| Metric | Unit |
|---|---|
| `methane` | `%` |
| `temperature` | `C` |
| `dust` | `mg/m3` |
| `vibration` | `mm/s` |

The source/event ID pair is unique. Identical retries return the existing reading; conflicting values return 409. Asset and mine IDs must match. Anomalies compare recent observations of the same asset, metric and unit. They do not impose regulatory thresholds.

## CCTV analytics events

`POST /api/integrations/vision-events` accepts authenticated mine officials. Supply an existing camera-associated asset and an external detector event of `missing_ppe`, `restricted_zone_entry`, `smoke`, or `vehicle_proximity`. Confidence must be at least 0.7 for this adapter; lower-confidence events require prior review. This is an integration intake rule, not proof that an event occurred.

The adapter creates a reviewable observation and links it to the source event ID. It does not run a camera stream, include a trained PPE detector, or automatically mark a safety violation as proven. Source videos and trained models were not supplied with the presentation. Add them through an approved detector service, then post normalized events using the included example.

## Evidence storage

Local storage is the default. `STORAGE_BACKEND=r2` uses the configured S3-compatible endpoint and private bucket. Upload/download code is in `backend/app/services/documents.py`. Keep the bucket private; clients access evidence through the authorized API.

Changing storage backends does not migrate existing objects automatically. Transfer and verify original bytes before switching a populated workspace. The demo seed writes local evidence, so use an empty non-demo workspace for R2 deployments.

## Email and SMS

The scheduler creates durable in-app notifications without provider credentials. Email uses STARTTLS SMTP. SMS calls your configured HTTPS webhook with:

```json
{
  "to": "+910000000000",
  "text": "Notification title and body",
  "idempotency_key": "notification-uuid"
}
```

The webhook must map this contract to your approved provider, return a successful HTTP status only after accepting the message, and preferably deduplicate by `idempotency_key`. Delivery is at least once; no delivery guarantees are implied by an unconfigured provider. Use verified contact details and configure provider settings before enabling messages.

## Optional document summaries

Without a key, document retrieval remains local. To enable summaries, configure `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` for a provider that implements `/chat/completions`. The configured model receives the question and retrieved document passages. Model names and availability depend on your provider account.

The application returns source passages alongside the answer. Text inside documents is treated as untrusted data, and the model has no tools for executing actions. Outputs still require review.

## Government, enterprise identity and operational systems

DGMS, DigiCoal, ICCC, GPS/VTS, SSO/LDAP and other systems require permission, actual API contracts, identity mappings, and sample payloads. The deck names them but supplies none of those dependencies. This project does not invent endpoints or claim live integration.

For an approved integration, map external mine/asset/user identifiers to internal IDs, validate timestamps and units, use stable external event IDs, and keep the source record for traceability. Use a dedicated credential with the narrowest appropriate scope. The sensor and vision contracts demonstrate the supported ingestion pattern.

The current authentication implementation is local JWT with stored session revocation. Add an identity-provider callback only after selecting a provider and establishing its issuer, audience, key discovery and account-mapping rules.

## Technical references consulted

- [FastAPI: OAuth2, password hashing and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [Expo SDK 54: SQLite](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/)
- [Expo SDK 54: ImagePicker](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/)
- [Expo SDK 54: Location](https://docs.expo.dev/versions/v54.0.0/sdk/location/)

The presentation remains the feature/architecture source. Its research references are not used as a substitute for an approved statutory rule catalog or evidence that this implementation has been operationally validated.
