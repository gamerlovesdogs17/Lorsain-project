import { useMemo, useState } from "react";
import {
  CONSTITUTION_CHANGE_SUBJECTS,
  caseTitle,
  constitutionAlternative,
  constitutionSubjectsForArticle,
  constitutionSubjectById,
  currentConstitutionalClauseText,
  diffConstitutionalText,
  type CommandResult,
  type DiffSegment,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { SectionDivider, StatusBadge } from "./ui/kit.js";
import { partyName } from "./format.js";

type PackageChangeDraft = {
  subjectId: string;
  alternativeId: string;
  designatedPartyId?: string | null;
};

const METRIC_EFFECT_LABELS: Record<string, string> = {
  institutionalStability: "Institutional stability",
  politicalCompetition: "Political competition",
  civilLiberty: "Civil liberty",
  executiveCapacity: "Executive capacity",
  provincialAutonomy: "Provincial autonomy",
  judicialIndependence: "Judicial independence",
  governmentLegitimacy: "Government legitimacy",
};

const CONSTITUTION_TOPIC_CHIPS = [
  "Rights",
  "Elections",
  "Executive",
  "Legislature",
  "Judiciary",
  "Parties",
  "Provinces",
  "Finance",
  "Emergency",
  "Foreign Affairs",
  "Amendment Process",
] as const;

type ConstitutionTopic = (typeof CONSTITUTION_TOPIC_CHIPS)[number];

/** Maps each amendment subject id to a browsable institutional topic chip. */
function constitutionSubjectTopic(subjectId: string): ConstitutionTopic {
  const byId: Record<string, ConstitutionTopic> = {
    art1_republic_form: "Rights",
    art3_executive_authority: "Executive",
    art1_executive_authority: "Executive",
    art2_civil_liberties: "Rights",
    art2_citizenship_guard: "Rights",
    art3_presidential_term_limit: "Elections",
    art3_presidential_election_mode: "Elections",
    art4_assembly_term: "Legislature",
    art4_assembly_election_mode: "Elections",
    art5_veto_override: "Legislature",
    art6_cabinet_formation: "Executive",
    art7_party_system: "Parties",
    art2_press_freedom: "Rights",
    art7_press_freedom: "Rights",
    art8_court_term: "Judiciary",
    art8_judicial_review: "Judiciary",
    art9_provincial_competence: "Provinces",
    art9_local_government: "Provinces",
    art10_emergency_powers: "Emergency",
    art10_defense_control: "Emergency",
    art11_treaty_approval: "Foreign Affairs",
    art12_amendment_process: "Amendment Process",
    art12_unamendable_core: "Amendment Process",
  };
  return byId[subjectId] ?? "Rights";
}

type DisplayDiffBlock =
  | { kind: "same"; text: string }
  | { kind: "change"; del: string; add: string }
  | { kind: "del"; text: string }
  | { kind: "add"; text: string };

/** Groups word-level diff segments into phrase-level replace blocks for readable redlines. */
function groupDiffForDisplay(segments: DiffSegment[]): DisplayDiffBlock[] {
  const blocks: DisplayDiffBlock[] = [];
  let index = 0;
  while (index < segments.length) {
    const segment = segments[index]!;
    if (segment.kind === "same") {
      blocks.push({ kind: "same", text: segment.text });
      index += 1;
      continue;
    }
    let del = "";
    let add = "";
    while (index < segments.length && segments[index]!.kind !== "same") {
      const part = segments[index]!;
      if (part.kind === "del") del += part.text;
      else add += part.text;
      index += 1;
    }
    if (del && add) blocks.push({ kind: "change", del, add });
    else if (del) blocks.push({ kind: "del", text: del });
    else if (add) blocks.push({ kind: "add", text: add });
  }
  return blocks;
}

function ConstitutionalDiffView(props: {
  currentText: string;
  proposedText: string;
  inline?: boolean;
  ariaLabel?: string;
}) {
  const segments = diffConstitutionalText(props.currentText, props.proposedText);
  const blocks = groupDiffForDisplay(segments);
  return (
    <span
      className={`constitution-text-diff${props.inline ? " inline" : ""}`}
      aria-label={props.ariaLabel}
    >
      {blocks.map((block, blockIndex) => {
        if (block.kind === "same") {
          return (
            <span key={`same-${blockIndex}`} className="constitution-diff-same">
              {block.text}
            </span>
          );
        }
        if (block.kind === "change") {
          return (
            <span key={`change-${blockIndex}`} className="constitution-diff-replace">
              <span className="constitution-diff-del">{block.del}</span>
              <span className="constitution-diff-add">{block.add}</span>
            </span>
          );
        }
        if (block.kind === "del") {
          return (
            <span key={`del-${blockIndex}`} className="constitution-diff-del">
              {block.text}
            </span>
          );
        }
        return (
          <span key={`add-${blockIndex}`} className="constitution-diff-add">
            {block.text}
          </span>
        );
      })}
    </span>
  );
}

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
  packageChanges: ReadonlyArray<PackageChangeDraft>,
  draft?: PackageChangeDraft | null,
): string | null {
  const matches = [...packageChanges, ...(draft ? [draft] : [])].filter((change) => {
    const subject = constitutionSubjectById(change.subjectId);
    return subject?.targetClauseId === clauseId;
  });
  if (!matches.length) return null;
  const last = matches[matches.length - 1]!;
  return constitutionAlternative(last.subjectId, last.alternativeId)?.proposedClauseText ?? null;
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
  const [amendmentPackage, setAmendmentPackage] = useState<PackageChangeDraft[]>([]);
  const [draftSubjectId, setDraftSubjectId] = useState("");
  const [draftAlternativeId, setDraftAlternativeId] = useState("");
  const [draftDesignatedPartyId, setDraftDesignatedPartyId] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogArticleId, setCatalogArticleId] = useState("");
  const [catalogTopics, setCatalogTopics] = useState<ConstitutionTopic[]>([]);

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
  const articleSubjects = selectedArticle ? constitutionSubjectsForArticle(selectedArticle.id) : [];
  const availableSubjects = clauseSubjects.length ? clauseSubjects : articleSubjects;

  const activeSubject = constitutionSubjectById(draftSubjectId) ?? availableSubjects[0] ?? null;

  const currentText = selectedClause ? clauseText(props.world, props.snap, selectedClause) : "";

  const proposalAlternatives = useMemo(() => {
    if (!activeSubject) return [];
    return activeSubject.alternatives.filter((alt) => alt.proposedClauseText !== currentText);
  }, [activeSubject, currentText]);

  const activeAlternative =
    (draftAlternativeId
      ? constitutionAlternative(activeSubject?.id ?? "", draftAlternativeId)
      : null) ??
    proposalAlternatives[0] ??
    null;

  const draftPreview =
    activeSubject && activeAlternative
      ? {
          subjectId: activeSubject.id,
          alternativeId: activeAlternative.id,
          ...(activeAlternative.orderPatch?.partySystem === "single_legal_party"
            ? { designatedPartyId: draftDesignatedPartyId || null }
            : {}),
        }
      : null;

  const partyOptions = useMemo(() => {
    const ids = new Set<string>([
      ...Object.keys(props.world.partyDefinitions ?? {}),
      ...Object.keys(props.snap.partyStates ?? {}),
      ...Object.keys(props.snap.dynamicParties ?? {}),
    ]);
    return [...ids]
      .filter((id) => id !== props.world.independentAggregatePartyId)
      .sort((a, b) => partyName(props.world, a).localeCompare(partyName(props.world, b)));
  }, [props.world, props.snap.partyStates, props.snap.dynamicParties]);

  const articleNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const article of constitutionDocument?.articles ?? []) {
      map.set(article.id, String(article.number));
    }
    return map;
  }, [constitutionDocument?.articles]);

  const filteredCatalogSubjects = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return CONSTITUTION_CHANGE_SUBJECTS.filter((subject) => {
      if (catalogArticleId && subject.articleId !== catalogArticleId) return false;
      if (catalogTopics.length && !catalogTopics.includes(constitutionSubjectTopic(subject.id))) {
        return false;
      }
      if (!query) return true;
      const articleNumber = articleNumberById.get(subject.articleId);
      const haystack =
        `${subject.subject} ${subject.id} Article ${articleNumber ?? ""} ${constitutionSubjectTopic(subject.id)}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [articleNumberById, catalogArticleId, catalogSearch, catalogTopics]);

  const openSubjectInBuilder = (subjectId: string) => {
    const subject = constitutionSubjectById(subjectId);
    if (!subject) return;
    setSelectedArticleId(subject.articleId);
    setSelectedClauseId(subject.targetClauseId);
    setDraftSubjectId(subject.id);
    const clause = constitutionDocument?.articles
      .flatMap((article) => article.sections)
      .flatMap((section) => section.clauses)
      .find((row) => row.id === subject.targetClauseId);
    const live = clause ? clauseText(props.world, props.snap, clause) : "";
    const firstAlt = subject.alternatives.find((alt) => alt.proposedClauseText !== live);
    setDraftAlternativeId(firstAlt?.id ?? "");
    document.querySelector(".constitution-annotation")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleCatalogTopic = (topic: ConstitutionTopic) => {
    setCatalogTopics((topics) =>
      topics.includes(topic) ? topics.filter((row) => row !== topic) : [...topics, topic],
    );
  };

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
                    const hasPreview = preview != null && preview !== baseline;
                    const isSelected = selectedClause?.id === clause.id;
                    const amendable = subjectsForClause(clause.id).length > 0;
                    return (
                      <button
                        type="button"
                        className={`constitution-clause${isSelected ? " selected" : ""}${
                          hasPreview ? " constitution-clause-previewing" : ""
                        }`}
                        key={clause.id}
                        onClick={() => {
                          setSelectedClauseId(clause.id);
                          const subjects = subjectsForClause(clause.id);
                          const first = subjects[0];
                          setDraftSubjectId(first?.id ?? "");
                          const live = first ? clauseText(props.world, props.snap, clause) : "";
                          const firstAlt = first?.alternatives.find(
                            (alt) => alt.proposedClauseText !== live,
                          );
                          setDraftAlternativeId(firstAlt?.id ?? "");
                        }}
                      >
                        <span className="clause-number">({clause.number})</span>
                        <span className="constitution-clause-body">
                          {hasPreview && preview ? (
                            <ConstitutionalDiffView
                              currentText={baseline}
                              proposedText={preview}
                              inline
                              ariaLabel="Proposed constitutional language"
                            />
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

              {/* Legal cross-links: court cases referencing this clause */}
              {(() => {
                const articleNumber = selectedArticle?.number
                  ? String(selectedArticle.number).toLowerCase()
                  : "";
                const relatedCases = Object.values(
                  props.snap.constitutionalRuntime.courtCases,
                ).filter(
                  (cc) =>
                    (articleNumber &&
                      cc.constitutionalQuestion
                        ?.toLowerCase()
                        .includes(`article ${articleNumber}`)) ||
                    (cc.constitutionalRule &&
                      selectedClause?.id &&
                      cc.constitutionalRule.includes(selectedClause.id)),
                );
                if (relatedCases.length === 0) return null;
                return (
                  <div className="constitution-cross-links">
                    <div className="kicker">Related court cases</div>
                    {relatedCases.slice(0, 4).map((cc) => (
                      <div key={cc.id} className="cross-link-row">
                        <span className="cross-link-icon">⚖</span>
                        <span>
                          {caseTitle(cc)} · {cc.status.replace(/_/g, " ")}
                          {cc.filedDate ? ` · filed ${cc.filedDate}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

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
                      onChange={(event) => {
                        setDraftAlternativeId(event.target.value);
                        const alt = constitutionAlternative(
                          activeSubject?.id ?? "",
                          event.target.value,
                        );
                        if (alt?.orderPatch?.partySystem !== "single_legal_party") {
                          setDraftDesignatedPartyId("");
                        } else if (!draftDesignatedPartyId && partyOptions[0]) {
                          setDraftDesignatedPartyId(partyOptions[0]);
                        }
                      }}
                    >
                      {proposalAlternatives.map((alt) => (
                        <option key={alt.id} value={alt.id}>
                          {alt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {activeAlternative?.orderPatch?.partySystem === "single_legal_party" ? (
                    <label>
                      Designated sole legal party
                      <select
                        value={draftDesignatedPartyId}
                        onChange={(event) => setDraftDesignatedPartyId(event.target.value)}
                      >
                        <option value="">Select a party…</option>
                        {partyOptions.map((partyId) => (
                          <option key={partyId} value={partyId}>
                            {partyName(props.world, partyId)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {activeAlternative ? (
                    <>
                      <div className="kicker">Document preview</div>
                      <ConstitutionalDiffView
                        currentText={currentText}
                        proposedText={activeAlternative.proposedClauseText}
                        ariaLabel="Red-green constitutional diff"
                      />
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
                          amendmentPackage.length >= 8 ||
                          (activeAlternative.orderPatch?.partySystem === "single_legal_party" &&
                            !draftDesignatedPartyId)
                        }
                        onClick={() => {
                          if (!activeSubject || !activeAlternative) return;
                          setAmendmentPackage((rows) => [
                            ...rows,
                            {
                              subjectId: activeSubject.id,
                              alternativeId: activeAlternative.id,
                              ...(activeAlternative.orderPatch?.partySystem === "single_legal_party"
                                ? { designatedPartyId: draftDesignatedPartyId }
                                : {}),
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
                      <div
                        className="constitution-annotation-amendment"
                        key={`${change.subjectId}:${index}`}
                      >
                        <strong>
                          Change {index + 1}. {subject?.subject ?? change.subjectId}
                        </strong>
                        <span>{alt?.label ?? change.alternativeId}</span>
                        {change.designatedPartyId ? (
                          <span className="muted">
                            Designated party: {partyName(props.world, change.designatedPartyId)}
                          </span>
                        ) : null}
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
                  disabled={
                    activeAlternative.orderPatch?.partySystem === "single_legal_party" &&
                    !draftDesignatedPartyId
                  }
                  onClick={() => {
                    const result = props.sim.executeCommand({
                      type: "PROPOSE_CONSTITUTIONAL_PACKAGE",
                      changes: [
                        {
                          subjectId: activeSubject.id,
                          alternativeId: activeAlternative.id,
                          ...(activeAlternative.orderPatch?.partySystem === "single_legal_party"
                            ? { designatedPartyId: draftDesignatedPartyId }
                            : {}),
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

      <SectionDivider
        title="Quick amendments"
        hint={`${CONSTITUTION_CHANGE_SUBJECTS.length} amendable subjects · opens the document builder`}
      />
      <section className="quick-amendments" aria-label="Quick amendment catalog">
        <div className="quick-amendments-toolbar">
          <input
            className="search"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Search subjects, articles, or topics"
          />
          <label className="quick-amendments-article">
            Article
            <select
              value={catalogArticleId}
              onChange={(event) => setCatalogArticleId(event.target.value)}
            >
              <option value="">All articles</option>
              {constitutionDocument.articles.map((article) => (
                <option key={article.id} value={article.id}>
                  Article {article.number} — {article.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="quick-amendments-chips" role="group" aria-label="Topic filters">
          {CONSTITUTION_TOPIC_CHIPS.map((topic) => (
            <button
              type="button"
              key={topic}
              className={catalogTopics.includes(topic) ? "active" : ""}
              onClick={() => toggleCatalogTopic(topic)}
            >
              {topic}
            </button>
          ))}
          {catalogTopics.length ? (
            <button type="button" className="btn ghost" onClick={() => setCatalogTopics([])}>
              Clear topics
            </button>
          ) : null}
        </div>
        <ul className="quick-amendment-list">
          {filteredCatalogSubjects.length === 0 ? (
            <li className="muted">No amendment subject matches these filters.</li>
          ) : (
            filteredCatalogSubjects.map((subject) => {
              const articleNumber = articleNumberById.get(subject.articleId);
              const topic = constitutionSubjectTopic(subject.id);
              const isActive = draftSubjectId === subject.id;
              return (
                <li key={subject.id}>
                  <button
                    type="button"
                    className={`quick-amendment-item${isActive ? " active" : ""}`}
                    onClick={() => openSubjectInBuilder(subject.id)}
                  >
                    <strong>{subject.subject}</strong>
                    <span>
                      Article {articleNumber ?? "?"} · {topic}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </>
  );
}
