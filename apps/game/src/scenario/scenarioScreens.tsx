import { useMemo, useState } from "react";
import {
  exportScenarioJson,
  importScenarioJson,
  validateScenario,
  scenarioHasBlockingErrors,
  type ScenarioDocument,
  type ScenarioValidationIssue,
} from "@lorsain/scenario";

type ImportPhase = "pick" | "summary";

function issueRow(issue: ScenarioValidationIssue, onNavigate?: (path: string) => void) {
  return (
    <li
      key={`${issue.severity}-${issue.path}-${issue.code}`}
      className={`scenario-issue scenario-issue-${issue.severity}`}
    >
      <button
        type="button"
        className="scenario-issue-link"
        onClick={() => onNavigate?.(issue.path)}
        disabled={!onNavigate}
      >
        <code>{issue.path || "(root)"}</code> · {issue.code}
      </button>
      <span>{issue.message}</span>
    </li>
  );
}

export function ScenarioImportScreen(props: {
  onBack: () => void;
  onPlay: (doc: ScenarioDocument) => void;
  onEdit: (doc: ScenarioDocument) => void;
}) {
  const [phase, setPhase] = useState<ImportPhase>("pick");
  const [doc, setDoc] = useState<ScenarioDocument | null>(null);
  const [report, setReport] = useState(() => ({
    errors: [] as ScenarioValidationIssue[],
    warnings: [] as ScenarioValidationIssue[],
    suggestions: [] as ScenarioValidationIssue[],
  }));
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Invalid JSON");
      setDoc(null);
      setPhase("summary");
      return;
    }
    const rawReport = validateScenario(parsed);
    setReport(rawReport);
    const imported = importScenarioJson(text);
    if (!imported.ok) {
      setDoc(null);
      setPhase("summary");
      setFileError(imported.error);
      return;
    }
    setDoc(imported.document);
    setReport(imported.report);
    setPhase("summary");
  }

  const blocked = scenarioHasBlockingErrors(report);

  if (phase === "pick") {
    return (
      <div className="scenario-screen">
        <header className="scenario-screen-head">
          <div>
            <div className="kicker">CUSTOM SCENARIO</div>
            <h1>Import scenario</h1>
            <p>Load a portable <code>.lorsain.json</code> world package. Terena remains the bundled default.</p>
          </div>
          <button type="button" className="btn secondary" onClick={props.onBack}>
            Back
          </button>
        </header>
        <label className="scenario-dropzone">
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <strong>Choose scenario file</strong>
          <span>Declarative JSON · max 8&nbsp;MB</span>
        </label>
      </div>
    );
  }

  return (
    <div className="scenario-screen">
      <header className="scenario-screen-head">
        <div>
          <div className="kicker">IMPORT SUMMARY</div>
          <h1>{doc?.name ?? "Validation failed"}</h1>
          {doc ? (
            <p>
              {doc.countryName} · starts {doc.startDate} · <code>{doc.scenarioId}</code>
            </p>
          ) : (
            <p>{fileError ?? "Fix validation errors and try again."}</p>
          )}
        </div>
        <button type="button" className="btn secondary" onClick={() => setPhase("pick")}>
          Choose another file
        </button>
      </header>
      <div className="scenario-validation-grid">
        <article className="scenario-panel">
          <h2>Errors ({report.errors.length})</h2>
          <ul className="scenario-issue-list">{report.errors.map((i) => issueRow(i))}</ul>
        </article>
        <article className="scenario-panel">
          <h2>Warnings ({report.warnings.length})</h2>
          <ul className="scenario-issue-list">{report.warnings.map((i) => issueRow(i))}</ul>
        </article>
        <article className="scenario-panel">
          <h2>Suggestions ({report.suggestions.length})</h2>
          <ul className="scenario-issue-list">{report.suggestions.map((i) => issueRow(i))}</ul>
        </article>
      </div>
      <footer className="scenario-actions">
        <button type="button" className="btn secondary" onClick={props.onBack}>
          Cancel
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={!doc}
          onClick={() => doc && props.onEdit(doc)}
        >
          Open in editor
        </button>
        <button
          type="button"
          className="btn"
          disabled={!doc || blocked}
          title={blocked ? "Resolve validation errors before playing" : undefined}
          onClick={() => doc && props.onPlay(doc)}
        >
          Play scenario
        </button>
      </footer>
    </div>
  );
}

type EditorTab = "overview" | "constitution" | "parties" | "validation";

export function ScenarioEditorScreen(props: {
  initial: ScenarioDocument;
  onBack: () => void;
  onPlay: (doc: ScenarioDocument) => void;
}) {
  const [doc, setDoc] = useState<ScenarioDocument>(() => structuredClone(props.initial));
  const [tab, setTab] = useState<EditorTab>("overview");
  const [dirty, setDirty] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);

  const liveReport = useMemo(() => validateScenario(doc), [doc]);
  const blocked = scenarioHasBlockingErrors(liveReport);

  function patch(updater: (prev: ScenarioDocument) => ScenarioDocument) {
    setDoc((prev) => updater(prev));
    setDirty(true);
  }

  function requestBack() {
    if (dirty && !window.confirm("Discard unsaved scenario edits?")) return;
    props.onBack();
  }

  function download() {
    const blob = new Blob([exportScenarioJson(doc)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.scenarioId.toLowerCase()}.lorsain.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDirty(false);
  }

  const parties = doc.contentSections.parties ?? [];

  return (
    <div className="scenario-editor">
      <header className="scenario-editor-head">
        <div>
          <div className="kicker">SCENARIO EDITOR · v{doc.formatVersion}</div>
          <h1>{doc.name}</h1>
          <p>
            {doc.countryName} · {doc.scenarioId}
            {dirty ? " · unsaved changes" : ""}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn secondary" onClick={requestBack}>
            Back
          </button>
          <button type="button" className="btn secondary" onClick={download}>
            Export JSON
          </button>
          <button type="button" className="btn" disabled={blocked} onClick={() => props.onPlay(doc)}>
            Play
          </button>
        </div>
      </header>
      <nav className="scenario-tabs" aria-label="Scenario editor sections">
        {(
          [
            ["overview", "Overview"],
            ["constitution", "Constitution"],
            ["parties", "Parties"],
            ["validation", "Validation"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="scenario-editor-body">
        {tab === "overview" && (
          <section className="scenario-form">
            <label>
              Scenario name
              <input
                value={doc.name}
                onChange={(e) => patch((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label>
              Country name
              <input
                value={doc.countryName}
                onChange={(e) => patch((d) => ({ ...d, countryName: e.target.value }))}
              />
            </label>
            <label>
              Start date
              <input
                value={doc.startDate}
                onChange={(e) => patch((d) => ({ ...d, startDate: e.target.value }))}
              />
            </label>
            <label>
              Description
              <textarea
                value={doc.description ?? ""}
                rows={4}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    description: e.target.value,
                  }))
                }
              />
            </label>
            <label>
              Author
              <input
                value={doc.author ?? ""}
                onChange={(e) => patch((d) => ({ ...d, author: e.target.value }))}
              />
            </label>
          </section>
        )}
        {tab === "constitution" && (
          <section className="scenario-form">
            <label>
              Assembly seats
              <input
                type="number"
                min={1}
                value={doc.contentSections.constitution?.assemblySeats ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      constitution: {
                        ...d.contentSections.constitution,
                        assemblySeats: Number.isFinite(n) ? n : undefined,
                      },
                    },
                  }));
                }}
              />
            </label>
            <label>
              Constitutional Court judges
              <input
                type="number"
                min={0}
                value={doc.contentSections.constitution?.courtJudges ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      constitution: {
                        ...d.contentSections.constitution,
                        courtJudges: Number.isFinite(n) ? n : undefined,
                      },
                    },
                  }));
                }}
              />
            </label>
            <label>
              Ministerial censure threshold (fraction)
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={doc.contentSections.constitution?.ministerialCensureFraction ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      constitution: {
                        ...d.contentSections.constitution,
                        ministerialCensureFraction: Number.isFinite(n) ? n : undefined,
                      },
                    },
                  }));
                }}
              />
            </label>
          </section>
        )}
        {tab === "parties" && (
          <section className="scenario-party-grid">
            {parties.map((party, index) => (
              <article key={party.id} className="scenario-party-card">
                <h3>{party.id}</h3>
                <label>
                  Name
                  <input
                    value={party.name}
                    onChange={(e) =>
                      patch((d) => {
                        const next = [...(d.contentSections.parties ?? [])];
                        next[index] = { ...party, name: e.target.value };
                        return { ...d, contentSections: { ...d.contentSections, parties: next } };
                      })
                    }
                  />
                </label>
                <label>
                  Abbreviation
                  <input
                    value={party.abbreviation}
                    onChange={(e) =>
                      patch((d) => {
                        const next = [...(d.contentSections.parties ?? [])];
                        next[index] = { ...party, abbreviation: e.target.value };
                        return { ...d, contentSections: { ...d.contentSections, parties: next } };
                      })
                    }
                  />
                </label>
                <label>
                  Ideology label
                  <input
                    value={party.ideology}
                    onChange={(e) =>
                      patch((d) => {
                        const next = [...(d.contentSections.parties ?? [])];
                        next[index] = { ...party, ideology: e.target.value };
                        return { ...d, contentSections: { ...d.contentSections, parties: next } };
                      })
                    }
                  />
                </label>
                <label>
                  Leader politician id
                  <input
                    value={party.leaderId}
                    onChange={(e) =>
                      patch((d) => {
                        const next = [...(d.contentSections.parties ?? [])];
                        next[index] = { ...party, leaderId: e.target.value };
                        return { ...d, contentSections: { ...d.contentSections, parties: next } };
                      })
                    }
                  />
                </label>
              </article>
            ))}
          </section>
        )}
        {tab === "validation" && (
          <section className="scenario-validation-grid">
            <article className="scenario-panel">
              <h2>Errors ({liveReport.errors.length})</h2>
              <ul className="scenario-issue-list">
                {liveReport.errors.map((i) =>
                  issueRow(i, (path) => {
                    setFocusPath(path);
                    if (path.includes("parties")) setTab("parties");
                    else if (path.includes("constitution")) setTab("constitution");
                    else setTab("overview");
                  }),
                )}
              </ul>
            </article>
            <article className="scenario-panel">
              <h2>Warnings ({liveReport.warnings.length})</h2>
              <ul className="scenario-issue-list">
                {liveReport.warnings.map((i) => issueRow(i))}
              </ul>
            </article>
            {focusPath ? <p className="scenario-focus-hint">Focused: {focusPath}</p> : null}
          </section>
        )}
      </div>
    </div>
  );
}
