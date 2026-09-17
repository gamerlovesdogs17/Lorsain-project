import {
  availableImpeachmentBases,
  confirmationYesNeeded,
  currentPresidentialAuthorityId,
  deriveCourtBench,
  getAgentProfile,
  judicialEligibilityError,
  vacantCourtSeatIds,
  caseTitle,
  currentAssemblyMemberIds,
  currentCourtJudgeIds,
  explicitLegalCareerLabel,
  publicJudicialReputation,
  publicJudicialReputationLabel,
  publicJudicialReputationTone,
  benchPublicJurisprudentialBalance,
  appointingAuthorityLabel,
  justiceTenureSummary,
  notableJurisprudenceBlurb,
  justiceSignificantRulings,
  courtPoliticizationDebate,
  synthesizeCaseFacts,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { useMemo, useState } from "react";
import { politicianDisplayName, type PresentationCatalog } from "./presentation.js";
import { DataTable, EmptyState, PageHeader, SectionCard, StatusBadge } from "./ui/kit.js";
import { PoliticianProfile } from "./ui/politician.js";

function legalCareer(world: KernelWorld, state: SimState, politicianId: string): string {
  const profile = getAgentProfile(world, state, politicianId);
  return explicitLegalCareerLabel(profile) ?? "No qualifying legal career";
}

function appointingLabel(
  world: KernelWorld,
  snap: SimState,
  catalog: PresentationCatalog,
  judgeId: string,
): string {
  const record = world.courtJusticeRecords?.[judgeId];
  if (record?.appointingPresidentId) {
    return `President ${politicianDisplayName(catalog, record.appointingPresidentId)}`;
  }
  if (record?.appointingAdministrationId) return "Pre-Velic administration";
  return appointingAuthorityLabel(world, snap, judgeId);
}

type CourtsView = "overview" | "bench" | "justice" | "case";

export function CourtsPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  globalFocus?: { kind: string; id: string } | null;
}) {
  const { world, snap, sim, catalog } = props;
  const playerId = snap.playerPoliticianId;
  const bench = deriveCourtBench(world, snap);
  const president = currentPresidentialAuthorityId(world, snap) === playerId;
  const mp = currentAssemblyMemberIds(world, snap).includes(playerId);
  const judge = currentCourtJudgeIds(world, snap).includes(playerId);
  const vacancies = vacantCourtSeatIds(world, snap);
  const awaiting = Object.values(snap.constitutionalRuntime.nominations).filter(
    (n) => n.status === "awaiting_nomination" || n.status === "pending_confirmation",
  );
  const [seat, setSeat] = useState(vacancies[0] ?? "");
  const [nominee, setNominee] = useState("");
  const [query, setQuery] = useState("");
  const [basisId, setBasisId] = useState("");
  const [selectedJudge, setSelectedJudge] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    props.globalFocus?.kind === "Court case" ? props.globalFocus.id : null,
  );
  const [view, setView] = useState<CourtsView>(
    props.globalFocus?.kind === "Court case" ? "case" : "overview",
  );
  const impeachmentBases = availableImpeachmentBases(world, snap);
  const targetSeat = seat || vacancies[0] || "";
  const balance = benchPublicJurisprudentialBalance(world, snap);
  const politicization = courtPoliticizationDebate(world, snap);
  const chiefSeat = bench.find((s) => /chief/i.test(s.title) && s.holderId);
  const eligible = useMemo(() => {
    if (!president || vacancies.length === 0 || !targetSeat) return [];
    const q = query.trim().toLowerCase();
    return Object.values(snap.politicians)
      .filter((p) => p.alive && !p.retired)
      .filter((p) => p.id !== playerId)
      .filter((p) => judicialEligibilityError(world, snap, p.id, targetSeat) == null)
      .filter((p) => (q ? politicianDisplayName(catalog, p.id).toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) =>
        politicianDisplayName(catalog, a.id).localeCompare(politicianDisplayName(catalog, b.id)),
      )
      .slice(0, 40);
  }, [catalog, playerId, president, query, snap, targetSeat, vacancies.length, world]);

  function run(command: Parameters<Simulation["executeCommand"]>[0]) {
    props.report(sim.executeCommand(command));
    props.onDone();
  }

  function openJustice(id: string | null) {
    setSelectedJudge(id);
    if (id) setView("justice");
  }

  function openCase(id: string) {
    setSelectedCaseId(id);
    setView("case");
  }

  const pendingCases = Object.values(snap.constitutionalRuntime.courtCases)
    .filter((c) => c.status === "pending")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const decided = Object.values(snap.constitutionalRuntime.courtDecisions)
    .sort((a, b) => (a.decisionDate < b.decisionDate ? 1 : -1))
    .slice(0, 8);
  const pendingImpeach = Object.values(snap.constitutionalRuntime.impeachments).filter(
    (p) => p.status === "assembly_pending",
  );
  const pendingRecall = Object.values(snap.constitutionalRuntime.recalls).filter(
    (p) => p.status === "referral_pending",
  );

  const selectedCase =
    selectedCaseId != null ? (snap.constitutionalRuntime.courtCases[selectedCaseId] ?? null) : null;
  const selectedDecision =
    selectedCase?.decisionId != null
      ? (snap.constitutionalRuntime.courtDecisions[selectedCase.decisionId] ?? null)
      : selectedCaseId
        ? (Object.values(snap.constitutionalRuntime.courtDecisions).find(
            (d) => d.caseId === selectedCaseId,
          ) ?? null)
        : null;
  const caseFacts = selectedCaseId ? synthesizeCaseFacts(snap, selectedCaseId) : null;
  const justiceRulings = selectedJudge ? justiceSignificantRulings(snap, selectedJudge) : [];
  const tenure = selectedJudge ? justiceTenureSummary(world, snap, selectedJudge) : null;

  return (
    <div data-tutorial="courts-workspace">
      <PageHeader
        kicker="Judiciary"
        title="Constitutional Court"
        subtitle="Nine-seat nonpartisan bench · public reputations · docket and rulings."
      />
      <div className="courts-view-tabs" role="tablist" aria-label="Courts views">
        {(
          [
            ["overview", "Court Overview"],
            ["bench", "Bench"],
            ["justice", "Justice"],
            ["case", "Case"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={`btn secondary${view === id ? " selected" : ""}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="courts-layout">
        {view === "overview" ? (
          <>
            <SectionCard title="Court Overview">
              <p className="muted">
                Terena&apos;s Constitutional Court is a nine-justice institution with 12-year
                nonrenewable terms. Sitting justices hold no Party membership. Confirmation needs{" "}
                {confirmationYesNeeded(world)} yes of{" "}
                {world.legislativeConstitution.assemblySeatCount} authorized Assembly seats.
              </p>
              <div className="court-overview-grid">
                <div>
                  <div className="kicker">Chief Justice</div>
                  <strong>
                    {chiefSeat?.holderId
                      ? politicianDisplayName(catalog, chiefSeat.holderId)
                      : "No sitting Chief"}
                  </strong>
                </div>
                <div>
                  <div className="kicker">Bench</div>
                  <strong>
                    {balance.judgeIds.length} sitting · {vacancies.length} vacant
                  </strong>
                </div>
                <div>
                  <div className="kicker">Public jurisprudential balance</div>
                  <strong>{balance.qualitativeSummary}</strong>
                  <div className="muted">
                    {balance.institutionalOrUnclassified} institutional / difficult to place ·{" "}
                    {balance.centreLeftLeaning} centre-left / progressive ·{" "}
                    {balance.conservativeLeaning} conservative / executive-deference
                  </div>
                </div>
              </div>
              {politicization.visible ? (
                <div className="court-politicization">
                  <div className="kicker">{politicization.issueName}</div>
                  <p>{politicization.summary}</p>
                </div>
              ) : (
                <p className="muted">{politicization.summary}</p>
              )}
            </SectionCard>

            <SectionCard title="Pending cases">
              {pendingCases.length === 0 ? <EmptyState>No active cases.</EmptyState> : null}
              {pendingCases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="court-list-item"
                  onClick={() => openCase(c.id)}
                >
                  <strong>{caseTitle(c)}</strong>
                  <div className="muted">
                    {c.caseType.replace(/_/g, " ")} · filed {c.filedDate}
                    {c.expedited ? " · expedited" : ""}
                  </div>
                </button>
              ))}
            </SectionCard>

            <SectionCard title="Recent rulings">
              {decided.length === 0 ? <EmptyState>No decisions yet.</EmptyState> : null}
              {decided.map((d) => {
                const c = snap.constitutionalRuntime.courtCases[d.caseId];
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="court-list-item"
                    onClick={() => openCase(d.caseId)}
                  >
                    <strong>{c ? caseTitle(c) : d.constitutionalQuestion}</strong>
                    <div className="muted">
                      {d.disposition} · {d.uphold}–{d.invalidate} · {d.decisionDate}
                    </div>
                  </button>
                );
              })}
            </SectionCard>

            {vacancies.length > 0 ? (
              <SectionCard title="Vacancies">
                <ul className="muted">
                  {vacancies.map((id) => (
                    <li key={id}>{world.offices[id]?.title ?? id}</li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </>
        ) : null}

        {view === "bench" || view === "justice" ? (
          <SectionCard title="Bench">
            <p className="muted">
              Nine judges · public reputation is imperfect commentary, not hidden ideology.
            </p>
            <div
              className="bench-chart bench-grid"
              role="list"
              aria-label="Nine-seat Constitutional Court bench"
            >
              {bench.map((s) => {
                const chief = /chief/i.test(s.title);
                const rep = s.holderId ? publicJudicialReputation(world, snap, s.holderId) : null;
                const tone = rep ? publicJudicialReputationTone(rep) : "institutionalist";
                const tenureRow = s.holderId ? justiceTenureSummary(world, snap, s.holderId) : null;
                return (
                  <button
                    key={s.officeId}
                    type="button"
                    className={`judge-card tone-${tone}${chief ? " chief" : ""}${
                      s.holderId === selectedJudge ? " selected" : ""
                    }`}
                    onClick={() => openJustice(s.holderId)}
                  >
                    <div className="kicker">{chief ? "Chief Justice" : s.title}</div>
                    <strong>
                      {s.holderId ? politicianDisplayName(catalog, s.holderId) : "Vacant"}
                    </strong>
                    {s.holderId && rep ? (
                      <div className="muted">
                        {publicJudicialReputationLabel(world, snap, s.holderId)}
                      </div>
                    ) : null}
                    <div className="muted">
                      {tenureRow?.appointed ? `Since ${tenureRow.appointed.slice(0, 4)}` : "Term —"}
                      {tenureRow?.termEnds ? ` · ends ${tenureRow.termEnds}` : ""}
                    </div>
                    {s.holderId ? (
                      <div className="muted">
                        {appointingLabel(world, snap, catalog, s.holderId)}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </SectionCard>
        ) : null}

        {view === "justice" && selectedJudge ? (
          <SectionCard title="Justice profile">
            <PoliticianProfile
              catalog={catalog}
              world={world}
              state={snap}
              politicianId={selectedJudge}
              office="Constitutional Court justice"
            />
            <div className="justice-profile-block">
              <p>
                <strong>Public reputation:</strong>{" "}
                {publicJudicialReputationLabel(world, snap, selectedJudge)}
              </p>
              <p className="muted">
                Formal status: nonpartisan while serving (no Party membership).
              </p>
              <p>
                <strong>Appointment:</strong>{" "}
                {appointingLabel(world, snap, catalog, selectedJudge)}
                {tenure?.appointed ? ` · appointed ${tenure.appointed}` : ""}
                {tenure?.termEnds ? ` · term ends ${tenure.termEnds}` : ""}
                {tenure?.yearsOnBench != null
                  ? ` · ~${tenure.yearsOnBench} years on the bench`
                  : ""}
              </p>
              <p>
                <strong>Background / jurisprudence:</strong>{" "}
                {notableJurisprudenceBlurb(world, snap, selectedJudge)}
              </p>
              <h4>Significant rulings</h4>
              {justiceRulings.length === 0 ? (
                <p className="muted">No recorded Constitutional Court rulings yet.</p>
              ) : (
                <DataTable dense headers={["Date", "Side", "Question"]}>
                  {justiceRulings.map((r) => (
                    <tr key={r.decisionId}>
                      <td>{r.date}</td>
                      <td>
                        {r.side === "majority"
                          ? "Majority"
                          : r.side === "dissent"
                            ? "Dissent"
                            : "Not participating"}{" "}
                        ({r.disposition})
                      </td>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => openCase(r.caseId)}
                        >
                          {r.question}
                        </button>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </div>
          </SectionCard>
        ) : view === "justice" ? (
          <SectionCard title="Justice profile">
            <EmptyState>Select a justice from the bench.</EmptyState>
          </SectionCard>
        ) : null}

        {view === "case" ? (
          <SectionCard title="Case detail">
            {!selectedCase || !caseFacts ? (
              <EmptyState>Select a pending or decided case from Overview.</EmptyState>
            ) : (
              <>
                <h3>{caseTitle(selectedCase)}</h3>
                <p>
                  <strong>Parties:</strong> {caseFacts.parties}
                </p>
                <p>
                  <strong>Legal question:</strong> {caseFacts.legalQuestion}
                </p>
                <p>
                  <strong>Facts:</strong> {caseFacts.facts}
                </p>
                <p>
                  <strong>Challenged law / act:</strong> {caseFacts.challengedLaw ?? "—"}
                </p>
                <p>
                  <strong>Constitutional rule:</strong> {caseFacts.constitutionalRule}
                </p>
                <p>
                  <strong>Precedent:</strong>{" "}
                  {caseFacts.precedent ?? "No similar controlling prior"}
                </p>
                <p>
                  <strong>Stage:</strong> {caseFacts.stage}
                  {selectedCase.expedited ? " · expedited" : ""}
                </p>
                {selectedDecision ? (
                  <>
                    <p>
                      <strong>Decision:</strong> {selectedDecision.disposition} ·{" "}
                      {selectedDecision.uphold}–{selectedDecision.invalidate}
                      {selectedDecision.nonparticipation
                        ? ` · ${selectedDecision.nonparticipation} not participating`
                        : ""}{" "}
                      · {selectedDecision.decisionDate}
                    </p>
                    <div className="court-opinions">
                      <h4>Majority</h4>
                      {typeof selectedDecision.metadata.majorityAuthorId === "string" ? (
                        <div className="muted">
                          Opinion by{" "}
                          {politicianDisplayName(
                            catalog,
                            selectedDecision.metadata.majorityAuthorId,
                          )}
                        </div>
                      ) : null}
                      <p>
                        {typeof selectedDecision.metadata.majorityRationale === "string"
                          ? selectedDecision.metadata.majorityRationale
                          : selectedDecision.constitutionalQuestion}
                      </p>
                      {typeof selectedDecision.metadata.dissentingOpinion === "string" ? (
                        <>
                          <h4>Dissent</h4>
                          {typeof selectedDecision.metadata.dissentAuthorId === "string" ? (
                            <div className="muted">
                              Opinion by{" "}
                              {politicianDisplayName(
                                catalog,
                                selectedDecision.metadata.dissentAuthorId,
                              )}
                            </div>
                          ) : null}
                          <p>{selectedDecision.metadata.dissentingOpinion}</p>
                        </>
                      ) : null}
                    </div>
                    <DataTable dense headers={["Justice", "Vote"]}>
                      {Object.entries(selectedDecision.votes)
                        .sort((a, b) =>
                          politicianDisplayName(catalog, a[0]).localeCompare(
                            politicianDisplayName(catalog, b[0]),
                          ),
                        )
                        .map(([justiceId, vote]) => (
                          <tr key={justiceId}>
                            <td>
                              <button
                                type="button"
                                className="linkish"
                                onClick={() => openJustice(justiceId)}
                              >
                                {politicianDisplayName(catalog, justiceId)}
                              </button>
                            </td>
                            <td>
                              {vote === "uphold"
                                ? "Uphold"
                                : vote === "invalidate"
                                  ? "Invalidate"
                                  : "Not participating"}
                            </td>
                          </tr>
                        ))}
                    </DataTable>
                  </>
                ) : judge &&
                  selectedCase.participatingJudgeIds.includes(playerId) &&
                  !snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${selectedCase.id}`] ? (
                  <div className="row" style={{ marginTop: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        run({
                          type: "CAST_JUDICIAL_VOTE",
                          caseId: selectedCase.id,
                          choice: "uphold",
                        })
                      }
                    >
                      Uphold
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() =>
                        run({
                          type: "CAST_JUDICIAL_VOTE",
                          caseId: selectedCase.id,
                          choice: "invalidate",
                        })
                      }
                    >
                      Invalidate
                    </button>
                  </div>
                ) : judge &&
                  snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${selectedCase.id}`] ? (
                  <div className="muted">Your judicial vote is recorded.</div>
                ) : null}
              </>
            )}
          </SectionCard>
        ) : null}

        {president && vacancies.length > 0 ? (
          <div className="card">
            <h3>Nominate a judge</h3>
            <select value={seat} onChange={(e) => setSeat(e.target.value)}>
              {vacancies.map((id) => (
                <option key={id} value={id}>
                  {world.offices[id]?.title ?? "Constitutional Court seat"}
                </option>
              ))}
            </select>
            <input
              placeholder="Search eligible politicians"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              className="appointment-browser"
              role="listbox"
              aria-label="Eligible judicial candidates"
            >
              {eligible.length === 0 ? (
                <EmptyState>No eligible candidate matches this search.</EmptyState>
              ) : null}
              {eligible.map((p) => {
                const profile = getAgentProfile(world, snap, p.id);
                const age = profile?.birthDate
                  ? Number(snap.currentDate.slice(0, 4)) - Number(profile.birthDate.slice(0, 4))
                  : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`appointment-candidate${nominee === p.id ? " selected" : ""}`}
                    onClick={() => setNominee(p.id)}
                  >
                    <span className="appointment-monogram" aria-hidden="true">
                      {politicianDisplayName(catalog, p.id)
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span>
                      <strong>{politicianDisplayName(catalog, p.id)}</strong>
                      <small>
                        {legalCareer(world, snap, p.id)}
                        {age != null ? ` · age ${age}` : ""}
                      </small>
                    </span>
                    {nominee === p.id ? <StatusBadge tone="ok">Selected</StatusBadge> : null}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="btn"
              disabled={!seat || !nominee}
              onClick={() =>
                run({
                  type: "NOMINATE_CONSTITUTIONAL_JUDGE",
                  seatOfficeId: seat,
                  nomineeId: nominee,
                })
              }
            >
              Nominate
            </button>
          </div>
        ) : null}

        {awaiting.length > 0 ? (
          <div className="card">
            <h3>Nominations</h3>
            {awaiting.map((n) => (
              <div key={n.id}>
                {world.offices[n.seatOfficeId]?.title ?? n.seatOfficeId} ·{" "}
                {n.status.replace(/_/g, " ")}
                {n.nomineeId ? ` · ${politicianDisplayName(catalog, n.nomineeId)}` : ""}
                {n.status === "pending_confirmation"
                  ? ` · needs ${confirmationYesNeeded(world)} yes`
                  : ""}
                {mp &&
                n.status === "pending_confirmation" &&
                !snap.constitutionalRuntime.pendingPlayerVotes[`confirmation:${n.id}`] ? (
                  <div className="row" style={{ marginTop: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        run({ type: "CAST_CONFIRMATION_VOTE", nominationId: n.id, choice: "yes" })
                      }
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({ type: "CAST_CONFIRMATION_VOTE", nominationId: n.id, choice: "no" })
                      }
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({
                          type: "CAST_CONFIRMATION_VOTE",
                          nominationId: n.id,
                          choice: "abstain",
                        })
                      }
                    >
                      Abstain
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {mp ? (
          <div className="card">
            <h3>Assembly constitutional actions</h3>
            {impeachmentBases.length === 0 ? (
              <p className="muted">No qualifying constitutional basis is currently available.</p>
            ) : (
              <>
                <select
                  value={basisId || impeachmentBases[0]!.id}
                  onChange={(e) => setBasisId(e.target.value)}
                >
                  {impeachmentBases.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grounds.replace(/_/g, " ")} · {publicCaseStrength(g.evidenceStrength)}{" "}
                      evidence ·{publicCaseStrength(g.severity)} constitutional gravity
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    run({
                      type: "INTRODUCE_IMPEACHMENT",
                      basisId: basisId || impeachmentBases[0]!.id,
                    })
                  }
                >
                  Introduce impeachment
                </button>
              </>
            )}
            <button
              type="button"
              className="btn secondary"
              onClick={() => run({ type: "INTRODUCE_RECALL_REFERRAL" })}
            >
              Refer national recall
            </button>
            {pendingImpeach.map((p) => (
              <div key={p.id}>
                Impeachment of {politicianDisplayName(catalog, p.targetId)} ·{" "}
                {p.status.replace(/_/g, " ")} · {p.grounds.replace(/_/g, " ")}
                {!snap.constitutionalRuntime.pendingPlayerVotes[`impeachment:${p.id}`] ? (
                  <div className="row" style={{ marginTop: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        run({ type: "CAST_IMPEACHMENT_VOTE", proceedingId: p.id, choice: "yes" })
                      }
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({ type: "CAST_IMPEACHMENT_VOTE", proceedingId: p.id, choice: "no" })
                      }
                    >
                      No
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({
                          type: "CAST_IMPEACHMENT_VOTE",
                          proceedingId: p.id,
                          choice: "abstain",
                        })
                      }
                    >
                      Abstain
                    </button>
                  </div>
                ) : (
                  <div className="muted">Your vote is recorded.</div>
                )}
              </div>
            ))}
            {pendingRecall.map((p) => (
              <div key={p.id}>
                Recall of {politicianDisplayName(catalog, p.targetId)} ·{" "}
                {p.status.replace(/_/g, " ")}
                {!snap.constitutionalRuntime.pendingPlayerVotes[`recall:${p.id}`] ? (
                  <div className="row" style={{ marginTop: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        run({
                          type: "CAST_RECALL_REFERRAL_VOTE",
                          proceedingId: p.id,
                          choice: "yes",
                        })
                      }
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({ type: "CAST_RECALL_REFERRAL_VOTE", proceedingId: p.id, choice: "no" })
                      }
                    >
                      No
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({
                          type: "CAST_RECALL_REFERRAL_VOTE",
                          proceedingId: p.id,
                          choice: "abstain",
                        })
                      }
                    >
                      Abstain
                    </button>
                  </div>
                ) : (
                  <div className="muted">Your vote is recorded.</div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
