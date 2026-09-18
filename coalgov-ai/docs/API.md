# API contracts

The complete request/response schemas are in `openapi.json` and the running API's `/docs` page.

Web requests use an HttpOnly session cookie and the `X-CoalGov-Client: web` header for mutations. Mobile and other clients use `Authorization: Bearer <token>`. Login is `POST /api/auth/login` with `email` and `password`. Logout revokes the stored session, including its bearer token.

| Module | Endpoints |
|---|---|
| Identity | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Users | `GET/POST /api/users`, `POST /api/users/{id}/deactivate` |
| Mines | `GET/POST /api/mines` |
| Cases | `GET/POST /api/cases`, `GET /api/cases/{id}`, `POST /api/cases/{id}/transition` |
| Offline sync | `POST /api/sync` |
| Inspections | `GET/POST /api/inspections`, `PUT /api/inspections/{id}` |
| Compliance | `GET/POST /api/compliance`, `PUT /api/compliance/{id}` |
| Permits | `GET/POST /api/permits`, `PUT /api/permits/{id}` |
| Attendance | `GET /api/attendance`, `POST /api/attendance/check-in`, `POST /api/attendance/{id}/check-out` |
| Production | `GET/POST /api/production`, `GET/PUT /api/production/{id}`, `POST /api/production/{id}/review`, `GET /api/production/summary` |
| Grievances | `GET/POST /api/grievances`, `GET /api/grievances/{id}`, `POST /api/grievances/{id}/transition`, `GET /api/grievances/summary` |
| Operational exports | `GET /api/reports/production.csv`, `GET /api/reports/grievances.csv` |
| Documents | `GET/POST /api/documents`, `GET /api/documents/{id}`, `GET /api/documents/{id}/download` |
| Assets and GIS | `GET/POST /api/assets`, `GET /api/gis`, `GET /api/gis/nearby` |
| Intelligence | `GET /api/dashboard`, `GET /api/intelligence`, `POST /api/assistant` |
| Sensors | `POST /api/telemetry`, `GET /api/sensors` |
| Integrations | `GET /api/integrations`, `POST /api/integrations/vision-events` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/{id}/read`, WebSocket `/api/ws` |
| Audit and reports | `GET /api/audit`, `GET /api/audit/verify`, `GET /api/reports/cases.csv` |
| Operations | `GET /api/health`, internal `GET /metrics` |

## Case creation

```json
{
  "mine_id": "mine-1",
  "title": "Ventilation duct requires inspection",
  "description": "A damaged duct was observed near gallery four.",
  "category": "Ventilation",
  "kind": "observation",
  "severity": 4,
  "likelihood": 3,
  "latitude": 22.31,
  "longitude": 82.59,
  "captured_at": "2026-09-14T10:00:00Z"
}
```

Use a current capture timestamp for new observations. UTC or explicit-offset timestamps are required. Both coordinates must be supplied together, or both omitted.

## State transitions

```json
{
  "version": 1,
  "action": "assign",
  "assigned_to": "user-contractor",
  "note": "Inspect and repair the duct"
}
```

Actions are `assign`, `start`, `submit_action`, `verify`, `reject`, `close`, and `reopen`. Supply the current version. Submission, verification, rejection and reopening require a meaningful note. Some actions require evidence or an independent actor. Roles alone do not override these requirements.

## Offline synchronization

```json
{
  "operations": [
    {
      "operation_id": "9f8844f2-144b-4745-bd40-fda5ad565f15",
      "kind": "transition_case",
      "entity_id": "case-001",
      "payload": {
        "version": 2,
        "action": "start"
      }
    }
  ]
}
```

Supported kinds are `create_case`, `transition_case`, `update_inspection`, `create_production`, `update_production`, `create_grievance`, and `transition_grievance`. Batches accept up to 50 operations. Always inspect **each** returned `results` item. A successful HTTP response can contain conflicts or validation errors alongside successful items.

An identical operation ID/body retry returns the same receipt. A changed body requires a new operation ID. Version conflicts include current data when available. Never automatically overwrite it.

The production/grievance fields, roles, transitions and filters are described in [the operations guide](OPERATIONS.md). Production amounts accept at most two decimal places. Shift keys are unique per mine and date. Grievance detail access is narrower than general mine access; management/regulator roles use the aggregate summary.

## Documents

Uploads use multipart form fields `mine_id`, optional `case_id`, `purpose`, optional `upload_id`, and `file`. Allowed purposes are `observation`, `corrective_action`, `verification`, and `compliance`. Use a stable `upload_id` for retries. Maximum file size is 10 MB; supported formats are TXT, PDF, PNG and JPEG. PDFs have a 40-page limit; at most five scanned pages are sent through OCR per document.

Original documents are downloadable only after authorization and SHA-256 verification. OCR text is evidence for review, not an automatic compliance result.

## Error conventions

- `401`: no valid session, expired/revoked token, or incorrect login.
- `403`: role, mine, actor, origin or request-header restriction.
- `404`: missing record.
- `409`: stale version, duplicate/conflicting identifier, or invalid state transition.
- `422`: invalid fields, missing evidence, or unsuitable role/relationship.
- `429`: login/request throttling.

Case listing supports `mine_id`, `status`, `q`, `offset`, and `limit` (up to 1000). Other lists use documented bounded views suitable for the pilot. Introduce cursor pagination and retention policies before operating at large scale.
