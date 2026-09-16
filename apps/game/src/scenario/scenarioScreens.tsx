import { useState } from "react";
import {
  importScenarioJson,
  validateScenario,
  scenarioHasBlockingErrors,
  type ScenarioDocument,
  type ScenarioValidationIssue,
} from "@lorsain/scenario";
import { ScenarioStudioEntryScreen } from "./studio/ScenarioStudioEntry.js";
import { ScenarioStudioScreen } from "./studio/ScenarioStudioScreen.js";

export { ScenarioStudioScreen as ScenarioEditorScreen };

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
            <div className="kicker">SCENARIO STUDIO</div>
            <h1>Import scenario</h1>
            <p>
              Load a portable <code>.lorsain.json</code> world package. Terena remains the bundled
              default for New Game.
            </p>
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
          Open in Scenario Studio
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

export function ScenarioStudioHubScreen(props: {
  onBack: () => void;
  onImport: () => void;
  onOpenEditor: (doc: ScenarioDocument) => void;
}) {
  return (
    <ScenarioStudioEntryScreen
      onBack={props.onBack}
      onImport={props.onImport}
      onOpenEditor={props.onOpenEditor}
    />
  );
}
