import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  CloudUpload,
  Download,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { api, post, date, fullDate, label, download } from "./api";
import {
  useApp,
  useResource,
  PageTitle,
  SearchInput,
  Status,
  Risk,
  Modal,
  Field,
  ErrorBox,
  Empty,
  Loading,
} from "./ui";
import { saveDraft, queued, removeDraft } from "./outbox";

export const categories = [
  "Ventilation",
  "Electrical",
  "Environment",
  "Equipment",
  "Workforce",
  "Fire",
  "Transport",
  "Other",
];
export function CasesPage() {
  const { mineId, report, reporter, openCase, mineName } = useApp();
  const { data, loading, error } = useResource(
    "/cases" + (mineId ? "?mine_id=" + mineId : ""),
  );
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = data.filter(
    (c: any) =>
      (status === "all" || c.status === status) &&
      (c.title + " " + c.category).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="OBSERVE / ACT / VERIFY"
        title="Observations & actions"
        description="Follow every field observation through to independent verification."
        action={
          reporter && (
            <button className="button" onClick={() => report()}>
              <Plus size={17} />
              Report observation
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      <section className="panel">
        <div className="table-toolbar">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search observations or categories…"
          />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {[
              "open",
              "assigned",
              "in_progress",
              "pending_verification",
              "verified",
              "closed",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="toolbar-count">{filtered.length} records</span>
        </div>
        {loading ? (
          <Loading />
        ) : filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Observation</th>
                  <th>Mine</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="record-title"
                        onClick={() => openCase(c.id)}
                      >
                        {c.title}
                      </button>
                      <small className="record-meta">
                        {c.category} · {label(c.kind)}
                      </small>
                    </td>
                    <td>{mineName(c.mine_id)}</td>
                    <td>
                      <Risk score={c.risk_score} />
                    </td>
                    <td>
                      <Status value={c.status} />
                    </td>
                    <td>{date(c.due_at)}</td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={"Open " + c.title}
                        onClick={() => openCase(c.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No matching observations" />
        )}
      </section>
    </>
  );
}

export function ReportForm({ onClose, inspection = {}, draft = null }: any) {
  const { user, mines, mineId, notify, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gps, setGps] = useState<any>(
    draft?.payload.latitude != null
      ? { latitude: draft.payload.latitude, longitude: draft.payload.longitude }
      : null,
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  return (
    <Modal title="Report a field observation" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const values: any = Object.fromEntries(new FormData(e.currentTarget));
          const op = {
            operation_id: crypto.randomUUID(),
            kind: "create_case",
            user_id: user.id,
            payload: {
              ...values,
              severity: Number(values.severity),
              likelihood: Number(values.likelihood),
              latitude: gps?.latitude ?? null,
              longitude: gps?.longitude ?? null,
              captured_at:
                draft?.payload.captured_at || new Date().toISOString(),
              ...(draft?.payload.inspection_id
                ? { inspection_id: draft.payload.inspection_id }
                : {}),
              ...(inspection.id ? { inspection_id: inspection.id } : {}),
            },
            created_at: new Date().toISOString(),
          };
          try {
            await saveDraft(op, draft?.operation_id);
            if (navigator.onLine) {
              try {
                const r = await post("/sync", {
                  operations: [
                    {
                      operation_id: op.operation_id,
                      kind: op.kind,
                      payload: op.payload,
                    },
                  ],
                });
                if (r.results[0].status === "synced") {
                  await removeDraft(op.operation_id);
                  notify(
                    "Observation recorded. Its corrective action can now be assigned.",
                  );
                } else {
                  await saveDraft({
                    ...op,
                    error: JSON.stringify(r.results[0].detail),
                  });
                  notify(
                    "Saved to offline drafts. Review the validation message before syncing.",
                  );
                }
              } catch (e: any) {
                notify(
                  "Draft saved on this device. Sync it when the server is reachable.",
                );
              }
            } else notify("Offline draft saved on this device.");
            refresh();
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="form-intro">
          Record what you observed. You can attach photos or documents from the
          case after it syncs.
        </p>
        <Field label="Mine">
          <select
            name="mine_id"
            required
            defaultValue={
              draft?.payload.mine_id || inspection.mine_id || mineId || ""
            }
          >
            <option value="">Select mine</option>
            {mines.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observation title">
          <input
            name="title"
            defaultValue={draft?.payload.title || ""}
            minLength={5}
            maxLength={220}
            required
            placeholder="e.g. Damaged ventilation duct at gallery 4"
          />
        </Field>
        <div className="form-row">
          <Field label="Category">
            <select
              name="category"
              defaultValue={draft?.payload.category || "Ventilation"}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Record type">
            <select
              name="kind"
              defaultValue={draft?.payload.kind || "observation"}
            >
              <option value="observation">Observation</option>
              <option value="violation">Violation</option>
              <option value="incident">Incident</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            name="description"
            defaultValue={draft?.payload.description || ""}
            minLength={10}
            maxLength={10000}
            required
            placeholder="Describe the condition, its location, and who may be affected."
          />
        </Field>
        <div className="form-row">
          <Field label="Severity (1 low – 5 severe)">
            <select name="severity" defaultValue={draft?.payload.severity || 3}>
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Likelihood (1 unlikely – 5 likely)">
            <select
              name="likelihood"
              defaultValue={draft?.payload.likelihood || 3}
            >
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="location-capture">
          <MapPin size={20} />
          <span>
            {gps
              ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
              : "Location has not been captured"}
          </span>
          <button
            type="button"
            className="text-button"
            disabled={gpsBusy}
            onClick={() => {
              if (!navigator.geolocation) {
                setError("GPS is unavailable in this browser.");
                return;
              }
              setGpsBusy(true);
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  setGps(p.coords);
                  setGpsBusy(false);
                },
                (e) => {
                  setError(e.message);
                  setGpsBusy(false);
                },
                { enableHighAccuracy: true, timeout: 15000 },
              );
            }}
          >
            {gpsBusy ? "Locating…" : "Capture GPS"}
          </button>
        </div>
        <div className="info-note">
          <WifiOff size={17} />
          Drafts stay on this device until they receive a server receipt.
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save observation"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CaseDetail({ caseId, onClose }: any) {
  const { user, people, manager, refresh, notify, userName, mineName } =
    useApp();
  const { data: c, error } = useResource("/cases/" + caseId, null);
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [tab, setTab] = useState("details");
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("observation");
  if (!c)
    return (
      <Modal title="Observation" onClose={onClose}>
        {error ? <ErrorBox message={error} /> : <Loading />}
      </Modal>
    );
  const actions = [];
  if (manager && ["open", "assigned", "in_progress"].includes(c.status))
    actions.push("assign");
  if (
    c.assigned_to === user.id &&
    ["assigned", "in_progress"].includes(c.status)
  )
    actions.push("start", "submit_action");
  if (
    ["admin", "official", "officer", "agency"].includes(user.role) &&
    c.assigned_to !== user.id &&
    c.action_by !== user.id &&
    c.status === "pending_verification"
  )
    actions.push("verify", "reject");
  if (manager && c.status === "verified") actions.push("close");
  if (manager && ["closed", "verified"].includes(c.status))
    actions.push("reopen");
  const currentAction = actions.includes(action) ? action : actions[0] || "";
  const stages = [
    "open",
    "assigned",
    "in_progress",
    "pending_verification",
    "verified",
    "closed",
  ];
  return (
    <Modal title="Observation detail" onClose={onClose} wide>
      <div className="case-detail">
        <div className="case-heading">
          <div>
            <span className="eyebrow">
              {c.id.slice(0, 8).toUpperCase()} / {mineName(c.mine_id)}
            </span>
            <h2>{c.title}</h2>
            <p>
              {c.category} · Reported {fullDate(c.captured_at)}
            </p>
          </div>
          <Risk score={c.risk_score} />
        </div>
        <div className="case-status-row">
          <Status value={c.status} />
          <span>
            Assigned to <strong>{userName(c.assigned_to)}</strong>
          </span>
          <span>Due {fullDate(c.due_at)}</span>
        </div>
        <div className="workflow-stages">
          {stages.map((s, i) => (
            <div
              key={s}
              className={stages.indexOf(c.status) >= i ? "reached" : ""}
            >
              <i>{i + 1}</i>
              <span>
                {label(
                  s === "pending_verification"
                    ? "verification"
                    : s === "in_progress"
                      ? "action"
                      : s,
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="tabs" role="tablist">
          {["details", "evidence", "audit history"].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "evidence" ? " (" + c.evidence.length + ")" : ""}
            </button>
          ))}
        </div>
        {tab === "details" ? (
          <>
            <p className="case-description">{c.description}</p>
            <div className="reason-panel">
              <h3>Why this risk score?</h3>
              {c.risk_reasons.map((r: any) => (
                <div key={r.factor}>
                  <span>
                    <strong>{r.factor}</strong>
                    <small>{r.detail}</small>
                  </span>
                  <b>+{r.points}</b>
                </div>
              ))}
              <p>
                Transparent prioritization rules. This score is not an accident
                probability.
              </p>
            </div>
            {c.action_text && (
              <div className="detail-note">
                <h3>Corrective action</h3>
                <p>{c.action_text}</p>
                <small>Submitted by {userName(c.action_by)}</small>
              </div>
            )}
            {c.verification_note && (
              <div className="detail-note">
                <h3>Verification record</h3>
                <p>{c.verification_note}</p>
                <small>{userName(c.verified_by)}</small>
              </div>
            )}
            {currentAction && (
              <form
                className="action-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setFormError("");
                  const f: any = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  const payload: any = {
                    version: c.version,
                    action: currentAction,
                    note: f.note || "",
                  };
                  if (currentAction === "assign") {
                    payload.assigned_to = f.assigned_to;
                    if (f.due_at)
                      payload.due_at = new Date(f.due_at).toISOString();
                  }
                  try {
                    await post("/cases/" + c.id + "/transition", payload);
                    notify("Case updated and audit event recorded.");
                    refresh();
                  } catch (e: any) {
                    setFormError(e.message);
                    if (e.status === 409) refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3>Next action</h3>
                <Field label="Action">
                  <select
                    value={currentAction}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    {actions.map((a) => (
                      <option key={a} value={a}>
                        {label(a)}
                      </option>
                    ))}
                  </select>
                </Field>
                {currentAction === "assign" && (
                  <div className="form-row">
                    <Field label="Assign to">
                      <select
                        name="assigned_to"
                        required
                        defaultValue={c.assigned_to || ""}
                      >
                        <option value="">Choose owner</option>
                        {people
                          .filter(
                            (p: any) =>
                              [
                                "admin",
                                "official",
                                "officer",
                                "contractor",
                                "agency",
                              ].includes(p.role) &&
                              (p.role === "admin" ||
                                p.mine_ids.includes(c.mine_id)),
                          )
                          .map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.role})
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="New deadline (optional)">
                      <input type="datetime-local" name="due_at" />
                    </Field>
                  </div>
                )}
                {["submit_action", "verify", "reject", "reopen"].includes(
                  currentAction,
                ) && (
                  <Field
                    label={
                      currentAction === "submit_action"
                        ? "Corrective work completed"
                        : "Review note"
                    }
                  >
                    <textarea
                      name="note"
                      minLength={10}
                      maxLength={10000}
                      required
                      placeholder="Document your findings and supporting evidence."
                    />
                  </Field>
                )}
                {currentAction === "submit_action" && (
                  <p className="info-note">
                    Attach corrective-action evidence in the Evidence tab before
                    submitting.
                  </p>
                )}
                {formError && (
                  <p role="alert" className="error-text">
                    {formError}
                  </p>
                )}
                <button className="button" disabled={busy}>
                  {busy ? "Saving…" : label(currentAction)}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
          </>
        ) : tab === "evidence" ? (
          <>
            <div className="evidence-list">
              {c.evidence.length ? (
                c.evidence.map((e: any) => (
                  <div className="evidence-row" key={e.id}>
                    <FileIcon />
                    <div>
                      <strong>{e.filename}</strong>
                      <span>
                        {label(e.purpose)} · {(e.size / 1024).toFixed(1)} KB
                      </span>
                      <small>SHA-256: {e.sha256.slice(0, 18)}…</small>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label={"Download " + e.filename}
                      onClick={() =>
                        download(
                          "/documents/" + e.id + "/download",
                          e.filename,
                        ).catch((e) => notify(e.message))
                      }
                    >
                      <Download size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <Empty text="No evidence attached" />
              )}
            </div>
            {c.status !== "closed" &&
              ["admin", "official", "officer", "agency", "contractor"].includes(
                user.role,
              ) && (
                <form
                  className="action-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!file) return;
                    setBusy(true);
                    setFormError("");
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("mine_id", c.mine_id);
                    fd.append("case_id", c.id);
                    fd.append("purpose", purpose);
                    try {
                      await api("/documents", { method: "POST", body: fd });
                      setFile(null);
                      refresh();
                      notify("Evidence uploaded and fingerprinted.");
                    } catch (e: any) {
                      setFormError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h3>Attach evidence</h3>
                  <Field label="Evidence purpose">
                    <select
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      <option value="observation">Observation</option>
                      {c.assigned_to === user.id && (
                        <option value="corrective_action">
                          Corrective action
                        </option>
                      )}
                      <option value="verification">Verification</option>
                    </select>
                  </Field>
                  <Field label="Photo or document (maximum 10 MB)">
                    <input
                      type="file"
                      accept=".pdf,.txt,.png,.jpg,.jpeg"
                      required
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </Field>
                  {formError && (
                    <p role="alert" className="error-text">
                      {formError}
                    </p>
                  )}
                  <button className="button" disabled={busy || !file}>
                    <CloudUpload size={17} />
                    {busy ? "Uploading and extracting…" : "Upload evidence"}
                  </button>
                </form>
              )}
          </>
        ) : (
          <div className="timeline">
            {c.timeline.map((e: any) => (
              <div className="timeline-item" key={e.sequence}>
                <i />
                <div>
                  <strong>{e.action.replaceAll(".", " / ")}</strong>
                  <p>
                    {userName(e.actor_id)} · {fullDate(e.occurred_at)}
                  </p>
                  <small>
                    #{e.sequence} · {e.hash.slice(0, 22)}…
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
function FileIcon() {
  return (
    <span className="file-icon">
      <CloudUpload size={21} />
    </span>
  );
}

export function OutboxPage() {
  const { user, revision, notify, refresh } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useQueuedRows(user.id, revision, setRows);
  return (
    <>
      <PageTitle
        eyebrow="DEVICE / SYNCHRONIZATION"
        title="Offline drafts"
        description="Drafts are stored on this device, under your account, until the server confirms them."
        action={
          <button
            className="button"
            disabled={busy || !rows.length}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                for (const row of rows) {
                  const res = await post("/sync", {
                    operations: [
                      {
                        operation_id: row.operation_id,
                        kind: row.kind,
                        payload: row.payload,
                        ...(row.entity_id ? { entity_id: row.entity_id } : {}),
                      },
                    ],
                  });
                  const r = res.results[0];
                  if (r.status === "synced")
                    await removeDraft(row.operation_id);
                  else
                    await saveDraft({
                      ...row,
                      error: JSON.stringify(r.detail),
                      status: r.status,
                    });
                }
                refresh();
                notify(
                  "Synchronization finished. Any rejected drafts remain available for review.",
                );
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={17} />
            {busy ? "Syncing…" : "Sync drafts"}
          </button>
        }
      />
      {error && <ErrorBox message={error} />}
      <section className="panel">
        {rows.length ? (
          rows.map((row) => (
            <div className="outbox-row" key={row.operation_id}>
              <WifiOff size={22} />
              <div>
                <strong>{row.payload.title || row.kind}</strong>
                <p>
                  {fullDate(row.created_at)} · {row.operation_id}
                </p>
                {row.error && <p className="error-text">{row.error}</p>}
              </div>
              <button
                className="button secondary"
                onClick={() => setEditing(row)}
              >
                Correct draft
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(row, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "coalgov-draft-" + row.operation_id + ".json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Export draft
              </button>
            </div>
          ))
        ) : (
          <Empty text="All observations are synchronized" />
        )}
      </section>
      <p className="method-note">
        Validation failures are retained for export and correction. Conflicts
        require reviewing the latest server version before creating a new
        operation; they are never overwritten automatically.
      </p>
      {editing && (
        <ReportForm draft={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
import { useEffect } from "react";
function useQueuedRows(id: string, revision: number, setRows: any) {
  useEffect(() => {
    queued(id).then(setRows);
  }, [id, revision]);
}
