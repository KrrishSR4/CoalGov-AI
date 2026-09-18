# Production reporting and grievance handling

Added in **v1.1.0**, following the two items marked missing in the problem statement. Both modules use the existing accounts, mine permissions, notification system, audit chain, and offline synchronization protocol.

## Production reporting

Open **Production reporting** on the web, or **Production** in the mobile navigation. The mobile navigation scrolls horizontally.

A report belongs to one mine, work date in India, and shift A/B/C. This pilot uses three eight-hour shift labels; map them to the site's actual start times operationally. Fields include coal produced, coal dispatched, target tonnage, downtime, notes, author, timestamps, and optional mobile GPS coordinates. Tonnages accept nonnegative decimals with at most two decimal places. Downtime accepts whole minutes from 0 to 480. Future work dates are rejected.

Only one report can exist per mine/date/shift. A duplicate returns a conflict with the existing record for review. Dispatch may exceed the shift's production because it can include previously available stock; stock-ledger and weighbridge reconciliation are outside this module.

| Stage | Who acts | Result |
|---|---|---|
| Submit | Officer, official or admin | Report enters `submitted` |
| Return for correction | A different official or admin | Explanation recorded; report enters `returned` |
| Correct and resubmit | Original author | Figures/notes can change; mine, date and shift stay fixed |
| Approve | A different official or admin | Report enters `approved` and is locked |

Summary figures count only approved reports: production, dispatch, targets, target achievement, downtime, and daily totals. A zero target displays no achievement percentage. Status counters separately show submitted and returned reports. The web register provides mine/date/status filtering, pagination, history, and CSV export. Exports include each selected record's status.

Mobile users can submit reports or correct returned reports offline. The queue retains a durable operation ID for idempotent retries. Approval happens on the web. Duplicate-shift and stale-version conflicts remain on the device for review; approved reports cannot be silently overwritten.

**Demo:** sign in as `officer@coalgov.demo`, submit today's shift C for North Pit, then sign in as `official@coalgov.demo` to approve it. To try correction, return the report with a note first, resubmit as the officer, then approve. Fresh and upgraded demo workspaces receive two fictional shift examples without resetting existing records.

## Grievance handling

Open **Grievance register** on the web, or **Grievances** on mobile. Field users can raise a concern with a subject, description, category, priority, mine, timestamp, and optional GPS. Categories are Wages, Working conditions, Facilities, Conduct, Contract, and Other.

The reporter, assigned handler, administrators and officials responsible for that mine can read the details. Other officers, agencies and contractors cannot read unrelated grievances. Corporate management and regulators receive aggregate web oversight without grievance narratives. The service is not anonymous. Local caches remain subject to the existing device security requirements.

| Action | Permission and behavior |
|---|---|
| Submit | Field reporting roles; creates an open grievance |
| Assign / reassign | Mine official or admin; handler must be active, in scope, and different from the reporter |
| Start | Assigned handler; moves to `in_progress` |
| Resolve | Assigned handler; written resolution required |
| Accept and close | Original reporter; a resolution must exist |
| Reopen | Original reporter; resolved or closed records return to active handling |
| Comment | Authorized participants; explanation and active record required |

Response targets start at server receipt: normal seven days, high three days, urgent one day. These are pilot service targets, not statutory deadlines. Officials can adjust the target during assignment. Run the existing scheduler for reminders and overdue escalations. Unresolved overdue records notify the owner and scoped officials/admins; resolved records stop generating response-overdue reminders.

Submissions and updates create in-app notifications. Email/SMS use the existing configured adapters. Notifications identify the grievance without copying its narrative. Authorized detail views include conversation/history events with fingerprints linked to the general audit chain. General audit readers see hashes and state changes, not the discussion. Register exports contain references, categories, status and dates; they omit narratives.

Mobile creation, comments, handler start/resolution, reporter closure and reopening can be queued offline. Assignment takes place on the web. For version conflicts, review the current server record before retrying with a new operation ID. Rejected drafts display saved content and can be explicitly discarded after review. Grievance photo/file attachments are not part of this release.

**Demo:** submit a grievance as the contractor, assign it as the official, resolve it as the assigned officer, and accept closure or reopen as the contractor. A fictional assigned facilities request is also supplied in the demo workspace.

## Access summary

| Role | Production | Grievances |
|---|---|---|
| Admin | All mines; submit/review with independent-review rule | Full administration; reporter accepts closure |
| Official | Assigned mines; submit/review | Manage assigned-mine grievances |
| Officer | Assigned mines; submit and correct own returned reports | Create; read own or assigned; handle assigned records |
| Agency | Read production in assigned mines | Create; read own or assigned; handle assigned records |
| Contractor | No production access | Create/read own; accept or reopen own resolution |
| Management / regulator | Read production across mines | Aggregate oversight without narratives |

## API additions

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/production` | List or submit reports |
| `GET/PUT /api/production/{id}` | Details/history or returned-report correction |
| `POST /api/production/{id}/review` | Independent approval/return |
| `GET /api/production/summary` | Approved totals and daily trend |
| `GET /api/reports/production.csv` | Filtered operational export |
| `GET/POST /api/grievances` | Restricted list or submission |
| `GET /api/grievances/{id}` | Authorized detail and conversation |
| `POST /api/grievances/{id}/transition` | Assignment, handling, comments and reporter acceptance |
| `GET /api/grievances/summary` | Authorized aggregate counts |
| `GET /api/reports/grievances.csv` | Register metadata within detail-access scope |

Production list/summary/export accept `mine_id`, `date_from`, `date_to`; list/export additionally accept `status`. Grievance list/export accept `mine_id` and `status`. Both lists accept `offset` and `limit` (maximum 1,000; web pages use 100, mobile caches 250).

New `/api/sync` kinds: `create_production`, `update_production`, `create_grievance`, `transition_grievance`. Updates/transitions require `entity_id` and current `version`; creates do not need `entity_id`. See the regenerated OpenAPI specification for request fields.

## Upgrade an existing installation

1. Stop backend and reminder processes. Back up `backend/data/` and keep your existing environment files.
2. Extract the updated source over the project folder. The ZIP contains no database, uploads or `.env` file.
3. From the project root on Windows, run `scripts\setup.cmd`. This installs dependencies and applies revision `0002_operations`, preserving existing records.
4. Restart backend, web and optional reminder processes with the existing scripts. Restart Expo for mobile.

On Linux/macOS run `bash scripts/setup.sh`, then restart processes. For Docker:

```bash
docker compose build
docker compose stop backend worker scheduler
docker compose run --rm migrate
docker compose up -d
```

The upgrade adds `production_reports`, `grievances`, and `grievance_events`. Existing tables are not dropped or rewritten. Both migrations refuse destructive downgrade; restore a reviewed backup for rollback. The Windows dependency set explicitly includes `tzdata` for India work dates.

These additions cover the two missing modules. They do not add offline mobile attendance, official statutory report templates, a full commercial contract lifecycle, or a trained predictive model.
