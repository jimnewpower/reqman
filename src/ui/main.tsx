import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
} from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import type {
  Requirement,
  Document,
  Baseline,
  DurableRecord,
  Projection,
  ObjectValue,
  SnapshotInfo,
  Relation,
} from "../core/model";
import type { Result, Request } from "../core/service";
import "./style.css";

type Row = Requirement & { state: Projection; fileToken: string };
const ErrorContext = createContext("");
type Register = {
  project: { name: string; uid: string };
  requirements: Row[];
  documents: Document[];
  baselines: Baseline[];
  records: DurableRecord[];
  readOnly: boolean;
  summary: {
    total: number;
    denominator: number;
    exclusions: number;
    approved: number;
    verified: number;
    stale: number;
    unknown: number;
    conflicted: number;
  };
};
type Page =
  | "Register"
  | "Documents"
  | "Compare"
  | "Traceability"
  | "Baselines"
  | "Work queue";
type Plan = {
  uid: string;
  entries: { path: string; before: string | null; after: string | null }[];
};
const pages: [Page, string][] = [
  ["Register", "▤"],
  ["Documents", "▱"],
  ["Compare", "⇄"],
  ["Traceability", "⌘"],
  ["Baselines", "◇"],
  ["Work queue", "☷"],
];
const words = (s: string) => s.replaceAll("_", " ");
function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{words(value)}</span>;
}
function MarkdownView({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown
        skipHtml
        components={{
          img: ({ alt }) => (
            <span className="image-placeholder">
              [Image: {alt || "attachment"} · external content is not loaded]
            </span>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const error = useContext(ErrorContext);
  const titleId = useId();
  useEffect(() => {
    const modal = ref.current,
      opener = document.activeElement as HTMLElement | null;
    modal?.showModal();
    return () => {
      modal?.close();
      queueMicrotask(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          <pre>{error}</pre>
        </div>
      )}
      {children}
    </dialog>
  );
}
function App() {
  const [token, setToken] = useState(
    sessionStorage.getItem("reqman-key") ?? "",
  );
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<Register | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);
  const [ref, setRef] = useState(
    new URLSearchParams(location.search).get("ref") ?? "WORKTREE",
  );
  const [scope, setScope] = useState("project");
  const [page, setPage] = useState<Page>("Register");
  const [selected, setSelected] = useState<string | null>(
    location.hash.slice(1) || null,
  );
  const [query, setQuery] = useState("");
  const [disposition, setDisposition] = useState("");
  const [filters, setFilters] = useState({
    specification: "",
    lifecycle: "",
    status: "",
    currency: "",
  });
  const [report, setReport] = useState<
    "inventory" | "comparison" | "matrix" | "gaps"
  >("inventory");
  const [historyView, setHistoryView] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [impactView, setImpactView] = useState<Record<string, unknown> | null>(
    null,
  );
  const [impactTrigger, setImpactTrigger] = useState("");
  const [progress, setProgress] = useState("Working…");
  const [attachmentRecord, setAttachmentRecord] =
    useState<DurableRecord | null>(null);
  const activeOperation = useRef<string>("");
  const activeController = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [findings, setFindings] = useState<Result["diagnostics"]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    uid?: string;
    id: string;
    markdown: string;
    document: string;
    fileToken?: string;
    lifecycle: string;
    disposition: string;
    metadata: ObjectValue;
  } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recordForm, setRecordForm] = useState<
    "review" | "assess" | "verification" | "change" | "impact" | null
  >(null);
  const [reviewToken, setReviewToken] = useState("");
  const [documentView, setDocumentView] = useState<{
    title: string;
    source: string;
  } | null>(null);
  const [base, setBase] = useState("HEAD");
  const [head, setHead] = useState("WORKTREE");
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(
    null,
  );
  const [baselineForm, setBaselineForm] = useState(false);
  const [importForm, setImportForm] = useState<"evidence" | "migration" | null>(
    null,
  );
  const [theme, setTheme] = useState(
    localStorage.getItem("reqman-theme") ?? "system",
  );
  const [artifactRepository, setArtifactRepository] = useState("");
  const [artifactRevision, setArtifactRevision] = useState("");
  const artifact =
    artifactRepository && artifactRevision
      ? { repository: artifactRepository, revision: artifactRevision }
      : undefined;
  const active = data?.requirements.find((r) => r.uid === selected);
  const editable = data && !data.readOnly;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("reqman-theme", theme);
  }, [theme]);
  const api = useCallback(
    async (path: string, body: unknown, background = false) => {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Reqman-Operation": background ? "" : activeOperation.current,
        },
        signal: background ? undefined : activeController.current?.signal,
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (
        !response.ok ||
        (result.exit_code && (!result.complete || result.data === null))
      )
        throw new Error(
          result.diagnostics
            ?.map(
              (d: { file: string; line: number; message: string }) =>
                `${d.file ? `${d.file}:${d.line} · ` : ""}${d.message}`,
            )
            .join("\n") ?? "Request failed",
        );
      return result;
    },
    [token],
  );
  const command = (r: Request) => api("/api/command", r) as Promise<Result>;
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api(
        "/api/command",
        {
          operation: "register",
          ref,
          scope,
          ...(artifactRepository && artifactRevision
            ? {
                artifact: {
                  repository: artifactRepository,
                  revision: artifactRevision,
                },
              }
            : {}),
        },
        true,
      );
      setData(response.data);
      setSnapshot(response.snapshot);
      setFindings(response.diagnostics ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, token, ref, scope, artifactRepository, artifactRevision]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);
  const perform = async (operation: () => Promise<void>) => {
    if (activeController.current) return;
    activeController.current = new AbortController();
    activeOperation.current = crypto.randomUUID();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      activeController.current = null;
      activeOperation.current = "";
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void fetch("/api/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      })
        .then((r) => r.json())
        .then((result) => {
          const job = result.jobs?.find(
            (j: { id: string }) => j.id === activeOperation.current,
          );
          if (job)
            setProgress(
              `${job.stage}${job.total ? ` · ${job.completed}/${job.total}` : ""}${job.atomic ? " · atomic replacement" : ""}`,
            );
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [busy, token]);
  const preview = async (request: Request) => {
    const result = await command({ ...request, ref, scope, artifact });
    const resultData = result.data as { plan?: Plan; idempotent?: boolean };
    if (resultData.plan) setPlan(resultData.plan);
    else if (resultData.idempotent)
      setNotice("Already imported. No files changed.");
  };
  const select = (uid: string) => {
    setSelected(uid);
    history.replaceState(null, "", `#${uid}`);
  };
  const startEdit = (row?: Row) =>
    setEditor({
      uid: row?.uid,
      id: row?.id ?? "",
      markdown:
        row?.markdown ??
        "## Requirement title\n\n### Statement\n\nThe application shall …\n\n### Acceptance criteria\n\n- ",
      document: row?.path ?? data?.documents[0]?.path ?? "",
      fileToken: row?.fileToken,
      lifecycle: row?.lifecycle ?? "draft",
      disposition: row?.disposition ?? "in_scope",
      metadata: row?.metadata ?? {},
    });
  const rows =
    data?.requirements.filter(
      (r) =>
        (!disposition || r.disposition === disposition) &&
        (!filters.specification || r.specification === filters.specification) &&
        (!filters.lifecycle || r.lifecycle === filters.lifecycle) &&
        (!filters.currency || r.state.currency === filters.currency) &&
        (!filters.status ||
          [
            r.state.approval,
            r.state.implementation,
            r.state.verification,
          ].includes(filters.status)) &&
        `${r.qualifiedId} ${r.title} ${r.markdown} ${JSON.stringify(r.metadata)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  const download = async (format: string) => {
    const result = await api("/api/export", {
      format,
      ref,
      scope,
      artifact,
      report,
      base,
      head,
      query: query || undefined,
      disposition: disposition || undefined,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    });
    const url = URL.createObjectURL(
      new Blob([result.content], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `requirements.${result.extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };
  if (!token || (!data && error.includes("access key")))
    return (
      <main className="login">
        <div className="brand-mark">
          r<span>·</span>
        </div>
        <p className="eyebrow">LOCAL REQUIREMENTS WORKSPACE</p>
        <h1>
          Your requirements.
          <br />
          Your repository.
        </h1>
        <p>
          Enter the access key from <code>reqman serve</code> to open this local
          session.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem("reqman-key", keyInput);
            setToken(keyInput);
            setError("");
          }}
        >
          <label htmlFor="access-key">Session access key</label>
          <input
            id="access-key"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            required
            autoFocus
            autoComplete="off"
          />
          <button className="primary">Open workspace →</button>
        </form>
        {error && <p role="alert">{error}</p>}
        <small>Files stay on this machine. No account or hosted service.</small>
      </main>
    );
  return (
    <ErrorContext.Provider value={error}>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("Register");
            }}
          >
            <span className="brand-mark">
              r<span>·</span>
            </span>
            <span>
              reqman<small>REQUIREMENTS, IN CONTEXT</small>
            </span>
          </a>
          <div className="project-card">
            <span className="project-icon">▦</span>
            <div>
              <strong>{data?.project.name ?? "Loading workspace…"}</strong>
              <small>Local Git repository</small>
            </div>
          </div>
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="Workspace">
            {pages.map(([name, icon]) => (
              <button
                key={name}
                className={page === name ? "nav-item active" : "nav-item"}
                onClick={() => setPage(name)}
                aria-current={page === name ? "page" : undefined}
              >
                <span aria-hidden="true">{icon}</span>
                {name}
                {name === "Work queue" && (
                  <span className="nav-count">
                    {data?.requirements.filter(
                      (r) => r.state.approval !== "approved",
                    ).length ?? 0}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-status">
              <span className="dot" /> Local session{" "}
              <Badge value={editable ? "editable" : "read_only"} />
            </div>
            <label>
              Appearance
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <p>
              Preview 0.1 · Git owns the history.
              <br />
              Decisions stay in your files.
            </p>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumbs">
              Workspace <span>/</span> <strong>{page}</strong>
            </div>
            <div className="topbar-controls">
              <span className={`dot ${snapshot?.dirty ? "dirty" : ""}`} />
              <span>
                {snapshot?.dirty ? "Uncommitted changes" : "Snapshot captured"}
              </span>
              <label className="sr-only" htmlFor="snapshot">
                Snapshot
              </label>
              <input
                id="snapshot"
                className="snapshot-input"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                list="snapshots"
              />
              <datalist id="snapshots">
                <option value="WORKTREE" />
                <option value="HEAD" />
                {data?.baselines.map((b) => (
                  <option key={b.uid} value={`baseline:${b.name}`} />
                ))}
              </datalist>
              <button
                onClick={() => void perform(load)}
                title="Refresh source files"
              >
                ↻ <span className="sr-only">Refresh</span>
              </button>
            </div>
          </header>
          <main id="main">
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {page === "Register"
                    ? "THE SOURCE OF WHAT MATTERS"
                    : "REQUIREMENTS WORKSPACE"}
                </p>
                <h1>{page === "Register" ? "Requirement register" : page}</h1>
                <p className="subtitle">
                  {
                    {
                      Register:
                        "A clear view of your obligations, decisions, and evidence.",
                      Documents: "Readable Markdown is the source of truth.",
                      Compare:
                        "Understand what changed, and what needs another look.",
                      Traceability:
                        "Follow the relationships behind each requirement.",
                      Baselines:
                        "An exact scope, preserved at an exact commit.",
                      "Work queue":
                        "Decisions that need attention, with their context intact.",
                    }[page]
                  }
                </p>
              </div>
              <div className="heading-actions">
                <button onClick={() => void perform(() => download("html"))}>
                  ↓ Export report
                </button>
                <button
                  className="primary"
                  disabled={!editable}
                  onClick={() => startEdit()}
                >
                  ＋ New requirement
                </button>
              </div>
            </div>
            {error && (
              <div className="alert" role="alert">
                <strong>Action needs attention</strong>
                <pre>{error}</pre>
                <button onClick={() => setError("")}>Dismiss</button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                {notice}
              </div>
            )}
            {findings.length > 0 && (
              <details className="alert">
                <summary>{findings.length} validation findings</summary>
                {findings.map((finding, i) => (
                  <p key={i}>
                    {finding.severity} {finding.code} · {finding.file}:
                    {finding.line}:{finding.column} · {finding.message}
                    {finding.waiver &&
                      ` · waived by ${finding.waiver.issuer}: ${finding.waiver.reason}`}
                  </p>
                ))}
              </details>
            )}
            {busy && (
              <div className="busy" role="status">
                {progress}{" "}
                <button
                  onClick={() => {
                    void fetch("/api/cancel", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        operation: activeOperation.current,
                      }),
                    })
                      .then((r) => r.json())
                      .then((result) => {
                        if (result.accepted) activeController.current?.abort();
                        else
                          setProgress(
                            "Finishing atomic replacement before cancellation.",
                          );
                      });
                  }}
                >
                  Cancel operation
                </button>
              </div>
            )}
            {!data ? (
              <div className="empty">Opening the repository…</div>
            ) : (
              <>
                <section className="metrics" aria-label="Scope summary">
                  <div>
                    <span>In scope</span>
                    <strong>
                      {data.summary.denominator}
                      <small> / {data.summary.total}</small>
                    </strong>
                    <p>{data.summary.exclusions} excluded or retired</p>
                  </div>
                  <div>
                    <span>Approved</span>
                    <strong>
                      {data.summary.approved}
                      <small> / {data.summary.denominator}</small>
                    </strong>
                    <p>Exact revision decisions</p>
                  </div>
                  <div>
                    <span>Current verification</span>
                    <strong>
                      {data.summary.verified}
                      <small> / {data.summary.denominator}</small>
                    </strong>
                    <p>Artifact selection required</p>
                  </div>
                  <div>
                    <span>Needs attention</span>
                    <strong>
                      {data.summary.stale + data.summary.conflicted}
                    </strong>
                    <p>
                      {data.summary.stale} stale · {data.summary.conflicted}{" "}
                      conflicted · {data.summary.unknown} unknown
                    </p>
                  </div>
                </section>
                {(page === "Register" || page === "Work queue") && (
                  <div
                    className={`register-layout ${active ? "with-detail" : ""}`}
                  >
                    <section className="panel register">
                      <div className="panel-toolbar">
                        <label className="search">
                          <span aria-hidden="true">⌕</span>
                          <input
                            aria-label="Search requirements"
                            placeholder="Search IDs, titles, and statements…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </label>
                        <select
                          aria-label="Filter disposition"
                          value={disposition}
                          onChange={(e) => setDisposition(e.target.value)}
                        >
                          <option value="">All dispositions</option>
                          <option value="in_scope">In scope</option>
                          <option value="deferred">Deferred</option>
                          <option value="not_applicable">Not applicable</option>
                          <option value="transferred">Transferred</option>
                        </select>
                      </div>
                      <div className="table-scroll">
                        <div className="filter-bar">
                          <label>
                            Specification
                            <select
                              value={filters.specification}
                              onChange={(e) =>
                                setFilters({
                                  ...filters,
                                  specification: e.target.value,
                                })
                              }
                            >
                              <option value="">All</option>
                              {Array.from(
                                new Map(
                                  data.documents.map((d) => [
                                    d.specification,
                                    d.specification,
                                  ]),
                                ).values(),
                              ).map((uid) => (
                                <option key={uid} value={uid}>
                                  {data.requirements
                                    .find((r) => r.specification === uid)
                                    ?.qualifiedId.split(":")[0] ?? uid}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Lifecycle
                            <select
                              value={filters.lifecycle}
                              onChange={(e) =>
                                setFilters({
                                  ...filters,
                                  lifecycle: e.target.value,
                                })
                              }
                            >
                              <option value="">All</option>
                              {["draft", "active", "retired"].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Status
                            <select
                              value={filters.status}
                              onChange={(e) =>
                                setFilters({
                                  ...filters,
                                  status: e.target.value,
                                })
                              }
                            >
                              <option value="">All</option>
                              {[
                                "unreviewed",
                                "approved",
                                "changes_requested",
                                "rejected",
                                "implemented",
                                "partial",
                                "passed",
                                "failed",
                                "blocked",
                                "conflicted",
                                "not_assessed",
                              ].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Currency
                            <select
                              value={filters.currency}
                              onChange={(e) =>
                                setFilters({
                                  ...filters,
                                  currency: e.target.value,
                                })
                              }
                            >
                              <option value="">All</option>
                              {["current", "needs_review", "unknown"].map(
                                (v) => (
                                  <option key={v}>{v}</option>
                                ),
                              )}
                            </select>
                          </label>
                          <span>
                            {rows.length} of {data.requirements.length} selected
                          </span>
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th>Requirement</th>
                              <th>Lifecycle</th>
                              <th>Approval</th>
                              <th>Currency</th>
                              <th aria-label="Details" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows
                              .filter(
                                (r) =>
                                  page !== "Work queue" ||
                                  r.state.approval !== "approved" ||
                                  r.state.currency !== "current",
                              )
                              .map((r) => (
                                <tr
                                  key={r.uid}
                                  className={
                                    selected === r.uid ? "selected" : ""
                                  }
                                >
                                  <td>
                                    <button
                                      className="row-link"
                                      onClick={() => select(r.uid)}
                                    >
                                      <span className="reference">
                                        {r.qualifiedId}
                                      </span>
                                      <strong>{r.title}</strong>
                                    </button>
                                    <small className="row-source">
                                      {r.path}
                                    </small>
                                  </td>
                                  <td>
                                    <Badge value={r.lifecycle} />
                                  </td>
                                  <td>
                                    <Badge value={r.state.approval} />
                                  </td>
                                  <td>
                                    <Badge value={r.state.currency} />
                                  </td>
                                  <td>
                                    <button
                                      className="icon-button"
                                      aria-label={`Open ${r.qualifiedId}`}
                                      onClick={() => select(r.uid)}
                                    >
                                      ↗
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {!rows.length && (
                        <div className="empty">
                          <span>◇</span>
                          <h3>
                            {data.requirements.length
                              ? "No matching requirements"
                              : "Start with a clear obligation"}
                          </h3>
                          <p>
                            {data.requirements.length
                              ? "Try another search or filter."
                              : "Create a requirement in an included Markdown document."}
                          </p>
                          <button
                            disabled={!editable}
                            onClick={() => startEdit()}
                          >
                            Create requirement
                          </button>
                        </div>
                      )}
                      <footer className="panel-footer">
                        {rows.length} requirements{" "}
                        <span>
                          Scope:{" "}
                          <input
                            aria-label="Assessment scope"
                            value={scope}
                            onChange={(e) => setScope(e.target.value)}
                          />
                        </span>
                      </footer>
                    </section>
                    {active && (
                      <aside className="panel detail">
                        <div className="detail-top">
                          <span className="reference">
                            {active.qualifiedId}
                          </span>
                          <button
                            className="icon-button"
                            onClick={() => setSelected(null)}
                            aria-label="Close requirement detail"
                          >
                            ×
                          </button>
                        </div>
                        <h2>{active.title}</h2>
                        <div className="badges">
                          <Badge value={active.lifecycle} />
                          <Badge value={active.state.approval} />
                          <Badge value={active.state.currency} />
                        </div>
                        <div className="detail-actions">
                          <button
                            disabled={!editable}
                            onClick={() => {
                              setReviewToken(active.fileToken);
                              setRecordForm("change");
                            }}
                          >
                            Change rationale
                          </button>
                          <button
                            onClick={() =>
                              void perform(async () => {
                                const result = await command({
                                  operation: "history",
                                  ref,
                                  target: active.uid,
                                });
                                setHistoryView(
                                  result.data as Record<string, unknown>,
                                );
                              })
                            }
                          >
                            History
                          </button>
                          <button
                            disabled={!editable}
                            onClick={() => startEdit(active)}
                          >
                            Edit
                          </button>
                          <button
                            disabled={!editable}
                            onClick={() => {
                              setReviewToken(active.fileToken);
                              setRecordForm("review");
                            }}
                          >
                            Review
                          </button>
                          <button
                            disabled={!editable}
                            onClick={() => {
                              setReviewToken(active.fileToken);
                              setRecordForm("assess");
                            }}
                          >
                            Assess
                          </button>
                        </div>
                        <MarkdownView text={active.markdown} />
                        <div className="detail-section">
                          <h3>Governing context</h3>
                          <p>
                            {
                              data.documents.find(
                                (d) => d.uid === active.document,
                              )?.title
                            }{" "}
                            ·{" "}
                            {
                              data.documents.find(
                                (d) => d.uid === active.document,
                              )?.context
                            }
                          </p>
                          <button
                            className="text-button"
                            onClick={() =>
                              void perform(async () => {
                                const result = await command({
                                  operation: "document.show",
                                  ref,
                                  target: active.path,
                                });
                                setDocumentView(
                                  result.data as {
                                    title: string;
                                    source: string;
                                  },
                                );
                              })
                            }
                          >
                            Read surrounding document
                          </button>
                          <h3>Traceability</h3>
                          {active.relations.length ? (
                            active.relations.map((r, i) => (
                              <p key={i}>
                                <span>{words(r.type)}</span>{" "}
                                <button
                                  className="text-button"
                                  onClick={() => select(r.target)}
                                >
                                  {data.requirements.find(
                                    (row) => row.uid === r.target,
                                  )?.qualifiedId ?? r.target}
                                </button>
                              </p>
                            ))
                          ) : (
                            <p>No relationships recorded.</p>
                          )}
                          <button
                            className="text-button"
                            disabled={!editable}
                            onClick={() => {
                              setReviewToken(active.fileToken);
                              setRecordForm("verification");
                            }}
                          >
                            ＋ Define verification obligation
                          </button>
                        </div>
                        <div className="detail-section">
                          <h3>Decisions & evidence</h3>
                          <p className="muted">
                            Actor names are local claims, not authenticated
                            identities.
                          </p>
                          {active.state.records.length ? (
                            active.state.records.map((r) => (
                              <div className="record" key={r.uid}>
                                <div>
                                  <Badge
                                    value={r.decision ?? r.result ?? r.kind}
                                  />{" "}
                                  <Badge value={r.currency} />
                                </div>
                                <p>{r.rationale}</p>
                                {r.attachments?.map((a) => (
                                  <p key={a.path}>
                                    {a.path} · {a.size} bytes · SHA-256{" "}
                                    {a.sha256}
                                  </p>
                                ))}
                                {r.kind === "evidence" && (
                                  <button
                                    disabled={!editable}
                                    onClick={() => setAttachmentRecord(r)}
                                  >
                                    Attach evidence file
                                  </button>
                                )}
                                <small>
                                  {r.actor} ·{" "}
                                  {new Date(r.created_at).toLocaleString()} ·{" "}
                                  {r.scope}
                                </small>
                              </div>
                            ))
                          ) : (
                            <p>No decisions recorded for this scope.</p>
                          )}
                        </div>
                        <div className="detail-section">
                          <h3>Source & identity</h3>
                          <p>
                            {active.path}:{active.line}
                          </p>
                          <code className="long-id">{active.uid}</code>
                          <button
                            className="text-button"
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(
                                  `${location.origin}/?ref=${encodeURIComponent(ref)}#${active.uid}`,
                                )
                                .then(() =>
                                  setNotice("Local requirement link copied."),
                                )
                            }
                          >
                            Copy local link
                          </button>
                        </div>
                      </aside>
                    )}
                  </div>
                )}
                {page === "Documents" && (
                  <div className="document-grid">
                    {data.documents.map((d) => (
                      <section key={d.uid} className="panel document-card">
                        <button
                          className="text-button"
                          onClick={() =>
                            void perform(async () => {
                              const result = await command({
                                operation: "document.show",
                                ref,
                                target: d.path,
                              });
                              setDocumentView(
                                result.data as {
                                  title: string;
                                  source: string;
                                },
                              );
                            })
                          }
                        >
                          Read full document →
                        </button>
                        <span className="document-symbol">▱</span>
                        <Badge value={d.context} />
                        <h2>{d.title}</h2>
                        <p>{d.path}</p>
                        <small>
                          {d.requirements.length} requirements ·{" "}
                          {d.context === "normative"
                            ? "Surrounding prose governs its requirements"
                            : "Surrounding prose is informational"}
                        </small>
                        <div className="document-contents">
                          {d.requirements.map((r) => (
                            <button
                              className="row-link"
                              key={r.uid}
                              onClick={() => {
                                select(r.uid);
                                setPage("Register");
                              }}
                            >
                              <span className="reference">{r.qualifiedId}</span>
                              {r.title}
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {page === "Compare" && (
                  <section className="panel">
                    <form
                      className="compare-controls"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void perform(async () =>
                          setComparison(
                            (await command({ operation: "diff", base, head }))
                              .data as Record<string, unknown>,
                          ),
                        );
                      }}
                    >
                      <label>
                        Base snapshot
                        <input
                          value={base}
                          onChange={(e) => setBase(e.target.value)}
                          required
                        />
                      </label>
                      <span>→</span>
                      <label>
                        Head snapshot
                        <input
                          value={head}
                          onChange={(e) => setHead(e.target.value)}
                          required
                        />
                      </label>
                      <button className="primary" disabled={busy}>
                        Compare endpoints
                      </button>
                    </form>
                    {comparison ? (
                      <>
                        <p className="panel-note">
                          Endpoint comparison ·{" "}
                          {String(
                            comparison.configurationChanged
                              ? "Configuration changed"
                              : "Configuration unchanged",
                          )}
                        </p>
                        <button
                          onClick={() =>
                            void perform(async () => {
                              setImpactView(
                                (
                                  await command({
                                    operation: "impact",
                                    base,
                                    head,
                                  })
                                ).data as Record<string, unknown>,
                              );
                            })
                          }
                        >
                          Analyze downstream impact
                        </button>
                        {impactView && (
                          <div className="detail-section">
                            <h3>Upstream impact obligations</h3>
                            {(
                              impactView.affected as {
                                uid: string;
                                trigger: string;
                                path: string[];
                                resolution: string;
                              }[]
                            ).map((item, i) => (
                              <div className="record" key={i}>
                                <Badge value={item.resolution} />
                                <p>
                                  {item.path
                                    .map(
                                      (uid) =>
                                        data.requirements.find(
                                          (r) => r.uid === uid,
                                        )?.qualifiedId ?? uid,
                                    )
                                    .join(" → ")}
                                </p>
                                <button
                                  disabled={!editable}
                                  onClick={() => {
                                    select(item.uid);
                                    setPage("Register");
                                    setImpactTrigger(item.trigger);
                                    setReviewToken(
                                      data.requirements.find(
                                        (r) => r.uid === item.uid,
                                      )?.fileToken ?? "",
                                    );
                                    setRecordForm("impact");
                                  }}
                                >
                                  Record impact decision
                                </button>
                              </div>
                            ))}
                            {impactView.complete === false && (
                              <p role="alert">
                                Impact traversal is incomplete.
                              </p>
                            )}
                          </div>
                        )}
                        {(
                          comparison.changes as {
                            uid: string;
                            label: string;
                            classes: string[];
                            before: Requirement | null;
                            after: Requirement | null;
                          }[]
                        ).map((c) => (
                          <article className="change-card" key={c.uid}>
                            <h3>{c.label}</h3>
                            <div className="badges">
                              {c.classes.map((cls) => (
                                <Badge key={cls} value={cls} />
                              ))}
                            </div>
                            <div className="diff-columns">
                              <div>
                                <small>BEFORE</small>
                                <pre>{c.before?.markdown ?? "Not present"}</pre>
                              </div>
                              <div>
                                <small>AFTER</small>
                                <pre>{c.after?.markdown ?? "Not present"}</pre>
                              </div>
                            </div>
                          </article>
                        ))}
                        {!(comparison.changes as unknown[]).length && (
                          <div className="empty">
                            No requirement changes between these endpoints.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="empty">
                        <span>⇄</span>
                        <h3>Every change has context</h3>
                        <p>
                          Compare commits, your working tree, or baseline:name.
                        </p>
                      </div>
                    )}
                  </section>
                )}
                {page === "Traceability" && (
                  <section className="panel">
                    <div className="panel-toolbar">
                      <h2>Relationship matrix</h2>
                      <span>
                        Links describe intent. They do not prove compliance.
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Requirement</th>
                            <th>Relation</th>
                            <th>Target</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.flatMap((r) =>
                            r.relations.map((edge, i) => (
                              <tr key={`${r.uid}-${i}`}>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      select(r.uid);
                                      setPage("Register");
                                    }}
                                  >
                                    {r.qualifiedId}
                                  </button>
                                </td>
                                <td>{words(edge.type)}</td>
                                <td>
                                  {data.requirements.find(
                                    (t) => t.uid === edge.target,
                                  )?.qualifiedId ??
                                    data.records.find(
                                      (t) => t.uid === edge.target,
                                    )?.title ??
                                    edge.target}
                                </td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                    {!data.requirements.some((r) => r.relations.length) && (
                      <div className="empty">
                        Add typed relationships in the requirement editor.
                      </div>
                    )}
                  </section>
                )}
                {page === "Baselines" && (
                  <section className="panel">
                    <div className="panel-toolbar">
                      <h2>Preserved snapshots</h2>
                      <button
                        disabled={!editable}
                        className="primary"
                        onClick={() => setBaselineForm(true)}
                      >
                        ＋ Create baseline
                      </button>
                    </div>
                    {data.baselines.length ? (
                      data.baselines.map((b) => (
                        <article className="baseline-row" key={b.uid}>
                          <div>
                            <span className="eyebrow">
                              IMMUTABLE COMMIT SNAPSHOT
                            </span>
                            <h3>{b.name}</h3>
                            <p>{b.description}</p>
                            <code>{b.target}</code>
                          </div>
                          <div>
                            <p>{b.selection.length} requirements</p>
                            <small>
                              {b.actor} ·{" "}
                              {new Date(b.created_at).toLocaleDateString()}
                            </small>
                            <button
                              onClick={() => {
                                setRef(`baseline:${b.name}`);
                                setPage("Register");
                              }}
                            >
                              Browse baseline →
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty">
                        <span>◇</span>
                        <h3>A stable point of reference</h3>
                        <p>
                          Commit definitions and decisions, then create a
                          baseline at that commit.
                        </p>
                      </div>
                    )}
                  </section>
                )}
                <details className="artifact-selector">
                  <summary>
                    Evaluated artifact{" "}
                    {artifact
                      ? `· ${artifact.repository} @ ${artifact.revision}`
                      : "· not selected; verification currency is unknown"}
                  </summary>
                  <div className="form-grid">
                    <label>
                      Repository or product
                      <input
                        value={artifactRepository}
                        onChange={(e) => setArtifactRepository(e.target.value)}
                      />
                    </label>
                    <label>
                      Commit or digest
                      <input
                        value={artifactRevision}
                        onChange={(e) => setArtifactRevision(e.target.value)}
                      />
                    </label>
                  </div>
                </details>
                <footer className="workspace-footer">
                  <span>{snapshot?.repository}</span>
                  <div>
                    <label>
                      Report
                      <select
                        value={report}
                        onChange={(e) =>
                          setReport(e.target.value as typeof report)
                        }
                      >
                        {["inventory", "comparison", "matrix", "gaps"].map(
                          (v) => (
                            <option key={v}>{v}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      onClick={() => void perform(() => download("csv"))}
                    >
                      CSV
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void perform(() => download("markdown"))}
                    >
                      Markdown
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void perform(() => download("json"))}
                    >
                      JSON export
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void perform(() => download("portable"))}
                    >
                      Portable archive
                    </button>
                    <button
                      className="text-button"
                      disabled={!editable}
                      onClick={() => setImportForm("evidence")}
                    >
                      Import evidence
                    </button>
                    <button
                      className="text-button"
                      disabled={!editable}
                      onClick={() => setImportForm("migration")}
                    >
                      Migrate sources
                    </button>
                  </div>
                </footer>
              </>
            )}
          </main>
        </div>
        {editor && (
          <Dialog
            title={editor.uid ? "Edit requirement" : "New requirement"}
            close={() => setEditor(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const change =
                  form.get("changeActor") || form.get("changeRationale")
                    ? {
                        actor: String(form.get("changeActor")),
                        rationale: String(form.get("changeRationale")),
                        work_references: String(
                          form.get("changeReferences") ?? "",
                        )
                          .split("\n")
                          .filter(Boolean),
                      }
                    : undefined;
                void perform(() =>
                  preview({
                    operation: editor.uid
                      ? "requirement.edit"
                      : "requirement.add",
                    target: editor.uid,
                    input: {
                      ...(change ? { change } : {}),
                      document: editor.document,
                      markdown: editor.markdown,
                      metadata: {
                        ...editor.metadata,
                        id: editor.id,
                        lifecycle: editor.lifecycle,
                        disposition: editor.disposition,
                      },
                      ...(editor.fileToken
                        ? { fileToken: editor.fileToken }
                        : {}),
                    },
                  }),
                );
              }}
            >
              <div className="form-grid">
                <label>
                  Human ID
                  <input
                    required
                    value={editor.id}
                    onChange={(e) =>
                      setEditor({ ...editor, id: e.target.value })
                    }
                    placeholder="REQ-001"
                  />
                </label>
                <label>
                  Document
                  <select
                    disabled={Boolean(editor.uid)}
                    value={editor.document}
                    onChange={(e) =>
                      setEditor({ ...editor, document: e.target.value })
                    }
                  >
                    {data?.documents.map((d) => (
                      <option key={d.uid} value={d.path}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Lifecycle
                  <select
                    value={editor.lifecycle}
                    onChange={(e) =>
                      setEditor({ ...editor, lifecycle: e.target.value })
                    }
                  >
                    <option>draft</option>
                    <option>active</option>
                    <option>retired</option>
                  </select>
                </label>
                <label>
                  Disposition
                  <select
                    value={editor.disposition}
                    onChange={(e) =>
                      setEditor({ ...editor, disposition: e.target.value })
                    }
                  >
                    {[
                      "in_scope",
                      "deferred",
                      "not_applicable",
                      "transferred",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              {editor.lifecycle === "retired" && (
                <label>
                  Retirement reason
                  <input
                    required
                    value={String(editor.metadata.retirement_reason ?? "")}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        metadata: {
                          ...editor.metadata,
                          retirement_reason: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              )}
              {["deferred", "not_applicable", "transferred"].includes(
                editor.disposition,
              ) && (
                <label>
                  {editor.disposition === "transferred"
                    ? "Transfer target"
                    : "Disposition reason"}
                  <input
                    required
                    value={String(
                      editor.metadata[
                        editor.disposition === "transferred"
                          ? "target"
                          : "reason"
                      ] ?? "",
                    )}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        metadata: {
                          ...editor.metadata,
                          [editor.disposition === "transferred"
                            ? "target"
                            : "reason"]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              )}
              <div className="editor-columns">
                <label>
                  Markdown source
                  <textarea
                    className="source-editor"
                    value={editor.markdown}
                    onChange={(e) =>
                      setEditor({ ...editor, markdown: e.target.value })
                    }
                    required
                    spellCheck
                  />
                </label>
                <section>
                  <span className="field-label">Rendered preview</span>
                  <div className="preview">
                    <MarkdownView text={editor.markdown} />
                  </div>
                </section>
              </div>
              <details>
                <summary>Custom fields and relationships</summary>
                <JsonField
                  label="Custom fields"
                  initial={editor.metadata.fields ?? {}}
                  onChange={(value) =>
                    setEditor({
                      ...editor,
                      metadata: { ...editor.metadata, fields: value },
                    })
                  }
                />
                <RelationEditor
                  relations={
                    (editor.metadata.relations ?? []) as unknown as Relation[]
                  }
                  requirements={data?.requirements ?? []}
                  definitions={
                    data?.records.filter((r) => r.kind === "verification") ?? []
                  }
                  onChange={(relations) =>
                    setEditor({
                      ...editor,
                      metadata: {
                        ...editor.metadata,
                        relations: relations.map((r) => ({
                          type: r.type,
                          target: r.target,
                        })),
                      },
                    })
                  }
                />
              </details>
              <p className="muted">
                A preview shows the exact files before saving. A source conflict
                retains this draft.
              </p>
              {editor.uid &&
                data?.requirements.find((r) => r.uid === editor.uid)
                  ?.fileToken !== editor.fileToken && (
                  <section className="notice">
                    <h3>The source has changed</h3>
                    <p>
                      Inspect the saved version below. Reconciliation keeps your
                      draft and updates its source token.
                    </p>
                    <details>
                      <summary>Latest saved definition</summary>
                      <pre>
                        {
                          data?.requirements.find((r) => r.uid === editor.uid)
                            ?.markdown
                        }
                      </pre>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        const current = data?.requirements.find(
                          (r) => r.uid === editor.uid,
                        );
                        if (current) {
                          setEditor({
                            ...editor,
                            fileToken: current.fileToken,
                          });
                          setError("");
                        }
                      }}
                    >
                      Reconcile this draft against the latest source
                    </button>
                  </section>
                )}
              <div className="form-actions">
                <details>
                  <summary>Change rationale for this edit</summary>
                  <label>
                    Actor
                    <input name="changeActor" />
                  </label>
                  <label>
                    Rationale
                    <textarea name="changeRationale" />
                  </label>
                  <label>
                    Work references (one per line)
                    <textarea name="changeReferences" />
                  </label>
                </details>
                <button type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  Preview changes →
                </button>
              </div>
            </form>
          </Dialog>
        )}
        {plan && (
          <Dialog title="Review file changes" close={() => setPlan(null)}>
            <p>
              These changes will be written to your working tree. Git staging
              and commits are separate.
            </p>
            {plan.entries.map((e) => (
              <details key={e.path} open>
                <summary>
                  {e.path} <Badge value={e.before ? "modified" : "new"} />
                </summary>
                <pre className="plan-source">{decode(e.after)}</pre>
              </details>
            ))}
            <div className="form-actions">
              <button onClick={() => setPlan(null)}>Back to draft</button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("/api/apply", { plan: plan.uid });
                    setPlan(null);
                    setEditor(null);
                    setRecordForm(null);
                    setBaselineForm(false);
                    setImportForm(null);
                    setAttachmentRecord(null);
                    setNotice(
                      "Saved to the working tree. Review and commit with your usual Git tools.",
                    );
                    await load();
                  })
                }
              >
                Apply changes
              </button>
            </div>
          </Dialog>
        )}
        {recordForm && active && (
          <RecordDialog
            kind={recordForm}
            row={active}
            close={() => setRecordForm(null)}
            busy={busy}
            base={base}
            trigger={impactTrigger}
            submit={(input) =>
              void perform(() =>
                preview({
                  operation: `${recordForm}.create`,
                  target: active.uid,
                  input: { ...input, fileToken: reviewToken },
                }),
              )
            }
          />
        )}
        {historyView && (
          <Dialog
            title="Requirement history"
            close={() => setHistoryView(null)}
          >
            <p>
              Git author names are reported claims.{" "}
              {historyView.complete === false
                ? "Available history is incomplete."
                : "Available history scanned."}
            </p>
            {(
              historyView.history as {
                commit: string;
                parent: string | null;
                authorClaim?: string;
                time?: string;
                message?: string;
                unavailable?: string;
                change?: {
                  classes: string[];
                  before?: Requirement;
                  after?: Requirement;
                };
              }[]
            ).map((item, i) => (
              <article className="record" key={i}>
                <p>
                  {item.message} · {item.authorClaim} · {item.time}
                </p>
                <code>{item.commit}</code>
                <p>Parent: {item.parent ?? "initial commit"}</p>
                <p>{item.unavailable ?? item.change?.classes.join(", ")}</p>
                {item.change && (
                  <details>
                    <summary>Definition and source at this revision</summary>
                    <pre>
                      {item.change.after?.markdown ??
                        item.change.before?.markdown}
                    </pre>
                  </details>
                )}
                <button
                  onClick={() => {
                    setRef(item.commit);
                    setHistoryView(null);
                  }}
                >
                  Open snapshot
                </button>
              </article>
            ))}
          </Dialog>
        )}
        {attachmentRecord && (
          <Dialog
            title="Attach an evidence file"
            close={() => setAttachmentRecord(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const file = form.get("attachment") as File;
                const reader = new FileReader();
                reader.onload = () =>
                  void perform(() =>
                    preview({
                      operation: "evidence.attach",
                      target: attachmentRecord.uid,
                      input: {
                        name: file.name,
                        content: String(reader.result).split(",")[1],
                        actor: String(form.get("actor")),
                        rationale: String(form.get("rationale")),
                      },
                    }),
                  );
                reader.readAsDataURL(file);
              }}
            >
              <p>
                The new evidence record retains the original assessed revisions
                and supersedes the original record.
              </p>
              <label>
                Evidence attachment
                <input type="file" name="attachment" required />
              </label>
              <label>
                Actor
                <input name="actor" required />
              </label>
              <label>
                Rationale
                <textarea name="rationale" required />
              </label>
              <button className="primary" disabled={busy}>
                Preview attachment
              </button>
            </form>
          </Dialog>
        )}
        {documentView && (
          <Dialog
            title={documentView.title}
            close={() => setDocumentView(null)}
          >
            <MarkdownView text={documentView.source} />
            <details>
              <summary>Markdown source</summary>
              <pre>{documentView.source}</pre>
            </details>
          </Dialog>
        )}
        {baselineForm && (
          <Dialog title="Create baseline" close={() => setBaselineForm(false)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void perform(() =>
                  preview({
                    operation: "baseline.create",
                    input: Object.fromEntries(f) as ObjectValue,
                  }),
                );
              }}
            >
              <label>
                Name
                <input name="name" required placeholder="release-1.0" />
              </label>
              <label>
                Target commit or reference
                <input name="target" defaultValue="HEAD" required />
              </label>
              <label>
                Creator claim
                <input name="actor" required />
              </label>
              <label>
                Description
                <textarea name="description" />
              </label>
              <p className="muted">
                The manifest pins the resolved commit. Commit the manifest
                afterward.
              </p>
              <div className="form-actions">
                <button className="primary" disabled={busy}>
                  Preview baseline
                </button>
              </div>
            </form>
          </Dialog>
        )}
        {importForm && (
          <ImportDialog
            kind={importForm}
            close={() => setImportForm(null)}
            busy={busy}
            submit={(input) =>
              void perform(() =>
                preview({
                  operation:
                    importForm === "evidence" ? "evidence.import" : "migrate",
                  input,
                }),
              )
            }
          />
        )}
      </div>
    </ErrorContext.Provider>
  );
}
function decode(value: string | null): string {
  return value
    ? new TextDecoder().decode(
        Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
      )
    : "[deleted]";
}
function RelationEditor({
  relations,
  requirements,
  definitions,
  onChange,
}: {
  relations: Relation[];
  requirements: Row[];
  definitions: DurableRecord[];
  onChange: (relations: Relation[]) => void;
}) {
  const update = (index: number, changes: Partial<Relation>) =>
    onChange(relations.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  return (
    <section>
      <h3>Typed relationships</h3>
      {relations.map((relation, index) => (
        <div className="relation-row" key={index}>
          <label>
            Relation
            <select
              value={relation.type}
              onChange={(e) =>
                update(index, { type: e.target.value, target: "" })
              }
            >
              {[
                "refines",
                "depends_on",
                "related_to",
                "supersedes",
                "verified_by",
                "implemented_by",
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Target
            {relation.type === "implemented_by" ? (
              <input
                required
                value={relation.target}
                onChange={(e) => update(index, { target: e.target.value })}
                placeholder="https://… or git:…"
              />
            ) : (
              <select
                required
                value={relation.target}
                onChange={(e) => update(index, { target: e.target.value })}
              >
                <option value="">Select target</option>
                {relation.type === "verified_by"
                  ? definitions.map((r) => (
                      <option key={r.uid} value={r.uid}>
                        {r.title}
                      </option>
                    ))
                  : requirements.map((r) => (
                      <option key={r.uid} value={r.uid}>
                        {r.qualifiedId} · {r.title}
                      </option>
                    ))}
              </select>
            )}
          </label>
          <button
            type="button"
            onClick={() => onChange(relations.filter((_, i) => i !== index))}
            aria-label={`Remove relationship ${index + 1}`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...relations, { type: "related_to", target: "" }])
        }
      >
        ＋ Add relationship
      </button>
    </section>
  );
}
function JsonField({
  label,
  initial,
  onChange,
}: {
  label: string;
  initial: unknown;
  onChange: (value: ObjectValue[string]) => void;
}) {
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const [error, setError] = useState("");
  return (
    <label>
      {label}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
            e.target.setCustomValidity("");
          } catch {
            setError("Enter valid JSON.");
            e.target.setCustomValidity("Enter valid JSON.");
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
function RecordDialog({
  kind,
  row,
  close,
  submit,
  busy,
  base,
  trigger,
}: {
  kind: "review" | "assess" | "verification" | "change" | "impact";
  row: Row;
  close: () => void;
  submit: (input: ObjectValue) => void;
  busy: boolean;
  base: string;
  trigger: string;
}) {
  const [category, setCategory] = useState("implementation");
  return (
    <Dialog
      title={`${kind === "review" ? "Review" : kind === "assess" ? "Assess" : kind === "change" ? "Change rationale for" : kind === "impact" ? "Impact decision for" : "Define verification for"} ${row.qualifiedId}`}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const input: ObjectValue = {
            actor: String(f.get("actor")),
            rationale: String(f.get("rationale")),
          };
          if (kind === "change" || kind === "impact") {
            input.base = String(f.get("base"));
            if (kind === "impact") input.trigger = String(f.get("trigger"));
            if (f.get("work_references"))
              input.work_references = String(f.get("work_references"))
                .split("\n")
                .filter(Boolean);
          }
          if (kind === "verification") {
            input.title = String(f.get("title"));
            input.method = String(f.get("method"));
          } else if (kind !== "change") {
            input.decision = String(f.get("decision"));
            if (kind === "assess") input.category = category;
            if (f.get("role")) input.role = String(f.get("role"));
          }
          if (f.get("artifactRepository") && f.get("artifactRevision"))
            input.artifact = {
              repository: String(f.get("artifactRepository")),
              revision: String(f.get("artifactRevision")),
            };
          if (f.get("supersedes"))
            input.supersedes = String(f.get("supersedes"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          if (f.get("obligations"))
            input.obligations = String(f.get("obligations"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          if (f.get("evidence"))
            input.evidence = String(f.get("evidence"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          submit(input);
        }}
      >
        <p className="muted">
          Binds the exact definition, governing context, and upstream
          dependencies. Actor identity is an unauthenticated local claim.
        </p>
        <label>
          Actor name
          <input name="actor" required />
        </label>
        {(kind === "change" || kind === "impact") && (
          <>
            <label>
              Before revision
              <input name="base" defaultValue={base} required />
            </label>
            {kind === "impact" && (
              <label>
                Changed upstream requirement UUID
                <input name="trigger" defaultValue={trigger} required />
              </label>
            )}
            {kind === "change" && (
              <label>
                Work references (one per line)
                <textarea name="work_references" />
              </label>
            )}
          </>
        )}
        {kind === "verification" ? (
          <>
            <label>
              Verification title
              <input name="title" required />
            </label>
            <label>
              Method
              <select name="method">
                {[
                  "test",
                  "inspection",
                  "analysis",
                  "demonstration",
                  "manual_acceptance",
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </>
        ) : kind !== "change" ? (
          <>
            {kind === "assess" && (
              <label>
                Assessment dimension
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>implementation</option>
                  <option>verification</option>
                </select>
              </label>
            )}
            <label>
              Decision
              <select name="decision" key={category}>
                {(kind === "impact"
                  ? ["no_impact", "rework", "reverify"]
                  : kind === "review"
                    ? ["approved", "changes_requested", "rejected", "revoked"]
                    : category === "implementation"
                      ? ["not_started", "partial", "implemented"]
                      : [
                          "planned",
                          "passed",
                          "failed",
                          "blocked",
                          "inconclusive",
                        ]
                ).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {kind === "review" && (
              <label>
                Claimed reviewer role
                <input name="role" />
              </label>
            )}
            {kind === "assess" && category === "verification" && (
              <>
                <label>
                  Evaluated repository / product
                  <input name="artifactRepository" />
                </label>
                <label>
                  Evaluated commit / digest
                  <input name="artifactRevision" />
                </label>
                <label>
                  Required obligation UUIDs (comma-separated)
                  <input name="obligations" />
                </label>
                <label>
                  Accepted evidence UUIDs (comma-separated)
                  <input name="evidence" />
                </label>
              </>
            )}
            <label>
              Superseded record UUIDs (optional, comma-separated)
              <input name="supersedes" />
            </label>
          </>
        ) : null}
        <label>
          Rationale
          <textarea name="rationale" required />
        </label>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            Preview record
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function ImportDialog({
  kind,
  close,
  submit,
  busy,
}: {
  kind: "evidence" | "migration";
  close: () => void;
  submit: (input: ObjectValue) => void;
  busy: boolean;
}) {
  const [content, setContent] = useState("");
  const [mapping, setMapping] = useState<ObjectValue>(
    kind === "evidence"
      ? {
          producer: "junit",
          run_id: "run-001",
          actor: "",
          artifact: { repository: "", revision: "" },
          mapping: {},
        }
      : {
          source: "legacy.csv",
          destination: "requirements/imported.md",
          format: "csv",
          mapping: { id: "id", title: "title", statement: "statement" },
        },
  );
  return (
    <Dialog
      title={
        kind === "evidence"
          ? "Import verification evidence"
          : "Preview source migration"
      }
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ ...mapping, content });
        }}
      >
        <p>
          Explicit mappings preserve meaning. Imported statuses never become
          approvals or passing assessments automatically.
        </p>
        <label>
          Source file
          <input
            type="file"
            accept={kind === "evidence" ? ".xml,.json" : ".csv,.json,.md"}
            required
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(setContent);
            }}
          />
        </label>
        <JsonField
          label="Import mapping and provenance"
          initial={mapping}
          onChange={(v) => setMapping(v as ObjectValue)}
        />
        <div className="form-actions">
          <button className="primary" disabled={busy || !content}>
            Preview import
          </button>
        </div>
      </form>
    </Dialog>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
