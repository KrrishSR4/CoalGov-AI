import { useState } from "react";
import {
  Download,
  Plus,
  ArrowRight,
  LockKeyhole,
  Pickaxe,
  MessageSquare,
} from "lucide-react";
import { api, post, download, fullDate, label, ApiError } from "./api";
import {
  useApp,
  useResource,
  PageTitle,
  Status,
  Loading,
  Empty,
  ErrorBox,
  Modal,
  Field,
  FormDialog,
} from "./ui";

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const number = (x: any) =>
  Number(x || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const productionWriters = ["admin", "official", "officer"];
const grievanceCategories = [
  "Wages",
  "Working conditions",
  "Facilities",
  "Conduct",
  "Contract",
  "Other",
];

function query(values: Record<string, any>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== "" && value != null) params.set(key, String(value));
  });
  return "?" + params.toString();
}
async function operation(
  id: string,
  kind: string,
  payload: any,
  entity_id?: string,
) {
  const response = await post("/sync", {
    operations: [
      { operation_id: id, kind, payload, ...(entity_id ? { entity_id } : {}) },
    ],
  });
  const result = response.results[0];
  if (result.status !== "synced")
    throw new ApiError(result.code || 422, result.detail);
  return result.entity;
}
function Metrics({ items }: { items: [string, any, string?][] }) {
  return (
    <div className="ops-metrics">
      {items.map(([caption, value, note]) => (
        <article key={caption}>
          <span>{caption}</span>
          <strong>{value}</strong>
          {note && <small>{note}</small>}
        </article>
      ))}
    </div>
  );
}
function Pager({ offset, count, setOffset }: any) {
  return (
    <div className="ops-pager">
      <button
        className="button secondary"
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - 100))}
      >
        Previous
      </button>
      <span>
        Records {count ? offset + 1 : 0}–{offset + count}
      </span>
      <button
        className="button secondary"
        disabled={count < 100}
        onClick={() => setOffset(offset + 100)}
      >
        Next
      </button>
    </div>
  );
}

export function ProductionPage() {
  const { user, mineId, mineName, notify } = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const filters = { mine_id: mineId, date_from: from, date_to: to };
  const rows = useResource(
    "/production" + query({ ...filters, status, offset, limit: 100 }),
  );
  const totals = useResource("/production/summary" + query(filters), {});
  const d = totals.data;
  return (
    <>
      <PageTitle
        eyebrow="OPERATIONS / SHIFT REPORTING"
        title="Production reporting"
        description="Record shift output, compare it with targets, and approve figures for operational reporting."
        action={
          productionWriters.includes(user.role) && (
            <button className="button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              New shift report
            </button>
          )
        }
      />
      <ErrorBox message={rows.error || totals.error} />
      <Metrics
        items={[
          [
            "Approved coal output",
            number(d.coal_tonnes) + " t",
            "Approved reports only",
          ],
          [
            "Dispatched",
            number(d.dispatch_tonnes) + " t",
            "May include existing stock",
          ],
          [
            "Target achieved",
            d.achievement_percent == null
              ? "—"
              : number(d.achievement_percent) + "%",
            number(d.target_tonnes) + " t target",
          ],
          [
            "Awaiting review",
            d.status_counts?.submitted || 0,
            (d.status_counts?.returned || 0) + " returned for correction",
          ],
        ]}
      />
      <section className="panel">
        <div className="ops-filters">
          <Field label="From date">
            <input
              type="date"
              value={from}
              max={to || today()}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              value={to}
              max={today()}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All statuses</option>
              {["submitted", "returned", "approved"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <button
            className="button secondary"
            onClick={() =>
              download(
                "/reports/production.csv" + query({ ...filters, status }),
                "coalgov-production.csv",
              ).catch((e) => notify(e.message))
            }
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
        {rows.loading ? (
          <Loading />
        ) : rows.data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Work date / shift</th>
                  <th>Mine</th>
                  <th>Coal (t)</th>
                  <th>Dispatch (t)</th>
                  <th>Target (t)</th>
                  <th>Downtime</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.data.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        className="record-title"
                        onClick={() => setSelected(r.id)}
                      >
                        {r.work_date} · Shift {r.shift}
                      </button>
                    </td>
                    <td>{mineName(r.mine_id)}</td>
                    <td>{number(r.coal_tonnes)}</td>
                    <td>{number(r.dispatch_tonnes)}</td>
                    <td>{number(r.target_tonnes)}</td>
                    <td>{r.downtime_minutes} min</td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(r.id)}
                      >
                        Open <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No production reports in this range">
            <p>Create the first shift report for your mine.</p>
          </Empty>
        )}
        <Pager offset={offset} count={rows.data.length} setOffset={setOffset} />
      </section>
      {!!d.daily?.length && (
        <section className="panel ops-chart">
          <div className="section-heading">
            <h2>
              <Pickaxe size={17} /> Daily approved output
            </h2>
            <span className="subtle-pill">Last 14 reported days</span>
          </div>
          {d.daily.slice(-14).map((r: any) => (
            <div className="ops-chart-row" key={r.date}>
              <span>{r.date}</span>
              <div className="ops-chart-track">
                <i
                  style={{
                    width:
                      Math.min(
                        100,
                        (r.coal_tonnes /
                          Math.max(
                            ...d.daily.map((x: any) => x.coal_tonnes),
                            1,
                          )) *
                          100,
                      ) + "%",
                  }}
                />
              </div>
              <strong>{number(r.coal_tonnes)} t</strong>
            </div>
          ))}
        </section>
      )}
      <p className="method-note">
        One report per mine, date and shift. A different official must review
        submissions. Approved reports are locked; returned reports can be
        corrected by their author.
      </p>
      {adding && <ProductionForm onClose={() => setAdding(false)} />}
      {selected && (
        <ProductionDetail id={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function ProductionForm({ record, onClose }: any) {
  const { mines, mineId, refresh, notify } = useApp();
  const [id] = useState(() => crypto.randomUUID());
  const [captured] = useState(() => new Date().toISOString());
  const fields = [
    ...(!record
      ? [
          {
            name: "mine_id",
            label: "Mine",
            options: mines,
            value: mineId || mines[0]?.id,
          },
          {
            name: "work_date",
            label: "Work date (India)",
            type: "date",
            value: today(),
            max: today(),
          },
          {
            name: "shift",
            label: "Shift (8 hours)",
            options: ["A", "B", "C"],
            value: "A",
          },
        ]
      : []),
    ...[
      ["coal_tonnes", "Coal produced (tonnes)"],
      ["dispatch_tonnes", "Coal dispatched (tonnes)"],
      ["target_tonnes", "Shift target (tonnes)"],
    ].map(([name, caption]) => ({
      name,
      label: caption,
      type: "number",
      min: 0,
      max: 1000000,
      step: "0.01",
      value: record?.[name] ?? 0,
    })),
    {
      name: "downtime_minutes",
      label: "Downtime (minutes, 0–480)",
      type: "number",
      min: 0,
      max: 480,
      step: 1,
      value: record?.downtime_minutes ?? 0,
    },
    {
      name: "notes",
      label: "Shift notes",
      type: "textarea",
      value: record?.notes || "",
      required: false,
    },
  ];
  return (
    <FormDialog
      title={
        record
          ? `Correct ${record.work_date} · Shift ${record.shift}`
          : "Submit a shift report"
      }
      fields={fields}
      onClose={onClose}
      submit={record ? "Resubmit for review" : "Submit for review"}
      onSubmit={async (values: any) => {
        const payload = {
          ...values,
          downtime_minutes: Number(values.downtime_minutes),
          captured_at: captured,
          ...(record
            ? {
                mine_id: record.mine_id,
                work_date: record.work_date,
                shift: record.shift,
                version: record.version,
                latitude: record.latitude,
                longitude: record.longitude,
              }
            : {}),
        };
        await operation(
          id,
          record ? "update_production" : "create_production",
          payload,
          record?.id,
        );
        refresh();
        notify("Production report submitted for independent review.");
      }}
    />
  );
}

function ProductionDetail({ id, onClose }: any) {
  const { user, manager, mineName, userName, refresh, notify } = useApp();
  const resource = useResource("/production/" + id, null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const r = resource.data;
  if (correcting)
    return (
      <ProductionForm
        record={r}
        onClose={() => {
          setCorrecting(false);
          refresh();
        }}
      />
    );
  return (
    <Modal title="Shift production report" onClose={onClose} wide>
      <div className="form">
        <ErrorBox message={resource.error} />
        {!r ? (
          <Loading />
        ) : (
          <>
            <div className="ops-detail-head">
              <div>
                <h3>
                  {mineName(r.mine_id)} · {r.work_date} · Shift {r.shift}
                </h3>
                <p>
                  Submitted by {userName(r.created_by)} ·{" "}
                  {fullDate(r.created_at)}
                </p>
              </div>
              <Status value={r.status} />
            </div>
            <Metrics
              items={[
                ["Coal produced", number(r.coal_tonnes) + " t"],
                ["Dispatched", number(r.dispatch_tonnes) + " t"],
                ["Target", number(r.target_tonnes) + " t"],
                ["Downtime", r.downtime_minutes + " min"],
              ]}
            />
            <p className="ops-narrative">
              {r.notes || "No shift notes supplied."}
            </p>
            {r.review_note && (
              <div className="ops-callout">
                <strong>Review note</strong>
                <p className="ops-narrative">{r.review_note}</p>
              </div>
            )}
            {r.status === "returned" && r.created_by === user.id && (
              <button className="button" onClick={() => setCorrecting(true)}>
                Correct and resubmit
              </button>
            )}
            {manager &&
              r.created_by !== user.id &&
              r.status === "submitted" && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    const action =
                      (
                        (e.nativeEvent as SubmitEvent)
                          .submitter as HTMLButtonElement
                      )?.value || "approve";
                    try {
                      await post("/production/" + id + "/review", {
                        version: r.version,
                        action,
                        note,
                      });
                      refresh();
                      notify("Production review saved.");
                      setNote("");
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Field label="Review explanation">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required
                      minLength={10}
                      maxLength={10000}
                    />
                  </Field>
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                  <div className="form-actions">
                    <button
                      className="button secondary"
                      value="return"
                      disabled={busy}
                    >
                      Return for correction
                    </button>
                    <button className="button" value="approve" disabled={busy}>
                      Approve report
                    </button>
                  </div>
                </form>
              )}
            <h3>Report history</h3>
            <div className="timeline">
              {r.timeline?.map((event: any) => (
                <div className="timeline-item" key={event.sequence}>
                  <i />
                  <div>
                    <strong>
                      {label(event.action.replace("production.", ""))}
                    </strong>
                    <p>
                      {userName(event.actor_id)} · {fullDate(event.occurred_at)}
                    </p>
                    {event.payload.review_note && (
                      <small>{event.payload.review_note}</small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function GrievancesPage() {
  const { user, reporter, mineId, mineName, notify } = useApp();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useResource(
    "/grievances" + query({ mine_id: mineId, status, offset, limit: 100 }),
  );
  const totals = useResource(
    "/grievances/summary" + query({ mine_id: mineId }),
    {},
  );
  const oversight = ["management", "regulator"].includes(user.role);
  const d = totals.data;
  return (
    <>
      <PageTitle
        eyebrow="WORKFORCE / RESOLUTION"
        title="Grievance register"
        description="Raise concerns, track responses, and confirm when the resolution is satisfactory."
        action={
          reporter && (
            <button className="button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Raise a grievance
            </button>
          )
        }
      />
      <ErrorBox message={rows.error || totals.error} />
      <Metrics
        items={[
          ["Grievances", d.total || 0],
          ["Active", d.open || 0],
          ["Response overdue", d.overdue || 0],
          ["Awaiting acceptance", d.status_counts?.resolved || 0],
        ]}
      />
      <div className="ops-callout">
        <LockKeyhole size={19} />
        <p>
          {oversight
            ? "This role sees aggregate oversight. Grievance narratives are restricted to the reporter, assigned handler, and mine officials or administrators."
            : "Details are visible to you as reporter, your assigned handler, and mine officials or administrators. This service is not anonymous."}
        </p>
      </div>
      {oversight ? (
        <section className="panel ops-chart">
          <div className="section-heading">
            <h2>Grievances by category</h2>
          </div>
          {Object.entries(d.category_counts || {}).map(
            ([category, count]: any) => (
              <div className="ops-category-row" key={category}>
                <span>{category}</span>
                <strong>{count}</strong>
              </div>
            ),
          )}
          {!d.total && <Empty text="No grievances recorded" />}
        </section>
      ) : (
        <section className="panel">
          <div className="ops-filters">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All statuses</option>
                {["open", "assigned", "in_progress", "resolved", "closed"].map(
                  (x) => (
                    <option value={x} key={x}>
                      {label(x)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  "/reports/grievances.csv" +
                    query({ mine_id: mineId, status }),
                  "coalgov-grievances.csv",
                ).catch((e) => notify(e.message))
              }
            >
              <Download size={16} />
              Export register
            </button>
          </div>
          {rows.loading ? (
            <Loading />
          ) : rows.data.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Grievance</th>
                    <th>Mine</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Response target</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.data.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          className="record-title"
                          onClick={() => setSelected(r.id)}
                        >
                          {r.title}
                        </button>
                        <small className="record-meta">
                          GR-{r.id.slice(0, 8).toUpperCase()}
                        </small>
                      </td>
                      <td>{mineName(r.mine_id)}</td>
                      <td>{r.category}</td>
                      <td>
                        <Status value={r.priority} />
                      </td>
                      <td>
                        <Status value={r.status} />
                      </td>
                      <td
                        className={
                          new Date(r.due_at) < new Date() &&
                          !["resolved", "closed"].includes(r.status)
                            ? "overdue-text"
                            : ""
                        }
                      >
                        {fullDate(r.due_at)}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelected(r.id)}
                        >
                          Open <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No accessible grievances in this view" />
          )}
          <Pager
            offset={offset}
            count={rows.data.length}
            setOffset={setOffset}
          />
        </section>
      )}
      <p className="method-note">
        Response targets: normal 7 days, high 3 days, urgent 1 day. These are
        pilot service targets. The reporter accepts closure or reopens the
        issue.
      </p>
      {adding && <GrievanceForm onClose={() => setAdding(false)} />}
      {selected && (
        <GrievanceDetail id={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function GrievanceForm({ onClose }: any) {
  const { mines, mineId, refresh, notify } = useApp();
  const [id] = useState(() => crypto.randomUUID());
  const [captured] = useState(() => new Date().toISOString());
  return (
    <FormDialog
      title="Raise a grievance"
      onClose={onClose}
      submit="Submit grievance"
      fields={[
        {
          name: "mine_id",
          label: "Mine",
          options: mines,
          value: mineId || mines[0]?.id,
        },
        { name: "title", label: "Subject", minLength: 5, maxLength: 220 },
        { name: "category", label: "Category", options: grievanceCategories },
        {
          name: "priority",
          label: "Priority",
          options: ["normal", "high", "urgent"],
          value: "normal",
        },
        {
          name: "description",
          label: "What happened and what resolution do you need?",
          type: "textarea",
          minLength: 10,
        },
      ]}
      onSubmit={async (values: any) => {
        await operation(id, "create_grievance", {
          ...values,
          captured_at: captured,
        });
        refresh();
        notify("Grievance submitted. Follow its progress in the register.");
      }}
    />
  );
}

function GrievanceDetail({ id, onClose }: any) {
  const { user, manager, people, mineName, userName, refresh, notify } =
    useApp();
  const resource = useResource("/grievances/" + id, null);
  const [action, setAction] = useState("comment");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const r = resource.data;
  const actions: string[] = [];
  if (r) {
    if (r.status !== "closed") actions.push("comment");
    if (manager && !["closed", "resolved"].includes(r.status))
      actions.push("assign");
    if (
      r.assigned_to === user.id &&
      ["assigned", "in_progress"].includes(r.status)
    )
      actions.push("start", "resolve");
    if (r.created_by === user.id && r.status === "resolved")
      actions.push("close");
    if (r.created_by === user.id && ["closed", "resolved"].includes(r.status))
      actions.push("reopen");
  }
  const chosen = actions.includes(action) ? action : actions[0];
  return (
    <Modal title="Grievance details" onClose={onClose} wide>
      <div className="form">
        <ErrorBox message={resource.error} />
        {!r ? (
          <Loading />
        ) : (
          <>
            <div className="ops-detail-head">
              <div>
                <h3>{r.title}</h3>
                <p>
                  GR-{r.id.slice(0, 8).toUpperCase()} · {mineName(r.mine_id)}
                </p>
              </div>
              <Status value={r.status} />
            </div>
            <p className="ops-narrative">{r.description}</p>
            <dl className="ops-facts">
              <div>
                <dt>Reporter</dt>
                <dd>
                  {r.created_by === user.id ? "You" : userName(r.created_by)}
                </dd>
              </div>
              <div>
                <dt>Handler</dt>
                <dd>{userName(r.assigned_to)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{r.priority}</dd>
              </div>
              <div>
                <dt>Response target</dt>
                <dd>{fullDate(r.due_at)}</dd>
              </div>
            </dl>
            {r.resolution && (
              <div className="ops-callout">
                <MessageSquare size={18} />
                <div>
                  <strong>Proposed resolution</strong>
                  <p className="ops-narrative">{r.resolution}</p>
                </div>
              </div>
            )}
            {!!actions.length && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await post("/grievances/" + id + "/transition", {
                      version: r.version,
                      action: chosen,
                      note,
                      ...(chosen === "assign"
                        ? {
                            assigned_to: assignee,
                            ...(due
                              ? { due_at: new Date(due).toISOString() }
                              : {}),
                          }
                        : {}),
                    });
                    refresh();
                    setNote("");
                    notify("Grievance update saved.");
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label="Action">
                  <select
                    value={chosen}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    {actions.map((x) => (
                      <option value={x} key={x}>
                        {x === "close"
                          ? "Accept resolution and close"
                          : x === "resolve"
                            ? "Provide resolution"
                            : label(x)}
                      </option>
                    ))}
                  </select>
                </Field>
                {chosen === "assign" && (
                  <>
                    <Field label="Assigned handler">
                      <select
                        value={assignee}
                        required
                        onChange={(e) => setAssignee(e.target.value)}
                      >
                        <option value="">Select responsible staff</option>
                        {people
                          .filter(
                            (p: any) =>
                              p.id !== r.created_by &&
                              [
                                "admin",
                                "official",
                                "officer",
                                "agency",
                              ].includes(p.role) &&
                              (p.role === "admin" ||
                                p.mine_ids.includes(r.mine_id)),
                          )
                          .map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.role}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="New response target (optional, local time)">
                      <input
                        type="datetime-local"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </Field>
                  </>
                )}
                <Field label="Explanation or resolution">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    required
                    minLength={10}
                    maxLength={10000}
                  />
                </Field>
                <p className="error-text" role="alert">
                  {error}
                </p>
                <div className="form-actions">
                  <button className="button" disabled={busy}>
                    {busy ? "Saving…" : "Save update"}
                  </button>
                </div>
              </form>
            )}
            <h3>Conversation and history</h3>
            <div className="timeline">
              {r.timeline?.map((event: any) => (
                <div className="timeline-item" key={event.id}>
                  <i />
                  <div>
                    <strong>
                      {label(event.action)} ·{" "}
                      {event.actor_id === user.id
                        ? "You"
                        : userName(event.actor_id)}
                    </strong>
                    <p className="ops-narrative">{event.note}</p>
                    <small>
                      {fullDate(event.occurred_at)} ·{" "}
                      {event.integrity_verified
                        ? "Audit fingerprint verified"
                        : "Fingerprint mismatch — review required"}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
