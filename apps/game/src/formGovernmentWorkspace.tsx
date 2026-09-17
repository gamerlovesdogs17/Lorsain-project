import { useMemo, useState } from "react";
import {
  PARTY_PLATFORM_ISSUES,
  activeGovernmentFormation,
  assemblySeatMath,
  isHungAssembly,
  listPotentialPartners,
  playerCanSteerFormation,
  type CommandResult,
  type KernelWorld,
  type PartyPlatformIssue,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { partyDisplayName, type PresentationCatalog } from "./presentation.js";
import { BriefStrip, EmptyState, SectionCard, SectionDivider, StatusBadge } from "./ui/kit.js";

const ISSUE_LABELS: Record<string, string> = {
  economy: "Economy",
  taxes: "Taxes",
  labor: "Labor",
  housing: "Housing",
  social_policy: "Social policy",
  environment: "Environment",
  institutional_reform: "Institutional reform",
  foreign_policy: "Foreign policy",
};

function issueLabel(id: string): string {
  return ISSUE_LABELS[id] ?? id.replaceAll("_", " ");
}

function sharePct(share: number | undefined): string {
  return `${Math.round((share ?? 0) * 100)}%`;
}

export function FormGovernmentWorkspace(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  report: (r: CommandResult) => boolean;
  onDone: () => void;
}) {
  const hung = isHungAssembly(props.world, props.snap);
  const canSteer = playerCanSteerFormation(props.world, props.snap);
  const math = assemblySeatMath(props.world, props.snap);
  const session = activeGovernmentFormation(props.snap);
  const leadPartyId =
    session?.leadPartyId ?? props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? null;
  const yourSeats = leadPartyId ? (math.byParty[leadPartyId] ?? 0) : 0;
  const needSeats = Math.max(0, math.majorityNeeded - yourSeats);
  const partners = leadPartyId ? listPotentialPartners(props.world, props.snap, leadPartyId) : [];

  const [selected, setSelected] = useState<string[]>(session?.selectedPartnerIds ?? []);
  const [priorities, setPriorities] = useState<PartyPlatformIssue[]>(
    session?.proposal?.policyPriorities ?? ["economy", "housing", "labor"],
  );
  const [redLines, setRedLines] = useState<PartyPlatformIssue[]>(session?.proposal?.redLines ?? []);
  const [cabinetDraft, setCabinetDraft] = useState<Record<string, number>>(
    session?.proposal?.cabinetShares ?? {},
  );

  const partyIdsForShares = useMemo(() => {
    if (!leadPartyId) return [];
    return [
      leadPartyId,
      ...(session?.selectedPartnerIds.length ? session.selectedPartnerIds : selected),
    ];
  }, [leadPartyId, selected, session?.selectedPartnerIds]);

  if (!hung) {
    return (
      <SectionCard title="Form a government">
        <EmptyState>
          A party already holds a majority — coalition talks are not required.
        </EmptyState>
      </SectionCard>
    );
  }

  if (!canSteer || !leadPartyId) {
    return (
      <SectionCard title="Form a government">
        <p className="muted">
          The Assembly is hung. Other parties are negotiating; you cannot steer talks from your
          current post.
        </p>
      </SectionCard>
    );
  }

  const run = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    props.report(props.sim.executeCommand(command));
    props.onDone();
  };

  const togglePartner = (partyId: string) => {
    setSelected((prev) =>
      prev.includes(partyId) ? prev.filter((id) => id !== partyId) : [...prev, partyId].sort(),
    );
  };

  const toggleIssue = (
    list: PartyPlatformIssue[],
    setList: (next: PartyPlatformIssue[]) => void,
    issue: PartyPlatformIssue,
  ) => {
    setList(list.includes(issue) ? list.filter((i) => i !== issue) : [...list, issue].slice(0, 4));
  };

  const ensureCabinetDraft = () => {
    if (Object.keys(cabinetDraft).length > 0) return cabinetDraft;
    const seats = partyIdsForShares.reduce((s, id) => s + (math.byParty[id] ?? 0), 0) || 1;
    const next: Record<string, number> = {};
    for (const id of partyIdsForShares) next[id] = (math.byParty[id] ?? 0) / seats;
    setCabinetDraft(next);
    return next;
  };

  const statusTone =
    session?.status === "agreement_ready" || session?.status === "formed"
      ? "ok"
      : session?.status === "failed" || session?.status === "fallback"
        ? "warn"
        : "idle";

  return (
    <div
      className="form-government-workspace negotiation-workspace"
      data-qa="form-government-workspace"
    >
      <div className="negotiation-panel formation-lead-panel">
        <h3 className="negotiation-panel-title">Form a government</h3>
        <div className="negotiation-panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            No party holds a majority. Build a governing majority through talks — partners may
            accept, reject, or counter with visible terms.
          </p>
        </div>
      </div>
      <SectionCard title="Coalition talks">
        <BriefStrip
          items={[
            {
              label: "Your party",
              value: `${partyDisplayName(props.world, leadPartyId, props.snap)} · ${yourSeats}`,
            },
            { label: "Majority needed", value: String(math.majorityNeeded) },
            { label: "Need", value: needSeats > 0 ? `${needSeats} more seats` : "Majority path" },
            { label: "Assembly", value: `${math.totalSeats} seats` },
          ]}
        />
        {session ? (
          <div style={{ marginTop: "0.5rem" }}>
            <StatusBadge tone={statusTone}>
              {session.status.replaceAll("_", " ")}
              {session.attempt > 0 ? ` · attempt ${session.attempt}` : ""}
            </StatusBadge>
          </div>
        ) : null}
      </SectionCard>

      {(!session ||
        session.status === "awaiting_partners" ||
        session.status === "failed" ||
        session.status === "talks_open") &&
      session?.status !== "talks_open" ? (
        <SectionCard title="Potential partners">
          <div className="politician-card-grid">
            {partners.map((partner) => {
              const checked = selected.includes(partner.partyId);
              return (
                <div className="faction-card" key={partner.partyId}>
                  <label className="row" style={{ gap: "0.4rem", alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePartner(partner.partyId)}
                    />
                    <span>
                      <strong>{partyDisplayName(props.world, partner.partyId, props.snap)}</strong>
                      <div className="muted small">
                        {partner.seats} seats · with you {partner.combinedWithLead}/
                        {math.totalSeats}{" "}
                        {partner.reachesMajority ? "(majority path)" : "(still short)"}
                      </div>
                      <div className="muted small">
                        Fit: {partner.ideologicalFit} · {partner.relationship}
                      </div>
                      <div className="muted small">
                        Priorities:{" "}
                        {partner.publicPriorities.map(issueLabel).join(", ") || "Unclear"}
                      </div>
                      <div className="muted small">
                        Red lines: {partner.redLines.map(issueLabel).join(", ") || "None public"}
                      </div>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          {partners.length === 0 ? <EmptyState>No other parties hold seats.</EmptyState> : null}
          <div className="row" style={{ gap: "0.4rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              disabled={selected.length === 0}
              onClick={() => run({ type: "OPEN_GOVERNMENT_TALKS", partnerPartyIds: selected })}
            >
              Open talks
            </button>
            {session && session.attempt > 0 ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => run({ type: "ABANDON_GOVERNMENT_TALKS" })}
              >
                Abandon attempt
              </button>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {session?.status === "talks_open" || session?.status === "counteroffer" ? (
        <SectionCard title="Negotiate terms">
          <SectionDivider title="Partners at the table" />
          <p className="muted small">
            {session.selectedPartnerIds
              .map((id) => partyDisplayName(props.world, id, props.snap))
              .join(" · ")}
          </p>

          <SectionDivider title="Governing priorities" />
          <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
            {PARTY_PLATFORM_ISSUES.map((issue) => (
              <button
                key={issue}
                type="button"
                className={`btn btn-sm ${priorities.includes(issue) ? "" : "secondary"}`}
                onClick={() => toggleIssue(priorities, setPriorities, issue)}
              >
                {issueLabel(issue)}
              </button>
            ))}
          </div>

          <SectionDivider title="Red lines (will not pursue)" />
          <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
            {PARTY_PLATFORM_ISSUES.map((issue) => (
              <button
                key={issue}
                type="button"
                className={`btn btn-sm ${redLines.includes(issue) ? "" : "secondary"}`}
                onClick={() => toggleIssue(redLines, setRedLines, issue)}
              >
                {issueLabel(issue)}
              </button>
            ))}
          </div>

          <SectionDivider title="Cabinet allocation" />
          <div className="politician-card-grid">
            {partyIdsForShares.map((partyId) => {
              const shares = ensureCabinetDraft();
              return (
                <div className="faction-card" key={partyId}>
                  <strong>{partyDisplayName(props.world, partyId, props.snap)}</strong>
                  <div className="muted small">{math.byParty[partyId] ?? 0} seats</div>
                  <label className="muted small">
                    Cabinet share {sharePct(shares[partyId])}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((shares[partyId] ?? 0) * 100)}
                      onChange={(event) => {
                        const next = {
                          ...ensureCabinetDraft(),
                          [partyId]: Number(event.target.value) / 100,
                        };
                        setCabinetDraft(next);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          {session.status === "counteroffer" && session.counteroffer ? (
            <div style={{ marginTop: "0.75rem" }}>
              <SectionDivider title="Partner counteroffer" />
              <p>{session.counterofferNote ?? "Partners proposed revised terms."}</p>
              <dl className="dossier-facts compact">
                <div>
                  <dt>Priorities</dt>
                  <dd>{session.counteroffer.policyPriorities.map(issueLabel).join(", ")}</dd>
                </div>
                <div>
                  <dt>Red lines</dt>
                  <dd>{session.counteroffer.redLines.map(issueLabel).join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Cabinet</dt>
                  <dd>
                    {Object.entries(session.counteroffer.cabinetShares)
                      .map(
                        ([id, share]) =>
                          `${partyDisplayName(props.world, id, props.snap)} ${sharePct(share)}`,
                      )
                      .join(" · ")}
                  </dd>
                </div>
              </dl>
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => run({ type: "RESPOND_TO_COALITION_COUNTER", response: "accept" })}
                >
                  Accept counteroffer
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    run({
                      type: "RESPOND_TO_COALITION_COUNTER",
                      response: "revise",
                      policyPriorities: priorities,
                      redLines,
                      cabinetShares: ensureCabinetDraft(),
                    })
                  }
                >
                  Send revised terms
                </button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: "0.4rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                disabled={priorities.length === 0}
                onClick={() =>
                  run({
                    type: "PROPOSE_COALITION_TERMS",
                    policyPriorities: priorities,
                    redLines,
                    cabinetShares: ensureCabinetDraft(),
                  })
                }
              >
                Propose terms
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => run({ type: "ABANDON_GOVERNMENT_TALKS" })}
              >
                Walk away
              </button>
            </div>
          )}
          {session.rejectNote ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              {session.rejectNote}
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      {session?.status === "agreement_ready" && session.proposal ? (
        <SectionCard title="Coalition agreement">
          <p>Partners have accepted these terms. Confirm to form the government.</p>
          <dl className="dossier-facts compact">
            <div>
              <dt>Parties</dt>
              <dd>
                {[session.leadPartyId, ...session.selectedPartnerIds]
                  .map((id) => partyDisplayName(props.world, id, props.snap))
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt>Priorities</dt>
              <dd>{session.proposal.policyPriorities.map(issueLabel).join(", ")}</dd>
            </div>
            <div>
              <dt>Red lines</dt>
              <dd>{session.proposal.redLines.map(issueLabel).join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>Cabinet</dt>
              <dd>
                {Object.entries(session.proposal.cabinetShares)
                  .map(
                    ([id, share]) =>
                      `${partyDisplayName(props.world, id, props.snap)} ${sharePct(share)}`,
                  )
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>
                {session.trigger === "assembly_confidence"
                  ? "Assembly investiture / confidence vote"
                  : "Presidential appointment under the coalition bargain"}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn"
            style={{ marginTop: "0.75rem" }}
            onClick={() => run({ type: "CONFIRM_GOVERNMENT_AGREEMENT" })}
          >
            Confirm agreement
          </button>
        </SectionCard>
      ) : null}

      {session?.status === "formed" ? (
        <SectionCard title="Government formed">
          <StatusBadge tone="ok">Coalition agreement in force</StatusBadge>
          <p className="muted">Cabinet appointments and agenda now follow the bargain.</p>
        </SectionCard>
      ) : null}

      {session?.status === "fallback" ? (
        <SectionCard title="Constitutional fallback">
          <StatusBadge tone="warn">Talks exhausted</StatusBadge>
          <p className="muted">
            Formation attempts failed. The constitutional default applies until a new majority can
            be assembled.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
