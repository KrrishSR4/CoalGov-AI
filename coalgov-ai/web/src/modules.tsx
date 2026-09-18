import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ClipboardCheck,
  CloudUpload,
  Download,
  FileText,
  HardHat,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { api, post, put, date, fullDate, label, download } from "./api";
import {
  useApp,
  useResource,
  PageTitle,
  Status,
  Risk,
  Modal,
  Field,
  FormDialog,
  ErrorBox,
  Empty,
  Loading,
  SearchInput,
} from "./ui";

const toISO = (v: string) => new Date(v).toISOString();
const mineField = (mines: any[], mineId = "") => ({
  name: "mine_id",
  label: "Mine",
  options: mines,
  value: mineId,
});
function useScopedResource(path: string) {
  const ctx = useApp();
  const r = useResource(path);
  return {
    ...r,
    data: r.data.filter((x: any) => !ctx.mineId || x.mine_id === ctx.mineId),
  };
}

export function InspectionsPage() {
  const { data, loading, error } = useScopedResource("/inspections");
  const {
    manager,
    mines,
    people,
    mineId,
    mineName,
    userName,
    user,
    refresh,
    notify,
    report,
  } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle
        eyebrow="FIELD OPERATIONS"
        title="Inspection schedule"
        description="Schedule visits, complete checklists, and report findings from the field."
        action={
          manager && (
            <button className="button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Schedule inspection
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      <div className="inspection-grid">
        {loading ? (
          <Loading />
        ) : data.length ? (
          data.map((x: any) => (
            <article className="panel inspection-card" key={x.id}>
              <div className="inspection-card-top">
                <span className="file-icon">
                  <ClipboardCheck size={23} />
                </span>
                <Status value={x.status} />
              </div>
              <h2>{x.title}</h2>
              <p>
                <MapPin size={15} />
                {mineName(x.mine_id)}
              </p>
              <div className="inspection-meta">
                <span>
                  Inspector<strong>{userName(x.officer_id)}</strong>
                </span>
                <span>
                  Scheduled<strong>{fullDate(x.scheduled_at)}</strong>
                </span>
              </div>
              <div className="checklist-summary">
                {x.checklist.filter((c: any) => c.result !== "pending").length}/
                {x.checklist.length} checklist items completed
                <div className="risk-track">
                  <span
                    className="teal"
                    style={{
                      width:
                        (x.checklist.filter((c: any) => c.result !== "pending")
                          .length /
                          x.checklist.length) *
                          100 +
                        "%",
                    }}
                  />
                </div>
              </div>
              <button
                className="button secondary full"
                onClick={() => setEditing(x)}
              >
                View inspection
                <ArrowRight size={16} />
              </button>
            </article>
          ))
        ) : (
          <Empty text="No inspections scheduled" />
        )}
      </div>
      {adding && (
        <FormDialog
          title="Schedule an inspection"
          onClose={() => setAdding(false)}
          fields={[
            mineField(mines, mineId),
            { name: "title", label: "Inspection title" },
            {
              name: "officer_id",
              label: "Assigned inspector",
              options: people.filter((p: any) =>
                ["admin", "official", "officer", "agency"].includes(p.role),
              ),
            },
            {
              name: "scheduled_at",
              label: "Scheduled date and time",
              type: "datetime-local",
            },
            {
              name: "items",
              label: "Checklist (one item per line)",
              type: "textarea",
              value:
                "Check access routes\nReview equipment condition\nConfirm field evidence",
            },
          ]}
          onSubmit={async (v: any) => {
            await post("/inspections", {
              mine_id: v.mine_id,
              title: v.title,
              officer_id: v.officer_id,
              scheduled_at: toISO(v.scheduled_at),
              checklist: v.items
                .split("\n")
                .filter((s: string) => s.trim())
                .map((label: string) => ({ label, result: "pending" })),
            });
            refresh();
            notify("Inspection scheduled.");
          }}
        />
      )}
      {editing && (
        <InspectionEditor record={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function InspectionEditor({ record, onClose }: any) {
  const { user, refresh, notify, report, reporter } = useApp();
  const [items, setItems] = useState(record.checklist);
  const [status, setStatus] = useState(record.status);
  const [notes, setNotes] = useState(record.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable =
    record.officer_id === user.id && record.status !== "completed";
  return (
    <Modal title={record.title} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await put("/inspections/" + record.id, {
              version: record.version,
              status,
              checklist: items,
              notes,
            });
            refresh();
            notify("Inspection results saved.");
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {items.map((item: any, i: number) => (
          <Field key={i} label={item.label}>
            <select
              disabled={!editable}
              value={item.result}
              onChange={(e) =>
                setItems(
                  items.map((x: any, j: number) =>
                    i === j ? { ...x, result: e.target.value } : x,
                  ),
                )
              }
            >
              {["pending", "pass", "fail", "na"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="Inspection notes">
          <textarea
            disabled={!editable}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {editable && (
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["scheduled", "in_progress", "completed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          {reporter && (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                onClose();
                report(record);
              }}
            >
              Report observation
            </button>
          )}
          {editable && (
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save checklist"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function CompliancePage() {
  const { data, loading, error } = useScopedResource("/compliance");
  const {
    manager,
    mines,
    mineId,
    people,
    mineName,
    userName,
    refresh,
    notify,
  } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageTitle
        eyebrow="OBLIGATIONS / EVIDENCE"
        title="Compliance register"
        description="Track obligations against supporting evidence and an independent review."
        action={
          manager && (
            <button className="button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Add obligation
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      <section className="panel">
        <div className="section-heading">
          <h2>Tracked obligations</h2>
          <span className="subtle-pill">{data.length} records</span>
        </div>
        {loading ? (
          <Loading />
        ) : data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Obligation</th>
                  <th>Mine</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((x: any) => (
                  <tr key={x.id}>
                    <td>
                      <button
                        className="record-title"
                        onClick={() => setEditing(x)}
                      >
                        {x.title}
                      </button>
                      <small className="record-meta">{x.reference}</small>
                    </td>
                    <td>{mineName(x.mine_id)}</td>
                    <td>{userName(x.owner_id)}</td>
                    <td>
                      <span
                        className={
                          new Date(x.due_at) < new Date() &&
                          x.status !== "compliant"
                            ? "overdue-text"
                            : ""
                        }
                      >
                        {date(x.due_at)}
                      </span>
                    </td>
                    <td>
                      <Status value={x.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(x)}
                      >
                        Review
                        <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No obligations recorded" />
        )}
      </section>
      <p className="method-note">
        Demo obligations are illustrative. Enter reviewed statutory references
        and evidence requirements for your deployment.
      </p>
      {adding && (
        <FormDialog
          title="Add a compliance obligation"
          onClose={() => setAdding(false)}
          fields={[
            mineField(mines, mineId),
            { name: "title", label: "Obligation title" },
            {
              name: "reference",
              label: "Regulation or rule reference",
              required: false,
            },
            {
              name: "source_url",
              label: "Official source URL",
              type: "url",
              required: false,
            },
            {
              name: "owner_id",
              label: "Evidence owner",
              options: people.filter((p: any) =>
                ["admin", "official", "officer", "agency"].includes(p.role),
              ),
            },
            {
              name: "due_at",
              label: "Due date and time",
              type: "datetime-local",
            },
          ]}
          onSubmit={async (v: any) => {
            await post("/compliance", { ...v, due_at: toISO(v.due_at) });
            refresh();
            notify("Obligation added.");
          }}
        />
      )}
      {editing && (
        <ComplianceEditor record={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ComplianceEditor({ record, onClose }: any) {
  const { user, manager, refresh, notify, go } = useApp();
  const { data: docs } = useResource("/documents");
  const owner = user.id === record.owner_id;
  const submit = owner && record.status === "pending";
  const review = manager && !owner && record.status === "submitted";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={record.title} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const values: any = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await put("/compliance/" + record.id, {
              version: record.version,
              status: submit ? "submitted" : values.status,
              notes: values.notes || "",
              ...(submit ? { evidence_id: values.evidence_id } : {}),
            });
            refresh();
            notify("Compliance record updated.");
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Status value={record.status} />
        <p>{record.reference}</p>
        {record.source_url && (
          <a
            className="source-link"
            href={record.source_url}
            target="_blank"
            rel="noreferrer"
          >
            Open regulatory source <ArrowUpRight size={15} />
          </a>
        )}
        {record.evidence_id && (
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              download(
                "/documents/" + record.evidence_id + "/download",
                "compliance-evidence",
              ).catch((e) => notify(e.message))
            }
          >
            Download submitted evidence
          </button>
        )}
        {submit && (
          <>
            <Field label="Supporting document">
              <select required name="evidence_id">
                <option value="">Select uploaded evidence</option>
                {docs
                  .filter(
                    (d: any) => d.mine_id === record.mine_id && !d.case_id,
                  )
                  .map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.filename}
                    </option>
                  ))}
              </select>
            </Field>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onClose();
                go("documents");
              }}
            >
              Upload a document first <ArrowRight size={15} />
            </button>
          </>
        )}
        {review && (
          <Field label="Review decision">
            <select name="status">
              <option value="compliant">Mark compliant</option>
              <option value="pending">Return for correction</option>
            </select>
          </Field>
        )}
        <Field label="Evidence or review notes">
          <textarea
            name="notes"
            defaultValue={record.notes}
            disabled={!submit && !review}
            required={review}
            minLength={review ? 10 : 0}
          />
        </Field>
        {error && <p className="error-text">{error}</p>}
        {(submit || review) && (
          <button className="button" disabled={busy}>
            {busy
              ? "Saving…"
              : submit
                ? "Submit evidence for review"
                : "Save review"}
          </button>
        )}
        {!submit && !review && (
          <p className="info-note">
            The assigned owner submits evidence. A different mine official
            reviews it.
          </p>
        )}
      </form>
    </Modal>
  );
}

export function PermitsPage() {
  const { data, error, loading } = useScopedResource("/permits");
  const {
    manager,
    user,
    mines,
    mineId,
    people,
    mineName,
    userName,
    refresh,
    notify,
  } = useApp();
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="CONTRACTOR GOVERNANCE"
        title="Work permits"
        description="Approve work with a clear time window, responsible contractor, and precautions."
        action={
          (manager || user.role === "contractor") && (
            <button className="button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Request work permit
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      <div className="inspection-grid">
        {loading ? (
          <Loading />
        ) : data.length ? (
          data.map((p: any) => (
            <article className="panel inspection-card" key={p.id}>
              <div className="inspection-card-top">
                <span className="file-icon">
                  <HardHat size={23} />
                </span>
                <Status value={p.effective_status} />
              </div>
              <h2>{p.title}</h2>
              <p>
                {mineName(p.mine_id)} · {p.work_type}
              </p>
              <div className="inspection-meta">
                <span>
                  Contractor<strong>{userName(p.contractor_id)}</strong>
                </span>
                <span>
                  Valid until<strong>{fullDate(p.expires_at)}</strong>
                </span>
              </div>
              <button
                className="button secondary full"
                onClick={() => setDetail(p)}
              >
                View permit
                <ArrowRight size={16} />
              </button>
            </article>
          ))
        ) : (
          <Empty text="No permits requested" />
        )}
      </div>
      {adding && (
        <FormDialog
          title="Request a work permit"
          onClose={() => setAdding(false)}
          fields={[
            mineField(mines, mineId),
            { name: "title", label: "Work title" },
            {
              name: "contractor_id",
              label: "Contractor",
              options: people.filter((p: any) => p.role === "contractor"),
              value: user.role === "contractor" ? user.id : "",
            },
            {
              name: "work_type",
              label: "Work type",
              options: [
                "Maintenance",
                "Electrical",
                "Excavation",
                "Transport",
                "Other",
              ],
            },
            { name: "starts_at", label: "Starts at", type: "datetime-local" },
            { name: "expires_at", label: "Expires at", type: "datetime-local" },
            {
              name: "precautions",
              label: "Required precautions",
              type: "textarea",
              minLength: 10,
            },
          ]}
          onSubmit={async (v: any) => {
            await post("/permits", {
              ...v,
              starts_at: toISO(v.starts_at),
              expires_at: toISO(v.expires_at),
            });
            refresh();
            notify("Permit submitted for approval.");
          }}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <div className="form">
            <Status value={detail.effective_status} />
            <p>{detail.precautions}</p>
            <p>
              <strong>Starts:</strong> {fullDate(detail.starts_at)}
              <br />
              <strong>Expires:</strong> {fullDate(detail.expires_at)}
            </p>
            {manager && (
              <div className="form-actions">
                {(detail.status === "requested"
                  ? ["approved", "rejected"]
                  : detail.status === "approved"
                    ? ["closed"]
                    : []
                ).map((status) => (
                  <button
                    key={status}
                    disabled={busy}
                    className={
                      "button " + (status === "rejected" ? "secondary" : "")
                    }
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await put("/permits/" + detail.id, {
                          version: detail.version,
                          status,
                        });
                        refresh();
                        notify("Permit " + status + ".");
                        setDetail(null);
                      } catch (e: any) {
                        notify(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {label(status)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

export function DocumentsPage() {
  const { data, error, loading } = useScopedResource("/documents");
  const { mines, mineId, mineName, reporter, refresh, notify } = useApp();
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [q, setQ] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="EVIDENCE INTELLIGENCE"
        title="Documents & OCR"
        description="Keep original evidence alongside extracted text, dates, and document fingerprints."
        action={
          reporter && (
            <button className="button" onClick={() => setUploading(true)}>
              <CloudUpload size={18} />
              Upload document
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
            placeholder="Search documents…"
          />
          <span className="toolbar-count">PDF · TXT · JPG · PNG</span>
        </div>
        {loading ? (
          <Loading />
        ) : data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Mine</th>
                  <th>Analysis</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data
                  .filter((d: any) =>
                    d.filename.toLowerCase().includes(q.toLowerCase()),
                  )
                  .map((d: any) => (
                    <tr key={d.id}>
                      <td>
                        <button
                          className="document-title"
                          onClick={async () => {
                            try {
                              setDetail(await api("/documents/" + d.id));
                            } catch (e: any) {
                              notify(e.message);
                            }
                          }}
                        >
                          <span className="file-icon">
                            <FileText size={20} />
                          </span>
                          <span>
                            <strong>{d.filename}</strong>
                            <small>
                              {label(d.purpose)} · {(d.size / 1024).toFixed(1)}{" "}
                              KB
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{mineName(d.mine_id)}</td>
                      <td>
                        <span className="badge">
                          {d.analysis.method || "sample"}
                        </span>
                      </td>
                      <td>{date(d.created_at)}</td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-label={"Download " + d.filename}
                          onClick={() =>
                            download(
                              "/documents/" + d.id + "/download",
                              d.filename,
                            ).catch((e) => notify(e.message))
                          }
                        >
                          <Download size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No documents uploaded">
            <p>
              Upload a compliance document or attach evidence to an observation.
            </p>
          </Empty>
        )}
      </section>
      {uploading && (
        <Modal
          title="Upload a compliance document"
          onClose={() => setUploading(false)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setUploadError("");
              const data = new FormData(e.currentTarget);
              data.append("purpose", "compliance");
              try {
                await api("/documents", { method: "POST", body: data });
                refresh();
                notify(
                  "Document saved. Review its extracted text before relying on it.",
                );
                setUploading(false);
              } catch (e: any) {
                setUploadError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Mine">
              <select required name="mine_id" defaultValue={mineId}>
                <option value="">Select mine</option>
                {mines.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Document (maximum 10 MB, 40 PDF pages)">
              <input
                required
                type="file"
                name="file"
                accept=".pdf,.txt,.png,.jpg,.jpeg"
              />
            </Field>
            <p className="info-note">
              OCR handles up to five scanned pages per PDF. Other pages retain
              their original evidence for review.
            </p>
            {uploadError && <p className="error-text">{uploadError}</p>}
            <button className="button" disabled={busy}>
              {busy ? "Uploading and extracting…" : "Upload and analyze"}
              <CloudUpload size={17} />
            </button>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.filename} wide onClose={() => setDetail(null)}>
          <div className="form">
            <div className="detail-tags">
              {detail.analysis.topics?.map((t: string) => (
                <span className="badge" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <div className="info-note">
              {detail.analysis.note ||
                "Extracted content requires human review."}
            </div>
            <p>
              <strong>Candidate dates:</strong>{" "}
              {detail.analysis.candidate_dates?.join(", ") || "None extracted"}
            </p>
            <h3>Extracted text</h3>
            <pre className="extracted-text">
              {detail.extracted_text ||
                "No text extracted. Download the original file for review."}
            </pre>
            <p className="hash-text">SHA-256: {detail.sha256}</p>
          </div>
        </Modal>
      )}
    </>
  );
}

export function WorkforcePage() {
  const { data, error, loading } = useScopedResource("/attendance");
  const {
    people,
    user,
    mineId,
    mines,
    userName,
    mineName,
    notify,
    refresh,
    reporter,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const ownOpen = data.find((r: any) => r.user_id === user.id && !r.check_out);
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE / ATTENDANCE"
        title="Workforce"
        description="Track field attendance and mine assignments."
        action={
          reporter && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (ownOpen)
                    await post("/attendance/" + ownOpen.id + "/check-out");
                  else {
                    const selected = mineId || mines[0]?.id;
                    if (!selected) throw new Error("Select a mine first.");
                    await post("/attendance/check-in", { mine_id: selected });
                  }
                  refresh();
                  notify(ownOpen ? "Checked out." : "Checked in.");
                } catch (e: any) {
                  notify(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {ownOpen ? "Check out" : "Check in"}
              <ArrowRight size={17} />
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      <section className="panel">
        <div className="section-heading">
          <h2>Attendance register</h2>
          <span className="subtle-pill">India work dates · IST</span>
        </div>
        {loading ? (
          <Loading />
        ) : data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Mine</th>
                  <th>Work date</th>
                  <th>Check in</th>
                  <th>Check out</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{userName(r.user_id)}</strong>
                    </td>
                    <td>{mineName(r.mine_id)}</td>
                    <td>{r.work_date}</td>
                    <td>{fullDate(r.check_in)}</td>
                    <td>
                      {r.check_out ? (
                        fullDate(r.check_out)
                      ) : (
                        <Status value="working" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No attendance records yet" />
        )}
      </section>
      <div className="section-heading extra-space">
        <h2>Assigned people</h2>
      </div>
      <div className="people-grid">
        {people
          .filter(
            (p: any) =>
              !mineId ||
              p.mine_ids.includes(mineId) ||
              ["admin", "management", "regulator"].includes(p.role),
          )
          .map((p: any) => (
            <div className="panel person-card" key={p.id}>
              <span className="person-avatar">
                {p.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{p.name}</strong>
                <p>{label(p.role)}</p>
                <small>{p.email}</small>
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

export function UsersPage() {
  const { people, mines, refresh, notify, user } = useApp();
  const [adding, setAdding] = useState(false);
  const [newMine, setNewMine] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION"
        title="User management"
        description="Give each person access to the role and mines they are responsible for."
        action={
          <div className="inline-actions">
            <button
              className="button secondary"
              onClick={() => setNewMine(true)}
            >
              Add mine
            </button>
            <button className="button" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Add user
            </button>
          </div>
        }
      />
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Mine scope</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {people.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>{p.email}</td>
                  <td>
                    <Status value={p.role} />
                  </td>
                  <td>
                    {["admin", "management", "regulator"].includes(p.role)
                      ? "All mines"
                      : p.mine_ids
                          .map(
                            (id: string) =>
                              mines.find((m: any) => m.id === id)?.name,
                          )
                          .join(", ")}
                  </td>
                  <td>
                    {p.id !== user.id && (
                      <button
                        className="text-button danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Deactivate " +
                                p.name +
                                "? Their existing sessions will stop working.",
                            )
                          )
                            post("/users/" + p.id + "/deactivate")
                              .then(() => {
                                refresh();
                                notify("Account deactivated.");
                              })
                              .catch((e) => notify(e.message));
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {adding && <UserForm onClose={() => setAdding(false)} />}{" "}
      {newMine && (
        <FormDialog
          title="Add a mine"
          onClose={() => setNewMine(false)}
          fields={[
            { name: "name", label: "Mine name" },
            { name: "subsidiary", label: "Subsidiary" },
            { name: "state", label: "State" },
            {
              name: "latitude",
              label: "Latitude",
              type: "number",
              min: -90,
              max: 90,
              step: "any",
            },
            {
              name: "longitude",
              label: "Longitude",
              type: "number",
              min: -180,
              max: 180,
              step: "any",
            },
          ]}
          onSubmit={async (v: any) => {
            await post("/mines", {
              ...v,
              latitude: Number(v.latitude),
              longitude: Number(v.longitude),
            });
            refresh();
            notify("Mine added.");
          }}
        />
      )}
    </>
  );
}

function UserForm({ onClose }: any) {
  const { mines, notify, refresh } = useApp();
  const [role, setRole] = useState("officer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create user account" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const v: any = Object.fromEntries(f);
          v.mine_ids = f.getAll("mine_ids");
          try {
            await post("/users", v);
            refresh();
            notify("Account created.");
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Full name">
          <input name="name" required minLength={2} />
        </Field>
        <Field label="Email">
          <input type="email" name="email" required />
        </Field>
        <Field label="Initial password (12 or more characters)">
          <input
            type="password"
            name="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role">
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {[
              "officer",
              "official",
              "agency",
              "contractor",
              "management",
              "regulator",
              "admin",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        {!["admin", "management", "regulator"].includes(role) && (
          <fieldset className="checkbox-group">
            <legend>Assigned mines</legend>
            {mines.map((m: any) => (
              <label key={m.id}>
                <input type="checkbox" name="mine_ids" value={m.id} />
                {m.name}
              </label>
            ))}
          </fieldset>
        )}
        <Field label="Phone for notifications (optional)">
          <input name="phone" type="tel" />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <button disabled={busy} className="button">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </Modal>
  );
}

export function AssetsPage({ compact = false }: any) {
  const { data, error } = useScopedResource("/assets");
  const { manager, mines, mineId, mineName, refresh, notify } = useApp();
  const [adding, setAdding] = useState(false);
  return (
    <section className={"panel asset-panel " + (compact ? "compact" : "")}>
      <div className="section-heading">
        <div>
          <h2>Mapped assets</h2>
          <p>{data.length} registered locations</p>
        </div>
        {manager && (
          <button
            className="icon-btn"
            aria-label="Add asset"
            onClick={() => setAdding(true)}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      <ErrorBox message={error} />
      {data.map((a: any) => (
        <div className="asset-row" key={a.id}>
          <span className="asset-symbol">
            <MapPin size={19} />
          </span>
          <div>
            <strong>{a.name}</strong>
            <span>
              {mineName(a.mine_id)} · {a.kind}
            </span>
            <small>
              {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
            </small>
          </div>
        </div>
      ))}
      {!data.length && <Empty text="No mapped assets" />}
      {adding && (
        <FormDialog
          title="Register an asset"
          onClose={() => setAdding(false)}
          fields={[
            mineField(mines, mineId),
            { name: "name", label: "Asset name" },
            {
              name: "kind",
              label: "Asset type",
              options: [
                "Sensor station",
                "Conveyor",
                "Pump",
                "Substation",
                "Workshop",
                "Other",
              ],
            },
            {
              name: "latitude",
              label: "Latitude",
              type: "number",
              min: -90,
              max: 90,
              step: "any",
            },
            {
              name: "longitude",
              label: "Longitude",
              type: "number",
              min: -180,
              max: 180,
              step: "any",
            },
          ]}
          onSubmit={async (v: any) => {
            await post("/assets", {
              ...v,
              latitude: Number(v.latitude),
              longitude: Number(v.longitude),
            });
            refresh();
            notify("Asset registered.");
          }}
        />
      )}
    </section>
  );
}

export function IntelligencePage() {
  const { data: intel, error } = useResource("/intelligence", { patterns: [] });
  const { data: sensors } = useScopedResource("/sensors");
  const seriesHead = sensors[0];
  const series = sensors.filter((x: any) => x.asset_id === seriesHead?.asset_id && x.metric === seriesHead?.metric && x.unit === seriesHead?.unit);
  const seriesMax = Math.max(1, ...series.map((x: any) => x.value));
  const { mines, mineId, mineName, notify } = useApp();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [qaMine, setQaMine] = useState(mineId || "");
  return (
    <>
      <PageTitle
        eyebrow="PATTERNS / EVIDENCE"
        title="Risk intelligence"
        description="Understand recurring observations and examine the evidence behind decisions."
      />
      <ErrorBox message={error} />
      <div className="intelligence-grid">
        <section className="panel pattern-panel">
          <div className="section-heading">
            <div>
              <h2>Recurring patterns</h2>
              <p>Recorded across your accessible mines · last 30 days</p>
            </div>
            <Sparkles size={22} />
          </div>
          {intel.patterns.length ? (
            intel.patterns
              .filter((p: any) => !mineId || p.mine_ids.includes(mineId))
              .map((p: any) => (
                <div className="pattern-row" key={p.category}>
                  <div>
                    <h3>{p.category}</h3>
                    <span>
                      {p.count} observations · {p.mine_ids.length} mines
                    </span>
                  </div>
                  <p>{p.recommendation}</p>
                  <small>{p.mine_ids.map(mineName).join(" · ")}</small>
                </div>
              ))
          ) : (
            <Empty text="No recurring observations yet" />
          )}
          <p className="panel-note">{intel.note}</p>
        </section>
        <section className="panel assistant-panel">
          <div className="section-heading">
            <div>
              <h2>Ask your evidence</h2>
              <p>Search uploaded documents with source passages</p>
            </div>
            <span className="ai-icon">
              <Sparkles size={21} />
            </span>
          </div>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                setAnswer(
                  await post("/assistant", {
                    mine_id: qaMine || mineId,
                    question,
                  }),
                );
              } catch (e: any) {
                notify(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Mine">
              <select
                value={qaMine || mineId}
                onChange={(e) => setQaMine(e.target.value)}
                required
              >
                <option value="">Choose a mine</option>
                {mines.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your question">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                minLength={5}
                required
                placeholder="What does the uploaded evidence say about ventilation maintenance?"
              />
            </Field>
            <button disabled={busy} className="button">
              {busy ? "Finding evidence…" : "Find supporting evidence"}
              <Send size={16} />
            </button>
          </form>
          {answer && (
            <div className="answer">
              <p>{answer.answer}</p>
              {answer.citations.map((c: any, i: number) => (
                <div className="citation" key={c.document_id + "-" + c.offset}>
                  <strong>
                    [{i + 1}] {c.filename}
                  </strong>
                  <p>{c.text}</p>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        "/documents/" + c.document_id + "/download",
                        c.filename,
                      ).catch((e) => notify(e.message))
                    }
                  >
                    Original document <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel sensor-panel">
        <div className="section-heading">
          <div>
            <h2>Sensor observations</h2>
            <p>
              Statistical anomalies compared with recent readings of the same
              metric
            </p>
          </div>
          <Status value="monitoring" />
        </div>
        {sensors.length ? (
          <div className="sensor-chart">
            <div
              className="sensor-bars"
              aria-label={seriesHead ? `${seriesHead.metric} readings in ${seriesHead.unit} from one asset` : "No sensor readings"}
            >
              {series
                .slice(0, 24)
                .reverse()
                .map((s: any) => (
                  <div
                    key={s.id}
                    className={s.anomaly ? "anomaly" : ""}
                    style={{ height: Math.max(4, Math.min(130, s.value / seriesMax * 130)) }}
                    title={`${fullDate(s.observed_at)}: ${s.value} ${s.unit}`}
                  />
                ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Source / mine</th>
                    <th>Metric</th>
                    <th>Reading</th>
                    <th>Observed</th>
                    <th>Review signal</th>
                  </tr>
                </thead>
                <tbody>
                  {sensors.slice(0, 6).map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        {s.source}
                        <small className="record-meta">
                          {mineName(s.mine_id)}
                        </small>
                      </td>
                      <td>{s.metric}</td>
                      <td>
                        <strong>
                          {s.value} {s.unit}
                        </strong>
                      </td>
                      <td>{fullDate(s.observed_at)}</td>
                      <td>
                        <Status
                          value={s.anomaly ? "needs_review" : "baseline"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Empty text="No sensor readings received" />
        )}
      </section>
    </>
  );
}

export function AuditPage() {
  const { data, error, loading } = useResource("/audit");
  const { user, userName, mineName, notify } = useApp();
  const [verification, setVerification] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  return (
    <>
      <PageTitle
        eyebrow="AUDIT / TRUST"
        title="Audit trail"
        description="A chronological record of decisions with chained SHA-256 fingerprints."
        action={
          ["admin", "regulator"].includes(user.role) && (
            <button
              className="button"
              onClick={async () => {
                try {
                  setVerification(await api("/audit/verify"));
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              <ShieldCheck size={17} />
              Verify audit chain
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      {verification && (
        <div
          className={
            "verification-result " + (verification.valid ? "valid" : "invalid")
          }
        >
          <ShieldCheck size={23} />
          <div>
            <strong>
              {verification.valid
                ? "Audit chain verified"
                : "Audit chain verification failed"}
            </strong>
            <p>
              {verification.checked} entries checked ·{" "}
              {fullDate(verification.verified_at)}
            </p>
            <small>{verification.head_hash}</small>
          </div>
        </div>
      )}
      <section className="panel">
        {loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Mine</th>
                  <th>Recorded</th>
                  <th>Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e: any) => (
                  <tr key={e.sequence}>
                    <td>#{e.sequence}</td>
                    <td>
                      <button
                        className="record-title"
                        onClick={() => setDetail(e)}
                      >
                        {e.action}
                      </button>
                    </td>
                    <td>
                      {e.actor_id.startsWith("user-")
                        ? userName(e.actor_id)
                        : e.actor_id}
                    </td>
                    <td>{e.mine_id ? mineName(e.mine_id) : "Workspace"}</td>
                    <td>{fullDate(e.occurred_at)}</td>
                    <td>
                      <code>{e.hash.slice(0, 12)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="method-note">
        Append-only database rules and chained hashes expose ordinary tampering.
        Protect backups and independently retain a trusted head hash to detect
        privileged database rewrites.
      </p>
      {detail && (
        <Modal
          title={"Audit event #" + detail.sequence}
          wide
          onClose={() => setDetail(null)}
        >
          <div className="form">
            <p>{detail.action}</p>
            <pre className="extracted-text">
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
            <p className="hash-text">
              Previous: {detail.previous_hash}
              <br />
              Current: {detail.hash}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ReportsPage() {
  const { mineId, notify } = useApp();
  const { data: d, error } = useResource(
    "/dashboard" + (mineId ? "?mine_id=" + mineId : ""),
    null,
  );
  return (
    <>
      <PageTitle
        eyebrow="MANAGEMENT / REPORTING"
        title="Reports & analytics"
        description="Compare mine performance and export case records for further review."
        action={
          <button
            className="button"
            onClick={() =>
              download("/reports/cases.csv", "coalgov-cases.csv").catch((e) =>
                notify(e.message),
              )
            }
          >
            <ArrowDownToLine size={17} />
            Export accessible cases
          </button>
        }
      />
      <ErrorBox message={error} />
      {!d ? (
        <Loading />
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>Mine comparison</h2>
              <button className="text-button" onClick={() => window.print()}>
                Print report
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mine</th>
                    <th>Subsidiary</th>
                    <th>Total observations</th>
                    <th>Open actions</th>
                    <th>Highest open risk</th>
                    <th>Verified compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {d.by_mine.map((m: any) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                      </td>
                      <td>{m.subsidiary}</td>
                      <td>{m.total_cases}</td>
                      <td>{m.open_cases}</td>
                      <td>
                        <Risk score={m.risk_score} />
                      </td>
                      <td>
                        {m.compliance == null
                          ? "No obligations"
                          : m.compliance + "%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="dashboard-row extra-space">
            <section className="panel report-summary">
              <h2>Workflow distribution</h2>
              {Object.entries(d.status_counts).map(([s, n]: any) => (
                <div key={s}>
                  <Status value={s} />
                  <b>{n}</b>
                </div>
              ))}
            </section>
            <section className="panel report-summary">
              <h2>Open observations by category</h2>
              {Object.entries(d.category_counts).map(([s, n]: any) => (
                <div key={s}>
                  <span>{s}</span>
                  <b>{n}</b>
                </div>
              ))}
            </section>
          </div>
          <p className="method-note">
            Dashboard as of {fullDate(d.as_of)}. CSV exports include every case
            you can access, across all of your assigned mines.
          </p>
        </>
      )}
    </>
  );
}
