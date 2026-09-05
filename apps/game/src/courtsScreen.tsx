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

function publicCaseStrength(value: number): string {
  if (value >= 0.78) return "compelling";
  if (value >= 0.6) return "substantial";
  if (value >= 0.42) return "contested";
  return "limited";
}

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
  const impeachmentBases = availableImpeachmentBases(world, snap);
  const targetSeat = seat || vacancies[0] || "";
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

  return (
    <div>
      <PageHeader
        kicker="Judiciary"
        title="Constitutional Court"
        subtitle="Nine-seat bench · vacancies, docket, and recent decisions."
      />
      <div className="courts-layout">
        <SectionCard title="Bench">
          <p className="muted">
            Nine judges · 12-year nonrenewable terms · confirmation {confirmationYesNeeded(world)}{" "}
            yes of {world.legislativeConstitution.assemblySeatCount} authorized seats.
          </p>
          <div
            className="bench-chart"
            role="list"
            aria-label="Nine-seat Constitutional Court bench"
          >
            {bench.map((s) => {
              const chief = /chief/i.test(s.title);
              return (
                <button
                  key={s.officeId}
                  type="button"
                  className={`judge-card${chief ? " chief" : ""}${s.holderId === selectedJudge ? " selected" : ""}`}
                  onClick={() => setSelectedJudge(s.holderId)}
                >
                  <div className="kicker">{chief ? "Chief Justice" : s.title}</div>
                  <strong>
                    {s.holderId ? politicianDisplayName(catalog, s.holderId) : "Vacant"}
                  </strong>
                  <div className="muted">Term ends {s.termEndDate ?? "—"}</div>
                </button>
              );
            })}
          </div>
          {selectedJudge ? (
            <div className="bench-inspector">
              <PoliticianProfile
                catalog={catalog}
                world={world}
                state={snap}
                politicianId={selectedJudge}
                office="Constitutional Court justice"
              />
            </div>
          ) : null}
        </SectionCard>
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
            {Object.values(snap.constitutionalRuntime.impeachments)
              .filter((p) => p.status !== "assembly_pending")
              .map((p) => (
                <div key={p.id} className="muted">
                  Impeachment of {politicianDisplayName(catalog, p.targetId)} ·{" "}
                  {p.status.replace(/_/g, " ")}
                </div>
              ))}
            {Object.values(snap.constitutionalRuntime.recalls)
              .filter((p) => p.status !== "referral_pending")
              .map((p) => (
                <div key={p.id} className="muted">
                  Recall of {politicianDisplayName(catalog, p.targetId)} ·{" "}
                  {p.status.replace(/_/g, " ")}
                  {p.nationalVoteDate ? ` · national vote ${p.nationalVoteDate}` : ""}
                </div>
              ))}
          </div>
        ) : null}
        <div className="card">
          <h3>Docket</h3>
          {pendingCases.length === 0 ? <p className="muted">No active cases.</p> : null}
          {pendingCases.map((c) => (
            <div
              key={c.id}
              className={
                props.globalFocus?.kind === "Court case" && props.globalFocus.id === c.id
                  ? "selected-record"
                  : undefined
              }
            >
              <strong>{caseTitle(c)}</strong>
              <div className="muted">
                {c.caseType.replace(/_/g, " ")} · filed {c.filedDate}
                {c.expedited ? " · expedited" : ""}
              </div>
              {judge &&
              c.participatingJudgeIds.includes(playerId) &&
              !snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${c.id}`] ? (
                <div className="row" style={{ marginTop: "0.4rem" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      run({ type: "CAST_JUDICIAL_VOTE", caseId: c.id, choice: "uphold" })
                    }
                  >
                    Uphold
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() =>
                      run({ type: "CAST_JUDICIAL_VOTE", caseId: c.id, choice: "invalidate" })
                    }
                  >
                    Invalidate
                  </button>
                </div>
              ) : judge && snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${c.id}`] ? (
                <div className="muted">Your judicial vote is recorded.</div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Recently decided</h3>
          {decided.length === 0 ? <p className="muted">No decisions yet.</p> : null}
          {decided.map((d) => {
            const c = snap.constitutionalRuntime.courtCases[d.caseId];
            return (
              <div
                key={d.id}
                className={
                  props.globalFocus?.kind === "Court case" && props.globalFocus.id === d.caseId
                    ? "selected-record"
                    : undefined
                }
                style={{ marginBottom: "0.75rem" }}
              >
                <strong>{c ? caseTitle(c) : d.constitutionalQuestion}</strong>
                <div>
                  Decision: {d.disposition} · Vote: {d.uphold}–{d.invalidate}
                  {d.nonparticipation ? ` · ${d.nonparticipation} not participating` : ""}
                </div>
                <div className="muted">Decided: {d.decisionDate}</div>
                <div className="muted">Constitutional question: {d.constitutionalQuestion}</div>
                <div className="court-opinions">
                  <h4>Controlling opinion</h4>
                  {typeof d.metadata.majorityAuthorId === "string" ? (
                    <div className="muted">
                      Opinion by {politicianDisplayName(catalog, d.metadata.majorityAuthorId)}
                    </div>
                  ) : null}
                  <p>
                    <strong>Holding:</strong>{" "}
                    {typeof d.metadata.holding === "string"
                      ? d.metadata.holding
                      : "The Court resolved the constitutional question on the recorded grounds."}
                  </p>
                  <p>
                    <strong>Rationale:</strong>{" "}
                    {typeof d.metadata.majorityRationale === "string"
                      ? d.metadata.majorityRationale
                      : d.constitutionalQuestion}
                  </p>
                  <p className="muted">
                    <strong>Constitutional provision:</strong>{" "}
                    {typeof d.metadata.constitutionalProvision === "string"
                      ? d.metadata.constitutionalProvision
                      : d.constitutionalRule.replace(/_/g, " ")}
                  </p>
                  {typeof d.metadata.dissentingOpinion === "string" ? (
                    <>
                      <h4>Dissent</h4>
                      {typeof d.metadata.dissentAuthorId === "string" ? (
                        <div className="muted">
                          Opinion by {politicianDisplayName(catalog, d.metadata.dissentAuthorId)}
                        </div>
                      ) : null}
                      <p>{d.metadata.dissentingOpinion}</p>
                    </>
                  ) : null}
                </div>
                <DataTable dense headers={["Justice", "Vote"]}>
                  {Object.entries(d.votes)
                    .sort((a, b) =>
                      politicianDisplayName(catalog, a[0]).localeCompare(
                        politicianDisplayName(catalog, b[0]),
                      ),
                    )
                    .map(([justiceId, vote]) => (
                      <tr key={justiceId}>
                        <td>{politicianDisplayName(catalog, justiceId)}</td>
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
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>Precedent</h3>
          {Object.values(snap.constitutionalRuntime.precedents).length === 0 ? (
            <p className="muted">No controlling precedents yet.</p>
          ) : (
            Object.values(snap.constitutionalRuntime.precedents)
              .sort((a, b) => (a.decisionDate < b.decisionDate ? 1 : -1))
              .slice(0, 8)
              .map((p) => (
                <div key={p.decisionId} className="muted">
                  {p.caseType.replace(/_/g, " ")} · {p.disposition} · {p.decisionDate} · {p.uphold}–
                  {p.invalidate}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
