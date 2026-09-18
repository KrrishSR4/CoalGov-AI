import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Globe2,
  HardHat,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  MessageSquare,
  Pickaxe,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, post, API, download, date, label } from "./api";
import {
  Context,
  PageTitle,
  Status,
  Risk,
  Empty,
  ErrorBox,
  Loading,
  useApp,
  useResource,
} from "./ui";
import { CasesPage, ReportForm, CaseDetail, OutboxPage } from "./cases";
import {
  CompliancePage,
  InspectionsPage,
  PermitsPage,
  DocumentsPage,
  WorkforcePage,
  UsersPage,
  AssetsPage,
  IntelligencePage,
  AuditPage,
  ReportsPage,
} from "./modules";
import MapView from "./MapView";
import { queued } from "./outbox";
import { ProductionPage, GrievancesPage } from "./operations";

const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["cases", "Observations & actions", TriangleAlert],
  ["inspections", "Inspections", ClipboardCheck],
  ["compliance", "Compliance register", FileCheck2],
  ["gis", "Mine digital twin", MapPinned],
  ["intelligence", "Risk intelligence", Sparkles],
  ["documents", "Documents & OCR", FileText],
  ["permits", "Contractors & permits", HardHat],
  ["workforce", "Workforce", Users],
  ["production", "Production reporting", Pickaxe],
  ["grievances", "Grievance register", MessageSquare],
  ["reports", "Reports & analytics", ChartNoAxesCombined],
  ["audit", "Audit trail", ShieldCheck],
  ["users", "User management", Users],
  ["outbox", "Offline drafts", RefreshCw],
] as const;

function Login({ onLogin }: any) {
  const [email, setEmail] = useState("admin@coalgov.demo");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    api("/health")
      .then((x) => setDemo(x.demo_data))
      .catch(() => {});
  }, []);
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span>
            <Pickaxe size={25} />
          </span>
          <b>
            CoalGov <em>AI</em>
          </b>
        </div>
        <div className="login-copy">
          <div className="eyebrow">MINE GOVERNANCE WORKSPACE</div>
          <h1>
            Every observation.
            <br />A verified action.
          </h1>
          <p>
            Bring field evidence, compliance obligations, and corrective work
            into one shared view.
          </p>
          <div className="login-flow">
            Observe <ArrowRight /> Act <ArrowRight /> Verify
          </div>
        </div>
        <div className="login-footer">
          <ShieldCheck size={19} /> Team MineX · SIH 2026 · SIH26024
        </div>
      </section>
      <section className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await post("/auth/login", { email, password });
              onLogin(r.user);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="login-symbol">
            <HardHat size={30} />
          </span>
          <h2>Welcome to CoalGov AI</h2>
          <p>Sign in to your mine governance workspace.</p>
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to workspace"}
            <ArrowRight size={18} />
          </button>
          {demo && (
            <div className="demo-login">
              <strong>Explore the demonstration</strong>
              <p>
                Fictional mine records. Choose a role to fill in its demo
                credentials.
              </p>
              <div className="role-buttons">
                {[
                  "admin",
                  "official",
                  "officer",
                  "contractor",
                  "management",
                  "regulator",
                  "agency",
                ].map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setEmail(role + "@coalgov.demo");
                      setPassword("MineX-Demo-2026!");
                    }}
                  >
                    {label(role)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(undefined);
  const [mines, setMines] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [mineId, setMineId] = useState("");
  const [page, setPage] = useState(location.hash.slice(1) || "overview");
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<any>(null);
  const [caseId, setCaseId] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [connected, setConnected] = useState(false);
  const [outboxCount, setOutboxCount] = useState(0);
  const [dataError, setDataError] = useState("");
  const toastTimer = useRef<any>(null);
  const refresh = () => setRevision((x) => x + 1);
  const notify = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  };
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
    const change = () => setPage(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!user) return;
    Promise.all([api("/mines"), api("/users")])
      .then(([m, u]) => {
        setMines(m);
        setPeople(u);
        setDataError("");
      })
      .catch((e) => setDataError(e.message));
    queued(user.id)
      .then((q) => setOutboxCount(q.length))
      .catch(() => {});
  }, [user, revision]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(refresh, 30000);
    let ws: WebSocket;
    let retry: any;
    let stopped = false;
    function connect() {
      const base = API || location.origin;
      ws = new WebSocket(base.replace(/^http/, "ws") + "/api/ws");
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "notifications") setNotifications(data.items);
        } catch {}
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 5000);
      };
    }
    connect();
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(retry);
      ws?.close();
    };
  }, [user]);
  if (user === undefined)
    return (
      <div className="boot">
        <Pickaxe size={32} />
        <p>Opening CoalGov AI…</p>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  const manager = ["admin", "official"].includes(user.role);
  const reporter = [
    "admin",
    "official",
    "officer",
    "contractor",
    "agency",
  ].includes(user.role);
  const allowed = nav.filter(([key]) =>
    key === "users"
      ? user.role === "admin"
      : key === "audit"
        ? ["admin", "official", "management", "regulator"].includes(user.role)
        : user.role === "contractor"
          ? [
              "overview",
              "cases",
              "permits",
              "workforce",
              "grievances",
              "documents",
              "outbox",
            ].includes(key)
          : true,
  );
  const currentPage = allowed.some((x) => x[0] === page) ? page : "overview";
  const go = (p: string) => {
    location.hash = p;
    setMenu(false);
  };
  const ctx = {
    user,
    mines,
    people,
    mineId,
    revision,
    refresh,
    notify,
    manager,
    reporter,
    go,
    openCase: setCaseId,
    report: (inspection: any = null) => setReport(inspection || {}),
    mineName: (id: string) => mines.find((m) => m.id === id)?.name || id,
    userName: (id: string) =>
      people.find((u) => u.id === id)?.name || "Unassigned",
  };
  return (
    <Context.Provider value={ctx}>
      <div className="app-shell">
        {menu && (
          <button
            className="sidebar-scrim"
            aria-label="Close menu"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={"sidebar " + (menu ? "open" : "")}>
          <a className="brand" href="#overview">
            <span>
              <Pickaxe size={23} />
            </span>
            <b>
              CoalGov <em>AI</em>
            </b>
          </a>
          <div className="workspace-tag">
            <span className="workspace-icon">
              <Boxes size={17} />
            </span>
            <div>
              MineX workspace<small>Mine governance</small>
            </div>
            <ChevronDown size={15} />
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <nav>
            {allowed.map(([key, text, Icon]) => (
              <button
                key={key}
                className={currentPage === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <Icon size={18} />
                <span>{text}</span>
                {key === "outbox" && outboxCount > 0 && (
                  <b className="nav-count">{outboxCount}</b>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="trust-note">
              <ShieldCheck size={19} />
              <div>
                Evidence you can trace
                <small>Every action leaves a record.</small>
              </div>
            </div>
            <div className="sidebar-person">
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((x: string) => x[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>{label(user.role)}</small>
              </div>
              <button
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => {
                  try {
                    await post("/auth/logout");
                    setUser(null);
                    setMineId("");
                  } catch (e: any) {
                    notify(e.message);
                  }
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace-main">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-btn menu-button"
                aria-label="Open navigation"
                onClick={() => setMenu(true)}
              >
                <Menu size={22} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span>{" "}
                <strong>
                  {allowed.find((x) => x[0] === currentPage)?.[1]}
                </strong>
              </span>
            </div>
            <div className="topbar-right">
              <span
                className={"connection " + (connected ? "" : "disconnected")}
              >
                {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
                <span>{connected ? "Connected" : "Reconnecting"}</span>
              </span>
              <button
                className="icon-btn notification-button"
                aria-label="Notifications"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={19} />
                {notifications.length > 0 && <i />}
              </button>
              <span className="top-avatar">{user.name[0]}</span>
            </div>
            {showNotifications && (
              <section className="notification-panel">
                <div className="section-heading">
                  <h3>Notifications</h3>
                  <button
                    className="icon-btn"
                    aria-label="Close notifications"
                    onClick={() => setShowNotifications(false)}
                  >
                    <X size={17} />
                  </button>
                </div>
                {notifications.length ? (
                  notifications.map((n) => (
                    <button
                      className="notification-item"
                      key={n.id}
                      onClick={async () => {
                        try {
                          await post("/notifications/" + n.id + "/read");
                          setNotifications((v) =>
                            v.filter((x) => x.id !== n.id),
                          );
                          notify(n.body);
                        } catch (e: any) {
                          notify(e.message);
                        }
                      }}
                    >
                      <strong>{n.title}</strong>
                      <span>{n.body}</span>
                      <small>{date(n.created_at)} · Mark as read</small>
                    </button>
                  ))
                ) : (
                  <Empty text="You're all caught up" />
                )}
              </section>
            )}
          </header>
          <main className="content">
            <div className="workspace-controls">
              <div className="workspace-date">
                <Globe2 size={16} />
                <span>Mine operations</span>
                <i />{" "}
                <span>
                  {new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <label className="mine-filter">
                <MapPinned size={15} />
                <select
                  aria-label="Mine filter"
                  value={mineId}
                  onChange={(e) => setMineId(e.target.value)}
                >
                  <option value="">All assigned mines</option>
                  {mines.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ErrorBox message={dataError} />
            {currentPage === "overview" ? (
              <Overview />
            ) : currentPage === "cases" ? (
              <CasesPage />
            ) : currentPage === "inspections" ? (
              <InspectionsPage />
            ) : currentPage === "compliance" ? (
              <CompliancePage />
            ) : currentPage === "gis" ? (
              <GisPage />
            ) : currentPage === "intelligence" ? (
              <IntelligencePage />
            ) : currentPage === "documents" ? (
              <DocumentsPage />
            ) : currentPage === "permits" ? (
              <PermitsPage />
            ) : currentPage === "workforce" ? (
              <WorkforcePage />
            ) : currentPage === "production" ? (
              <ProductionPage key={mineId} />
            ) : currentPage === "grievances" ? (
              <GrievancesPage key={mineId} />
            ) : currentPage === "reports" ? (
              <ReportsPage />
            ) : currentPage === "audit" ? (
              <AuditPage />
            ) : currentPage === "users" ? (
              <UsersPage />
            ) : (
              <OutboxPage />
            )}
            <footer className="content-footer">
              <span>CoalGov AI · Team MineX</span>
              <span>Governance begins with evidence.</span>
            </footer>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            <ShieldCheck size={18} />
            {toast}
            <button aria-label="Dismiss message" onClick={() => setToast("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {report && (
          <ReportForm inspection={report} onClose={() => setReport(null)} />
        )}{" "}
        {caseId && <CaseDetail caseId={caseId} onClose={() => setCaseId("")} />}
      </div>
    </Context.Provider>
  );
}

function Overview() {
  const { mineId, reporter, report, go, openCase, mineName } = useApp();
  const {
    data: d,
    loading,
    error,
  } = useResource("/dashboard" + (mineId ? "?mine_id=" + mineId : ""), null);
  if (!d) return error ? <ErrorBox message={error} /> : <Loading />;
  const maxTrend = Math.max(
    ...d.trend.map((x: any) => Math.max(x.reported, x.closed)),
    1,
  );
  return (
    <>
      <PageTitle
        eyebrow="OPERATIONS / OVERVIEW"
        title="Governance overview"
        description="A clear view of risk, compliance, and the work that needs attention."
        action={
          reporter && (
            <button className="button" onClick={() => report()}>
              <Plus size={18} />
              Report observation
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      {d.demo_data && (
        <div className="demo-strip">
          <span className="demo-mark">DEMO WORKSPACE</span>
          <span>
            Fictional mine records for exploring the complete governance
            workflow.
          </span>
          <a href="#audit">
            View audit trail <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      <div className="stats-grid">
        {[
          {
            name: "Open observations",
            value: d.open_cases,
            Icon: ClipboardCheck,
            note: d.overdue + " overdue actions",
            tone: "teal",
            click: "cases",
          },
          {
            name: "High risk cases",
            value: d.critical,
            Icon: TriangleAlert,
            note: "Risk score of 70 or above",
            tone: "red",
            click: "intelligence",
          },
          {
            name: "Verified compliance",
            value: d.compliance_rate == null ? "—" : d.compliance_rate + "%",
            Icon: ShieldCheck,
            note: "Reviewed obligations / total",
            tone: "green",
            click: "compliance",
          },
          {
            name: "Awaiting verification",
            value: d.pending_verification,
            Icon: FileCheck2,
            note: d.closed + " observations closed",
            tone: "blue",
            click: "cases",
          },
        ].map(({ name, value, Icon, note, tone, click }) => (
          <button className="stat-card" key={name} onClick={() => go(click)}>
            <div className="stat-top">
              <span>{name}</span>
              <span className={"stat-icon " + tone}>
                <Icon size={19} />
              </span>
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-bottom">
              <span>{note}</span>
              <ArrowUpRight size={17} />
            </div>
          </button>
        ))}
      </div>
      <div className="dashboard-row">
        <section className="panel mine-risk">
          <div className="section-heading">
            <div>
              <h2>Risk across your mines</h2>
              <p>Highest open observation score in each mine</p>
            </div>
            <span className="subtle-pill">{d.by_mine.length} mines</span>
          </div>
          <div className="mine-risk-list">
            {d.by_mine.map((m: any, i: number) => (
              <button
                key={m.id}
                className="mine-risk-row"
                onClick={() => go("gis")}
              >
                <span className="mine-number">0{i + 1}</span>
                <div className="mine-row-main">
                  <div className="mine-row-top">
                    <strong>{m.name}</strong>
                    <Risk score={m.risk_score} />
                  </div>
                  <div className="risk-track">
                    <span
                      className={
                        m.risk_score >= 70
                          ? "red"
                          : m.risk_score >= 40
                            ? "amber"
                            : "teal"
                      }
                      style={{ width: m.risk_score + "%" }}
                    />
                  </div>
                  <div className="mine-row-meta">
                    <span>{m.subsidiary}</span>
                    <span>{m.open_cases} open observations</span>
                  </div>
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          <div className="panel-foot">
            <span>
              <i className="legend-dot red" />
              High ≥ 70
            </span>
            <span>
              <i className="legend-dot amber" />
              Medium 40–69
            </span>
            <span>
              <i className="legend-dot teal" />
              Low &lt; 40
            </span>
          </div>
        </section>
        <section className="panel activity-panel">
          <div className="section-heading">
            <div>
              <h2>Observation activity</h2>
              <p>Reported and closed in the last 7 days</p>
            </div>
            <Activity size={19} />
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot teal" />
              Reported
            </span>
            <span>
              <i className="legend-dot lime" />
              Closed
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={d.trend
              .map(
                (x: any) =>
                  `${x.date}: ${x.reported} reported, ${x.closed} closed`,
              )
              .join("; ")}
          >
            {d.trend.map((x: any) => (
              <div className="bar-group" key={x.date}>
                <div className="bars">
                  <span
                    className="bar reported"
                    style={{
                      height: Math.max(2, (x.reported / maxTrend) * 140),
                    }}
                    title={x.reported + " reported"}
                  >
                    <b>{x.reported}</b>
                  </span>
                  <span
                    className="bar closed"
                    style={{ height: Math.max(2, (x.closed / maxTrend) * 140) }}
                    title={x.closed + " closed"}
                  >
                    <b>{x.closed}</b>
                  </span>
                </div>
                <small>
                  {new Date(x.date).toLocaleDateString("en-IN", {
                    weekday: "short",
                  })}
                </small>
              </div>
            ))}
          </div>
          <div className="activity-footer">
            <span>
              <ClipboardCheck size={16} />
              {d.scheduled_inspections} inspections scheduled
            </span>
            <button onClick={() => go("inspections")}>
              View schedule <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
      <section className="panel attention-panel">
        <div className="section-heading">
          <div>
            <h2>
              Needs your attention{" "}
              <span className="count-pill">{d.attention.length}</span>
            </h2>
            <p>Overdue work and the highest risk observations</p>
          </div>
          <button className="text-button" onClick={() => go("cases")}>
            All observations <ArrowRight size={16} />
          </button>
        </div>
        {d.attention.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Observation</th>
                  <th>Mine</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Due date</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.attention.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="record-title"
                        onClick={() => openCase(c.id)}
                      >
                        {c.title}
                      </button>
                      <small className="record-meta">
                        {c.category} · {c.id.slice(0, 8).toUpperCase()}
                      </small>
                    </td>
                    <td>{mineName(c.mine_id)}</td>
                    <td>
                      <Risk score={c.risk_score} />
                    </td>
                    <td>
                      <Status value={c.status} />
                    </td>
                    <td>
                      <span
                        className={
                          new Date(c.due_at) < new Date() ? "overdue-text" : ""
                        }
                      >
                        {date(c.due_at)}
                      </span>
                    </td>
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
          <Empty text="No outstanding observations" />
        )}
      </section>
      <div className="method-note">
        <Sparkles size={16} />
        <span>{d.scoring_method}.</span>
      </div>
    </>
  );
}

function GisPage() {
  const { mineId, mines } = useApp();
  const { data, error } = useResource("/gis", { features: [] });
  const [layers, setLayers] = useState([
    "assets",
    "observations",
    "boundaries",
  ]);
  const filtered = {
    ...data,
    features: data.features.filter((f: any) =>
      layers.includes(f.properties.layer),
    ),
  };
  return (
    <>
      <PageTitle
        eyebrow="SPATIAL WORKSPACE"
        title="Mine digital twin"
        description="Field observations and assets connected to their locations."
      />
      <ErrorBox message={error} />
      <div className="map-layout">
        <section className="panel map-panel">
          <div className="map-toolbar">
            {["boundaries", "assets", "observations"].map((x) => (
              <label key={x}>
                <input
                  type="checkbox"
                  checked={layers.includes(x)}
                  onChange={(e) =>
                    setLayers((l) =>
                      e.target.checked ? [...l, x] : l.filter((v) => v !== x),
                    )
                  }
                />
                {label(x)}
              </label>
            ))}
          </div>
          <MapView features={filtered} mineId={mineId} mines={mines} />
          <p className="map-note">
            Coordinates and mine boundaries in the demo are illustrative. The
            basemap requires an internet connection.
          </p>
        </section>
        <AssetsPage compact />
      </div>
    </>
  );
}
