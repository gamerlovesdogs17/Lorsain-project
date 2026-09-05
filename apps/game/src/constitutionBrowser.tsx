import { useMemo, useState } from "react";
import {
  CONSTITUTION_CHANGE_SUBJECTS,
  constitutionAlternative,
  constitutionSubjectsForArticle,
  constitutionSubjectById,
  currentConstitutionalClauseText,
  diffConstitutionalText,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { SectionDivider, StatusBadge } from "./ui/kit.js";

const METRIC_EFFECT_LABELS: Record<string, string> = {
  institutionalStability: "Institutional stability",
  politicalCompetition: "Political competition",
  civilLiberty: "Civil liberty",
  executiveCapacity: "Executive capacity",
  provincialAutonomy: "Provincial autonomy",
  judicialIndependence: "Judicial independence",
  governmentLegitimacy: "Government legitimacy",
};

type ConstitutionClause = NonNullable<
  KernelWorld["constitutionalDocument"]
>["articles"][number]["sections"][number]["clauses"][number];

function clauseText(world: KernelWorld, snap: SimState, clause: ConstitutionClause): string {
  return currentConstitutionalClauseText(world, snap, clause.id) ?? clause.text;
}

function subjectsForClause(clauseId: string) {
  return CONSTITUTION_CHANGE_SUBJECTS.filter((subject) => subject.targetClauseId === clauseId);
}

function formatMetricEffect(key: string, value: number): string {
  const label = METRIC_EFFECT_LABELS[key] ?? key;
  const signed = value > 0 ? `+${value}` : `${value}`;
  return `${label} ${signed}`;
}

function previewTextForClause(
  world: KernelWorld,
  snap: SimState,
  clauseId: string,
  packageChanges: ReadonlyArray<{ subjectId: string; alternativeId: string }>,
  draft?: { subjectId: string; alternativeId: string } | null,
): string | null {
  const matches = [
    ...packageChanges,
    ...(draft ? [draft] : []),
  ].filter((change) => {
    const subject = constitutionSubjectById(change.subjectId);
    return subject?.targetClauseId === clauseId;
  });
  if (!matches.length) return null;
  const last = matches[matches.length - 1]!;
  return (
    constitutionAlternative(last.subjectId, last.alternativeId)?.proposedClauseText ?? null
  );
}

export function ConstitutionBrowser(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  mp: boolean;
  report: (r: CommandResult) => boolean;
}) {
  const constitutionDocument = props.world.constitutionalDocument;
  const [selectedArticleId, setSelectedArticleId] = useState(
    constitutionDocument?.articles[0]?.id ?? "",
  );
  const [selectedClauseId, setSelectedClauseId] = useState(
    constitutionDocument?.articles[0]?.sections[0]?.clauses[0]?.id ?? "",
  );
  const [amendmentPackage, setAmendmentPackage] = useState<
    Array<{ subjectId: string; alternativeId: string }>
  >([]);
  const [draftSubjectId, setDraftSubjectId] = useState("");
  const [draftAlternativeId, setDraftAlternativeId] = useState("");

  const selectedArticle =
    constitutionDocument?.articles.find((article) => article.id === selectedArticleId) ??
    constitutionDocument?.articles[0] ??
    null;
  const selectedClause =
    selectedArticle?.sections
      .flatMap((section) => section.clauses)
      .find((clause) => clause.id === selectedClauseId) ??
    selectedArticle?.sections[0]?.clauses[0] ??
    null;

  const clauseSubjects = selectedClause ? subjectsForClause(selectedClause.id) : [];
  const articleSubjects = selectedArticle
    ? constitutionSubjectsForArticle(selectedArticle.id)
    : [];
  const availableSubjects = clauseSubjects.length ? clauseSubjects : articleSubjects;

  const activeSubject =
    constitutionSubjectById(draftSubjectId) ?? availableSubjects[0] ?? null;

  const currentText = selectedClause
    ? clauseText(props.world, props.snap, selectedClause)
    : "";

  const proposalAlternatives = useMemo(() => {
    if (!activeSubject) return [];
    return activeSubject.alternatives.filter(
      (alt) => alt.proposedClauseText !== currentText,
    );
  }, [activeSubject, currentText]);

  const activeAlternative =
    (draftAlternativeId
      ? constitutionAlternative(activeSubject?.id ?? "", draftAlternativeId)
      : null) ??
    proposalAlternatives[0] ??
    null;

  const draftPreview =
    activeSubject && activeAlternative
      ? { subjectId: activeSubject.id, alternativeId: activeAlternative.id }
      : null;

  if (!constitutionDocument) {
    return <p className="muted">The structured constitutional document is unavailable.</p>;
  }

  return (
    <>
      <SectionDivider
        title="Constitution of the Republic of Terena"
        hint={`${constitutionDocument.articles.length} Articles · document-first amendment`}
        actions={
          amendmentPackage.length ? (
            <StatusBadge>{amendmentPackage.length} change(s) staged</StatusBadge>
          ) : undefined
        }
      />
      <div className="constitution-browser">
        <aside className="constitution-toc" aria-label="Constitution table of contents">
          <div className="constitution-seal">
            TERENA
            <br />
            <small>1971</small>
          </div>
          <strong>Contents</strong>
          {constitutionDocument.articles.map((article) => (
            <button
              type="button"
              className={selectedArticle?.id === article.id ? "active" : ""}
              key={article.id}
              onClick={() => {
                setSelectedArticleId(article.id);
                setSelectedClauseId(article.sections[0]?.clauses[0]?.id ?? "");
                setDraftSubjectId("");
                setDraftAlternativeId("");
              }}
            >
              <span>Article {article.number}</span>
              {article.title}
            </button>
          ))}
        </aside>
        <article className="constitution-document">
          <header>
            <div className="kicker">Supreme law · effective 1 July 1971</div>
            <h2>{constitutionDocument.title}</h2>
            {selectedArticle?.id === constitutionDocument.articles[0]?.id ? (
              <p className="constitution-preamble">
                <strong>Preamble</strong>
                {constitutionDocument.preamble}
              </p>
            ) : null}
          </header>
          {selectedArticle ? (
            <>
              <div className="constitution-article-heading">
                <span>ARTICLE {selectedArticle.number}</span>
                <h3>{selectedArticle.title}</h3>
              </div>
              {selectedArticle.sections.map((section) => (
                <section className="constitution-section" key={section.id}>
                  <h4>
                    Section {section.number}. {section.title}
                  </h4>
                  {section.clauses.map((clause) => {
                    const baseline = clauseText(props.world, props.snap, clause);
                    const preview = previewTextForClause(
                      props.world,
                      props.snap,
                      clause.id,
                      amendmentPackage,
                      selectedClause?.id === clause.id ? draftPreview : null,
                    );
                    const segments =
                      preview && preview !== baseline
                        ? diffConstitutionalText(baseline, preview)
                        : null;
                    const isSelected = selectedClause?.id === clause.id;
                    const amendable = subjectsForClause(clause.id).length > 0;
                    return (
                      <button
                        type="button"
                        className={`constitution-clause${isSelected ? " selected" : ""}${
                          segments ? " constitution-clause-previewing" : ""
                        }`}
                        key={clause.id}
                        onClick={() => {
                          setSelectedClauseId(clause.id);
                          const subjects = subjectsForClause(clause.id);
                          const first = subjects[0];
                          setDraftSubjectId(first?.id ?? "");
                          const live = first
                            ? clauseText(props.world, props.snap, clause)
                            : "";
                          const firstAlt = first?.alternatives.find(
                            (alt) => alt.proposedClauseText !== live,
                          );
                          setDraftAlternativeId(firstAlt?.id ?? "");
                        }}
                      >
                        <span className="clause-number">({clause.number})</span>
                        <span className="constitution-clause-body">
                          {segments ? (
                            <span
                              className="constitution-text-diff inline"
                              aria-label="Proposed constitutional language"
                            >
                              {segments.map((segment, index) => (
                                <span
                                  key={`${segment.kind}-${index}`}
                                  className={`constitution-diff-${segment.kind}`}
                                >
                                  {segment.text}
                                </span>
                              ))}
                            </span>
                          ) : (
                            baseline
                          )}
                        </span>
                        <small>
                          {amendable ? "Amendable subject" : "Document clause"}
                          {clause.runtime_rule_id ? " · Modeled rule" : ""}
                        </small>
                      </button>
                    );
                  })}
                </section>
              ))}
            </>
          ) : null}
        </article>
        <aside className="constitution-annotation" aria-label="Amendment builder">
          {selectedClause ? (
            <>
              <div className="kicker">Propose amendment</div>
              <h3>
                Article {selectedArticle?.number}
                {selectedClause ? ` · (§${selectedClause.number})` : ""}
              </h3>
              <div className="constitutional-scope">
                <span>CURRENT CONSTITUTION</span>
                <strong>
                  {selectedClause.amendment_difficulty === "ordinary"
                    ? "Ordinary"
                    : selectedClause.amendment_difficulty === "substantial"
                      ? "Substantial"
                      : "Foundational"}{" "}
                  resistance
                </strong>
              </div>
              <p className="constitution-current-baseline">{currentText}</p>

              {availableSubjects.length === 0 ? (
                <p className="muted">
                  No structured amendment subject is registered for this clause yet. Choose another
                  clause in this Article.
                </p>
              ) : (
                <div className="constitution-amendment-inspector">
                  <label>
                    Subject being changed
                    <select
                      value={activeSubject?.id ?? ""}
                      onChange={(event) => {
                        const subject = constitutionSubjectById(event.target.value);
                        setDraftSubjectId(event.target.value);
                        const live = selectedClause
                          ? clauseText(props.world, props.snap, selectedClause)
                          : "";
                        const firstAlt = subject?.alternatives.find(
                          (alt) => alt.proposedClauseText !== live,
                        );
                        setDraftAlternativeId(firstAlt?.id ?? "");
                      }}
                    >
                      {availableSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.subject}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Proposed alternative
                    <select
                      value={activeAlternative?.id ?? ""}
                      onChange={(event) => setDraftAlternativeId(event.target.value)}
                    >
                      {proposalAlternatives.map((alt) => (
                        <option key={alt.id} value={alt.id}>
                          {alt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {activeAlternative ? (
                    <>
                      <div className="kicker">Document preview</div>
                      <div
                        className="constitution-text-diff"
                        aria-label="Red-green constitutional diff"
                      >
                        {diffConstitutionalText(
                          currentText,
                          activeAlternative.proposedClauseText,
                        ).map((segment, index) => (
                          <span
                            key={`${segment.kind}-${index}`}
                            className={`constitution-diff-${segment.kind}`}
                          >
                            {segment.text}
                          </span>
                        ))}
                      </div>
                      <div className="kicker">Mechanical consequences</div>
                      <ul className="constitution-mechanical-list">
                        {activeAlternative.mechanicalEffects.map((effect) => (
                          <li key={effect}>{effect}</li>
                        ))}
                      </ul>
                      <div className="kicker">Political / world effects</div>
                      <div className="policy-choice-effects">
                        {Object.entries(activeAlternative.metricEffects).map(([key, value]) =>
                          typeof value === "number" ? (
                            <span key={key} className="fx fx-flat">
                              {formatMetricEffect(key, value)}
                            </span>
                          ) : null,
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={
                          !activeSubject ||
                          !activeAlternative ||
                          amendmentPackage.some((row) => row.subjectId === activeSubject.id) ||
                          amendmentPackage.length >= 8
                        }
                        onClick={() => {
                          if (!activeSubject || !activeAlternative) return;
                          setAmendmentPackage((rows) => [
                            ...rows,
                            {
                              subjectId: activeSubject.id,
                              alternativeId: activeAlternative.id,
                            },
                          ]);
                        }}
                      >
                        Add constitutional change to package
                      </button>
                    </>
                  ) : (
                    <p className="muted">
                      Every listed alternative matches the current constitutional text for this
                      subject.
                    </p>
                  )}
                </div>
              )}

              {amendmentPackage.length ? (
                <div className="constitution-package-list">
                  <div className="kicker">Amendment package</div>
                  {amendmentPackage.map((change, index) => {
                    const subject = constitutionSubjectById(change.subjectId);
                    const alt = constitutionAlternative(change.subjectId, change.alternativeId);
                    return (
                      <div className="constitution-annotation-amendment" key={`${change.subjectId}:${index}`}>
                        <strong>
                          Change {index + 1}. {subject?.subject ?? change.subjectId}
                        </strong>
                        <span>{alt?.label ?? change.alternativeId}</span>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() =>
                            setAmendmentPackage((rows) =>
                              rows.filter((_, rowIndex) => rowIndex !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  {props.mp ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const result = props.sim.executeCommand({
                          type: "PROPOSE_CONSTITUTIONAL_PACKAGE",
                          changes: amendmentPackage,
                        });
                        if (props.report(result)) setAmendmentPackage([]);
                      }}
                    >
                      Introduce amendment package
                    </button>
                  ) : (
                    <p className="muted">
                      Only a sitting National Assembly member may introduce an amendment.
                    </p>
                  )}
                </div>
              ) : activeSubject && activeAlternative && props.mp ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const result = props.sim.executeCommand({
                      type: "PROPOSE_CONSTITUTIONAL_PACKAGE",
                      changes: [
                        {
                          subjectId: activeSubject.id,
                          alternativeId: activeAlternative.id,
                        },
                      ],
                    });
                    props.report(result);
                  }}
                >
                  Introduce amendment
                </button>
              ) : null}

              <div className="kicker">History on this clause</div>
              {Object.values(props.snap.provincialRuntime.constitutionalAmendments)
                .filter(
                  (amendment) =>
                    amendment.documentClauseId === selectedClause.id ||
                    amendment.packageChanges?.some(
                      (change) => change.clauseId === selectedClause.id,
                    ),
                )
                .sort(
                  (a, b) =>
                    (a.enactedDate ?? a.proposedDate).localeCompare(
                      b.enactedDate ?? b.proposedDate,
                    ) || a.id.localeCompare(b.id),
                )
                .map((amendment) => (
                  <div className="constitution-annotation-amendment" key={amendment.id}>
                    <strong>{amendment.title}</strong>
                    <span>
                      {amendment.status.replace(/_/g, " ")} ·{" "}
                      {amendment.enactedDate ?? amendment.proposedDate}
                      {amendment.packageChanges?.length
                        ? ` · ${amendment.packageChanges.length} changes`
                        : ""}
                    </span>
                  </div>
                ))}
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
