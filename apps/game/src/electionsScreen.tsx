import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import type {
  CommandResult,
  ElectionCertification,
  KernelWorld,
  SimState,
  Simulation,
} from "@lorsain/sim";
import { nominationCalendarDates } from "@lorsain/sim";
import {
  constituencyDisplayName,
  contestDisplayName,
  electionDisplayName,
  partyColor,
  partyDisplayName,
  politicianDisplayName,
  pollShareLine,
  type PresentationCatalog,
} from "./presentation.js";
import { formatPublicNumber, formatPublicPercent } from "./presentation/display.js";
import { latestPublicPoll, mapFillFor } from "./map/fills.js";
import { TerenaMap, type MapSelection } from "./map/TerenaMap.js";
import {
  DataTable,
  EmptyState,
  EntityRow,
  MapDetailLayout,
  PageHeader,
  SectionCard,
  SectionDivider,
  StatusBadge,
  TabBar,
} from "./ui/kit.js";
import {
  assemblyReportingOrder,
  electionNightFinalVisible,
  provinceReportingOrder,
} from "./electionNight.js";

type Props = {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  bundle: ContentBundle;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (result: CommandResult) => boolean;
  countingElection: boolean;
  onResolveAssembly: () => void;
  onResolvePresidential: () => void;
  globalFocus?: { kind: string; id: string } | null;
};

function voteWeight(raw: unknown): number {
  const [numerator, denominator = "1"] = String(raw ?? "0").split("/");
  const den = Number(denominator);
  return den === 0 ? 0 : (Number(numerator) || 0) / den;
}

function statusLabel(status: string): string {
  if (status === "field_open") return "Filing open";
  if (status === "field_finalized") return "Ballot finalized";
  if (status === "qualification") return "Qualification underway";
  if (status === "qualified") return "Qualified";
  if (status === "declared") return "Declared";
  if (status === "voting") return "Voting / counting";
  if (status === "resolved") return "Certified";
  if (status === "planned") return "Upcoming";
  if (status === "filing_open") return "Filing open";
  if (status === "assumed") return "Assumed";
  return status.replace(/_/g, " ");
}

function statusTone(status: string): "ok" | "warn" | "idle" {
  if (status === "resolved" || status === "assumed") return "ok";
  if (status === "field_open" || status === "filing_open" || status === "qualification")
    return "warn";
  return "idle";
}

function certificationSummary(certification: ElectionCertification | undefined): string {
  if (!certification) return "Certified result from a legacy election archive.";
  const authority =
    certification.authority === "national_electoral_commission"
      ? "National Electoral Commission"
      : "Provincial Electoral Commission";
  const recount =
    certification.recount === "automatic_exact_recount_completed"
      ? ` Automatic recount completed${certification.margin == null ? "" : ` after a ${(certification.margin * 100).toFixed(2)}% margin`}.`
      : " No recount was required.";
  const tie = certification.tieBreakMethods.length
    ? ` Recorded tie procedure: ${certification.tieBreakMethods.map((method) => method.replaceAll("_", " ")).join(", ")}.`
    : "";
  return `${authority} · ${certification.certifiedDate ?? "date unavailable"}.${recount}${tie}`;
}

function ElectionNightPanel(props: {
  phase: "ready" | "counting" | "certified";
  title: string;
  detail: string;
  outcome?: string | null;
}) {
  return (
    <section className={`election-night-workspace ${props.phase}`} aria-live="polite">
      <div>
        <div className="kicker">Election Night</div>
        <h3>{props.title}</h3>
        <p>{props.detail}</p>
      </div>
      <div className="election-night-state">
        <StatusBadge tone={props.phase === "certified" ? "ok" : "warn"}>
          {props.phase === "ready"
            ? "Polls closed"
            : props.phase === "counting"
              ? "Counting"
              : "Certified"}
        </StatusBadge>
        {props.outcome ? <strong>{props.outcome}</strong> : null}
      </div>
    </section>
  );
}

/** Restrained FLIP reorder when RCV candidate rails change rank by current totals. */
function useFlipReorder(dep: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const priorTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nextTops = new Map<string, number>();
    for (const child of Array.from(root.children) as HTMLElement[]) {
      const id = child.dataset.railId;
      if (!id) continue;
      const top = child.offsetTop;
      nextTops.set(id, top);
      const previous = priorTops.current.get(id);
      if (previous == null || previous === top) continue;
      const delta = previous - top;
      child.style.transition = "none";
      child.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        child.style.transition = "transform 0.35s ease, opacity 0.25s ease";
        child.style.transform = "";
      });
    }
    priorTops.current = nextTops;
  }, [dep]);
  return ref;
}

function mixMapColor(color: string, intensity: number, neutral = "#e4e1d8"): string {
  const t = Math.max(0.18, Math.min(1, intensity));
  return `color-mix(in srgb, ${color} ${Math.round(t * 100)}%, ${neutral})`;
}

function compositionPatternId(constituencyId: string): string {
  return `assembly-comp-${constituencyId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function PresidentialNightVisual(props: {
  replayKey: string;
  visibleCount: number;
  rounds: Array<{
    round?: number;
    majorityThreshold?: string;
    continuingDenominator?: string;
    totalsAfter?: Record<string, string>;
    eliminatedId?: string;
    electedId?: string;
    transfers: Array<{ toCandidateId?: string | null; value: string | number }>;
    exhaustedTotal?: string;
    newlyExhausted?: string;
  }>;
  firstPreferences: Record<string, string>;
  exhaustedFinal: number;
  candidates: Array<{ politicianId: string; partyId?: string | null }>;
  winnerId: string | null;
  world: KernelWorld;
  catalog: PresentationCatalog;
}) {
  const shown = props.rounds.slice(0, props.visibleCount);
  const current = shown[shown.length - 1];
  const totals = current?.totalsAfter ?? props.firstPreferences;
  const threshold = voteWeight(current?.majorityThreshold);
  const continuing = Math.max(
    voteWeight(current?.continuingDenominator),
    Object.values(totals).reduce((sum, value) => sum + voteWeight(value), 0),
    1,
  );
  const scale = Math.max(continuing, threshold, 1);
  const thresholdPct = Math.min(100, (threshold / scale) * 100);
  const eliminated = new Set(
    shown.flatMap((round) => (round.eliminatedId ? [round.eliminatedId] : [])),
  );
  const elected = new Set(shown.flatMap((round) => (round.electedId ? [round.electedId] : [])));
  const ordered = props.candidates.slice().sort((a, b) => {
    const aElim = eliminated.has(a.politicianId);
    const bElim = eliminated.has(b.politicianId);
    const aElect = elected.has(a.politicianId);
    const bElect = elected.has(b.politicianId);
    if (aElect !== bElect) return Number(bElect) - Number(aElect);
    if (aElim !== bElim) return Number(aElim) - Number(bElim);
    const votes = voteWeight(totals[b.politicianId]) - voteWeight(totals[a.politicianId]);
    return (
      votes || Number(a.politicianId !== props.winnerId) - Number(b.politicianId !== props.winnerId)
    );
  });
  const orderKey = ordered
    .map((row) => `${row.politicianId}:${Math.round(voteWeight(totals[row.politicianId]))}`)
    .join("|");
  const railRef = useFlipReorder(`${props.replayKey}:${props.visibleCount}:${orderKey}`);
  const exhausted = voteWeight(current?.exhaustedTotal);
  const newlyExhausted = voteWeight(current?.newlyExhausted);
  const transferTotal = Math.max(
    1,
    (current?.transfers ?? []).reduce((sum, row) => sum + voteWeight(row.value), 0),
  );
  return (
    <div className="presidential-night-stage">
      <div className="presidential-night-round">
        <span>
          {props.visibleCount ? `Round ${current?.round ?? props.visibleCount}` : "Polls closed"}
        </span>
        <strong>
          {current?.electedId
            ? "Winner elected"
            : current?.eliminatedId
              ? "Lowest candidate eliminated"
              : "Awaiting first count"}
        </strong>
      </div>
      {threshold > 0 ? (
        <div className="presidential-night-threshold" aria-label="Winner threshold">
          <span>Majority threshold</span>
          <strong>{Math.round(threshold).toLocaleString()}</strong>
          <small>{formatPublicPercent(threshold / continuing)} of continuing ballots</small>
        </div>
      ) : null}
      <div className="presidential-night-rails" ref={railRef}>
        {ordered.map((candidate) => {
          const value = voteWeight(totals[candidate.politicianId]);
          const status = elected.has(candidate.politicianId)
            ? "Elected"
            : eliminated.has(candidate.politicianId)
              ? "Eliminated"
              : "Active";
          return (
            <div
              className={`presidential-night-candidate ${status.toLowerCase()}`}
              data-rail-id={candidate.politicianId}
              key={candidate.politicianId}
            >
              <div>
                <span
                  className="party-swatch"
                  style={{ background: partyColor(props.world, candidate.partyId ?? null) }}
                />
                <strong>{politicianDisplayName(props.catalog, candidate.politicianId)}</strong>
                <small>{status}</small>
                <b>{Math.round(value).toLocaleString()}</b>
              </div>
              <span className="presidential-night-bar">
                {threshold > 0 ? (
                  <em
                    className="presidential-night-threshold-mark"
                    style={{ left: `${thresholdPct}%` }}
                    title="Majority threshold"
                  />
                ) : null}
                <i
                  style={{
                    width: `${(value / scale) * 100}%`,
                    background: partyColor(props.world, candidate.partyId ?? null),
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>
      <div className="rcv-exhausted" role="status">
        <span>Exhausted ballots</span>
        <strong>{Math.round(exhausted || props.exhaustedFinal).toLocaleString()}</strong>
        {newlyExhausted > 0 ? (
          <small>+{Math.round(newlyExhausted).toLocaleString()} this round</small>
        ) : null}
      </div>
      {current?.transfers.length ? (
        <div className="rcv-transfer-board">
          <strong>
            {current.eliminatedId
              ? `${politicianDisplayName(props.catalog, current.eliminatedId)} transfers`
              : "Recorded transfers"}
          </strong>
          {current.transfers.map((transfer, index) => {
            const amount = voteWeight(transfer.value);
            return (
              <div
                className={`rcv-transfer-row${transfer.toCandidateId ? "" : " exhausted"}`}
                key={`${transfer.toCandidateId ?? "exhausted"}:${index}`}
              >
                <span className="rcv-transfer-dest">
                  {transfer.toCandidateId
                    ? politicianDisplayName(props.catalog, transfer.toCandidateId)
                    : "Exhausted"}
                </span>
                <span className="rcv-transfer-track" aria-hidden>
                  <i style={{ width: `${(amount / transferTotal) * 100}%` }} />
                </span>
                <b>{formatPublicNumber(transfer.value)}</b>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type ElectionNightEvent = {
  id: string;
  title: string;
  detail: string;
  pauseAfter?: boolean;
};

export function ElectionNightReplay(props: {
  replayKey: string;
  title: string;
  subtitle: string;
  events: ElectionNightEvent[];
  unitLabel: string;
  renderVisual: (visibleCount: number) => ReactNode;
  historical?: boolean;
  onRevealChange?: (complete: boolean) => void;
}) {
  const storageKey = `lorsain:election-night:${props.replayKey}`;
  const restoredCount = () => {
    if (props.historical || typeof window === "undefined")
      return props.historical ? props.events.length : 0;
    const parsed = Number(window.sessionStorage.getItem(storageKey));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(props.events.length, parsed)) : 0;
  };
  const initialCount = restoredCount();
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const [speed, setSpeed] = useState<0 | 0.5 | 1 | 2 | 4>(() =>
    props.historical || initialCount > 0 ? 0 : 1,
  );
  useEffect(() => {
    const count = restoredCount();
    setVisibleCount(count);
    setSpeed(props.historical || count > 0 ? 0 : 1);
    props.onRevealChange?.(props.events.length === 0 || count >= props.events.length);
  }, [props.replayKey, props.historical, props.events.length]);
  useEffect(() => {
    if (!props.historical) window.sessionStorage.setItem(storageKey, String(visibleCount));
  }, [props.historical, storageKey, visibleCount]);
  useEffect(() => {
    if (speed === 0 || visibleCount >= props.events.length) return;
    const timer = window.setTimeout(
      () =>
        setVisibleCount((count) => {
          const next = Math.min(props.events.length, count + 1);
          if (props.events[next - 1]?.pauseAfter && next < props.events.length) setSpeed(0);
          return next;
        }),
      Math.max(150, Math.round(900 / speed)),
    );
    return () => window.clearTimeout(timer);
  }, [props.events.length, speed, visibleCount]);
  const complete = props.events.length > 0 && visibleCount >= props.events.length;
  useEffect(
    () => props.onRevealChange?.(props.events.length === 0 || complete),
    [complete, props.events.length, props.onRevealChange],
  );
  const phase = visibleCount === 0 ? "Polls closed" : complete ? "Certified" : "Counting";
  const recent = props.events.slice(Math.max(0, visibleCount - 6), visibleCount).reverse();
  return (
    <section className="election-night-live" aria-live="polite">
      <header className="election-night-live-head">
        <div>
          <div className="kicker">
            {props.historical ? "Replay Election Night" : "Election Night"}
          </div>
          <h2>{props.title}</h2>
          <p>{props.subtitle}</p>
        </div>
        <div className="election-night-live-status">
          <StatusBadge tone={complete ? "ok" : "warn"}>{phase}</StatusBadge>
          <strong>
            {visibleCount} / {props.events.length}
          </strong>
          <span>{props.unitLabel}</span>
        </div>
      </header>
      <div className="election-night-controls" aria-label="Election Night speed controls">
        <button type="button" className={speed === 0 ? "active" : ""} onClick={() => setSpeed(0)}>
          Pause
        </button>
        {([0.5, 1, 2, 4] as const).map((value) => (
          <button
            type="button"
            className={speed === value ? "active" : ""}
            key={value}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSpeed(0);
            setVisibleCount((count) => Math.min(props.events.length, count + 1));
          }}
        >
          Step
        </button>
        <button
          type="button"
          onClick={() => {
            setSpeed(0);
            setVisibleCount(props.events.length);
          }}
        >
          Instant
        </button>
        <button
          type="button"
          onClick={() => {
            if (!props.historical) window.sessionStorage.setItem(storageKey, "0");
            setVisibleCount(0);
            setSpeed(1);
            props.onRevealChange?.(false);
          }}
        >
          Replay
        </button>
      </div>
      <div className="election-night-live-body">
        <div className="election-night-live-visual">{props.renderVisual(visibleCount)}</div>
        <aside className="election-night-event-log">
          <h3>Latest results</h3>
          {recent.length === 0 ? (
            <p>Waiting for the first certified count event.</p>
          ) : (
            recent.map((event) => (
              <div key={event.id}>
                <strong>{event.title}</strong>
                <span>{event.detail}</span>
              </div>
            ))
          )}
        </aside>
      </div>
      <footer>
        {props.historical
          ? "Historical replay from the immutable certified count. "
          : "Results remain hidden until their exact count event appears. "}
        No precincts or reporting estimates are fabricated.
      </footer>
    </section>
  );
}

export function ElectionsPage(props: Props) {
  const elections = Object.values(props.snap.elections);
  const presidentialDue = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  const assemblyDue = props.snap.pendingInterrupt?.code === "ASSEMBLY_ELECTION_DUE";
  // Prefer election-scoped polls on the presidential tab; never mix nomination samples.
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [revealedNight, setRevealedNight] = useState<Record<string, boolean>>({});
  const [assemblyMapMode, setAssemblyMapMode] = useState<
    "largest" | "composition" | "seat_change" | "swing" | "turnout"
  >("largest");
  const [tab, setTab] = useState<
    "presidential" | "assembly" | "provincial_assembly" | "gubernatorial" | "internal" | "calendar"
  >("presidential");
  const monthsSinceElection = (date: string) =>
    (Number(props.snap.currentDate.slice(0, 4)) - Number(date.slice(0, 4))) * 12 +
    Number(props.snap.currentDate.slice(5, 7)) -
    Number(date.slice(5, 7));
  const isFreshElectionNight = (date: string) =>
    monthsSinceElection(date) >= 0 && monthsSinceElection(date) <= 1;
  const revealState = (key: string, complete: boolean) =>
    setRevealedNight((state) => (state[key] === complete ? state : { ...state, [key]: complete }));

  const electionOrder = (a: (typeof elections)[number], b: (typeof elections)[number]) => {
    const aCurrent = a.status !== "resolved" && a.status !== "cancelled";
    const bCurrent = b.status !== "resolved" && b.status !== "cancelled";
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    return aCurrent ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  };
  const presidential = elections.filter((e) => e.type === "presidential").sort(electionOrder);
  const assembly = elections
    .filter((e) => e.type === "assembly" && e.geographyKind === "national")
    .sort(electionOrder);
  const internalPartyContests = Object.values(props.snap.partyContests).sort((a, b) => {
    const aLive = a.status !== "resolved" && a.status !== "cancelled";
    const bLive = b.status !== "resolved" && b.status !== "cancelled";
    return (
      Number(bLive) - Number(aLive) ||
      (b.resolvedDate ?? b.createdDate).localeCompare(a.resolvedDate ?? a.createdDate) ||
      a.id.localeCompare(b.id)
    );
  });
  const internalCaucusContests = Object.values(props.snap.legislatureRuntime.caucusContests).sort(
    (a, b) =>
      Number(b.status === "open") - Number(a.status === "open") ||
      b.closeDate.localeCompare(a.closeDate) ||
      a.id.localeCompare(b.id),
  );
  const [internalSelection, setInternalSelection] = useState(
    internalPartyContests[0]
      ? `party:${internalPartyContests[0].id}`
      : internalCaucusContests[0]
        ? `caucus:${internalCaucusContests[0].id}`
        : "",
  );
  const [assemblyId, setAssemblyId] = useState(assembly[0]?.id ?? "");
  const selectedAssembly = assembly.find((e) => e.id === assemblyId) ?? assembly[0] ?? null;
  const gubernatorial = Object.values(props.snap.provincialRuntime.elections).sort((a, b) => {
    const aa = a.status !== "resolved" && a.status !== "assumed" ? 1 : 0;
    const ba = b.status !== "resolved" && b.status !== "assumed" ? 1 : 0;
    return (
      ba - aa ||
      (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
      a.provinceId.localeCompare(b.provinceId)
    );
  });
  const homeProvince = props.world.politicianHomeProvince[props.snap.playerPoliticianId];
  const [governorElectionId, setGovernorElectionId] = useState("");
  const selectedGovernorRace =
    gubernatorial.find((race) => race.id === governorElectionId) ??
    gubernatorial.find((race) => race.provinceId === homeProvince) ??
    gubernatorial[0] ??
    null;
  const governorReplayKey = selectedGovernorRace
    ? `governors:${selectedGovernorRace.date}`
    : "governors:none";
  const governorHistoricalReplay = selectedGovernorRace
    ? !isFreshElectionNight(selectedGovernorRace.date)
    : true;
  const governorFinalVisible =
    !selectedGovernorRace ||
    !["resolved", "assumed"].includes(selectedGovernorRace.status) ||
    governorHistoricalReplay ||
    revealedNight[governorReplayKey] === true;
  const provincialAssembly = Object.values(props.snap.provincialRuntime.assemblyElections).sort(
    (a, b) => {
      const aa = a.status !== "resolved" ? 1 : 0;
      const ba = b.status !== "resolved" ? 1 : 0;
      return (
        ba - aa ||
        (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
        a.provinceId.localeCompare(b.provinceId)
      );
    },
  );
  const [provincialAssemblyElectionId, setProvincialAssemblyElectionId] = useState("");
  const selectedProvincialAssembly =
    provincialAssembly.find((race) => race.id === provincialAssemblyElectionId) ??
    provincialAssembly.find((race) => race.provinceId === homeProvince) ??
    provincialAssembly[0] ??
    null;
  useEffect(() => {
    if (props.globalFocus?.kind !== "Election") return;
    const id = props.globalFocus.id;
    const national = elections.find((election) => election.id === id);
    if (national?.type === "presidential") setTab("presidential");
    if (national?.type === "assembly") {
      setTab("assembly");
      setAssemblyId(id);
    }
    if (gubernatorial.some((election) => election.id === id)) {
      setTab("gubernatorial");
      setGovernorElectionId(id);
    }
    if (provincialAssembly.some((election) => election.id === id)) {
      setTab("provincial_assembly");
      setProvincialAssemblyElectionId(id);
    }
  }, [props.globalFocus?.id, props.globalFocus?.kind]);
  const groupProvincialCycles = <T extends { date: string; status: string }>(
    rows: T[],
    label: string,
  ) =>
    Object.values(
      rows.reduce<Record<string, { date: string; title: string; detail: string; count: number }>>(
        (groups, row) => {
          const key = `${row.date}:${row.status}`;
          const existing = groups[key];
          if (existing) {
            existing.count += 1;
            existing.title = `${existing.count} ${label}`;
          } else {
            groups[key] = {
              date: row.date,
              title: `1 ${label}`,
              detail: statusLabel(row.status),
              count: 1,
            };
          }
          return groups;
        },
        {},
      ),
    );
  const calendarEvents = [
    ...elections.map((election) => ({
      date: election.date,
      title:
        election.type === "presidential" ? "Presidential election" : "National Assembly election",
      detail: statusLabel(election.status),
    })),
    ...groupProvincialCycles(
      Object.values(props.snap.provincialRuntime.elections),
      "gubernatorial elections",
    ),
    ...groupProvincialCycles(
      Object.values(props.snap.provincialRuntime.assemblyElections),
      "Provincial Assembly elections",
    ),
    ...Object.values(props.snap.legislatureRuntime.caucusContests).map((contest) => ({
      date: contest.closeDate,
      title: `${partyDisplayName(props.world, contest.partyId, props.snap)} ${contest.role === "floor_leader" ? "floor leader" : "whip"} election`,
      detail: statusLabel(contest.status),
    })),
    ...Object.values(props.snap.partyContests).flatMap((contest) => {
      const electionDate =
        typeof contest.metadata.electionDate === "string" ? contest.metadata.electionDate : null;
      const date =
        contest.type === "presidential_nomination" && electionDate
          ? nominationCalendarDates(electionDate).resolve
          : (contest.resolvedDate ??
            (typeof contest.metadata.closeDate === "string" ? contest.metadata.closeDate : null) ??
            contest.openedDate ??
            contest.createdDate);
      const title =
        contest.type === "presidential_nomination"
          ? `${partyDisplayName(props.world, contest.partyId, props.snap)} presidential nomination`
          : contest.factionId
            ? `${props.world.factionDefinitions[contest.factionId]?.name ?? "Caucus"} leadership contest`
            : `${partyDisplayName(props.world, contest.partyId, props.snap)} leadership election`;
      return [{ date, title, detail: statusLabel(contest.status) }];
    }),
    ...Object.values(props.snap.provincialRuntime.constitutionalAmendments).flatMap((amendment) =>
      amendment.ratificationDeadline
        ? [
            {
              date: amendment.ratificationDeadline,
              title: `${amendment.title} ratification deadline`,
              detail: `${amendment.ratifiedProvinceIds.length} of 13 provinces`,
            },
          ]
        : [],
    ),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  function presidentialView(election: (typeof elections)[number]) {
    const electionPoll = latestPublicPoll(props.snap, { electionId: election.id }) ?? null;
    const firstPreferences =
      election.countArchive && "firstPreferences" in election.countArchive
        ? election.countArchive.firstPreferences
        : {};
    const totalVotes = Object.values(firstPreferences).reduce(
      (sum, value) => sum + voteWeight(value),
      0,
    );
    const winnerId = election.winnerIds[0] ?? null;
    const ranked = Object.values(election.candidates)
      .slice()
      .sort((a, b) => {
        const votes =
          voteWeight(firstPreferences[b.politicianId]) -
          voteWeight(firstPreferences[a.politicianId]);
        return votes || Number(a.politicianId !== winnerId) - Number(b.politicianId !== winnerId);
      });
    const rounds =
      election.countArchive && "rounds" in election.countArchive
        ? election.countArchive.rounds
        : [];
    const exhaustedFinal =
      election.countArchive && "exhausted" in election.countArchive
        ? voteWeight(election.countArchive.exhausted)
        : 0;
    const nightEvents: ElectionNightEvent[] = rounds.map((round, index) => ({
      id: `${election.id}:round:${round.round ?? index + 1}`,
      title: round.electedId
        ? `${politicianDisplayName(props.catalog, round.electedId)} elected`
        : round.eliminatedId
          ? `${politicianDisplayName(props.catalog, round.eliminatedId)} eliminated`
          : `Round ${round.round ?? index + 1} completed`,
      detail: round.transfers.length
        ? `${round.transfers.length} exact transfer destination${round.transfers.length === 1 ? "" : "s"} recorded`
        : "No transfer was required",
      pauseAfter: Boolean(round.electedId),
    }));
    const replayKey = `president:${election.id}`;
    const historicalReplay = !isFreshElectionNight(election.date);
    const finalVisible = electionNightFinalVisible({
      status: election.status,
      eventCount: nightEvents.length,
      historical: historicalReplay,
      revealed: revealedNight[replayKey] === true,
    });
    const pollByCandidate = new Map(
      (electionPoll?.firstPreference ?? []).map((row) => [row.politicianId, row.share] as const),
    );

    return (
      <article key={election.id} className="election-pres-block">
        {presidentialDue && election.status !== "resolved" ? (
          <ElectionNightPanel
            phase={election.status === "voting" ? "counting" : "ready"}
            title="The national vote is ready to count"
            detail="The official ranked-choice tally has not been run. No projection or invented progress is shown."
          />
        ) : election.status === "resolved" && finalVisible ? (
          <ElectionNightPanel
            phase="certified"
            title={
              winnerId
                ? `${politicianDisplayName(props.catalog, winnerId)} elected President`
                : "Presidential result certified"
            }
            detail={`The result below is the certified national ranked-choice count. ${certificationSummary(election.certification)}`}
            outcome={
              winnerId === props.snap.playerPoliticianId
                ? "You won the presidency."
                : election.candidates[props.snap.playerPoliticianId]
                  ? "Your campaign was defeated."
                  : winnerId
                    ? `${partyDisplayName(props.world, election.candidates[winnerId]?.partyId ?? null, props.snap)} victory`
                    : null
            }
          />
        ) : null}
        {election.status === "resolved" && rounds.length > 0 ? (
          <ElectionNightReplay
            replayKey={replayKey}
            title={`${election.date.slice(0, 4)} Presidential Election`}
            subtitle="National ranked-choice count only. Terena publishes no province-level certified presidential returns."
            events={nightEvents}
            unitLabel="RCV rounds shown"
            historical={historicalReplay}
            onRevealChange={(complete) => revealState(replayKey, complete)}
            renderVisual={(visibleCount) => (
              <PresidentialNightVisual
                replayKey={replayKey}
                visibleCount={visibleCount}
                rounds={rounds}
                firstPreferences={firstPreferences}
                exhaustedFinal={exhaustedFinal}
                candidates={Object.values(election.candidates)}
                winnerId={winnerId}
                world={props.world}
                catalog={props.catalog}
              />
            )}
          />
        ) : null}
        <div
          className="election-pres-layout"
          hidden={election.status === "resolved" && !finalVisible}
        >
          <div>
            <SectionDivider
              title={electionDisplayName(election.id)}
              hint={election.date}
              actions={
                <StatusBadge tone={statusTone(election.status)}>
                  {statusLabel(election.status)}
                </StatusBadge>
              }
            />
            {winnerId ? (
              <div className="election-winner-banner">
                <div className="kicker">Winner</div>
                <strong>{politicianDisplayName(props.catalog, winnerId)}</strong>
                <div className="muted">
                  {partyDisplayName(
                    props.world,
                    election.candidates[winnerId]?.partyId ?? null,
                    props.snap,
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">
                {election.status === "resolved"
                  ? "No certified winner recorded."
                  : "National result pending resolution."}
              </p>
            )}
            <div className="presidential-no-geo" role="note">
              <div className="kicker">Geography</div>
              <strong>No geographic Presidential returns</strong>
              <p>
                Terena certifies the presidency from the national ranked-choice count only. There
                are no province-level presidential returns to map.
              </p>
            </div>
            {electionPoll ? (
              <div className="presidential-poll-compare">
                <SectionDivider
                  title={
                    election.status === "resolved"
                      ? "National polling comparison"
                      : "National public polling"
                  }
                  hint={
                    election.status === "resolved"
                      ? `Final published poll ${electionPoll.publicationDate} vs certified first preferences`
                      : `Published ${electionPoll.publicationDate} · national sample, not a geographic map`
                  }
                />
                {election.status === "resolved" && totalVotes > 0 ? (
                  <DataTable
                    headers={["Candidate", "Poll", "1st preference"]}
                    dense
                    caption="National first preferences compared with the last public poll"
                  >
                    {ranked.map((candidate) => {
                      const actual =
                        voteWeight(firstPreferences[candidate.politicianId]) / totalVotes;
                      const polled = pollByCandidate.get(candidate.politicianId);
                      return (
                        <tr key={candidate.politicianId}>
                          <td>{politicianDisplayName(props.catalog, candidate.politicianId)}</td>
                          <td>{polled == null ? "—" : formatPublicPercent(polled)}</td>
                          <td>{formatPublicPercent(actual)}</td>
                        </tr>
                      );
                    })}
                  </DataTable>
                ) : (
                  <p className="muted">
                    {pollShareLine(
                      props.catalog,
                      props.world,
                      props.snap,
                      electionPoll.firstPreference,
                    )}
                  </p>
                )}
              </div>
            ) : election.status !== "resolved" ? (
              <p className="muted">No current national presidential poll has been published.</p>
            ) : null}
            {presidentialDue && election.status !== "resolved" ? (
              <button type="button" className="btn" onClick={props.onResolvePresidential}>
                Resolve election
              </button>
            ) : null}
          </div>
          <aside className="candidate-result-rail">
            <SectionDivider title="Candidates" hint="1st preference shares" />
            {ranked.length === 0 ? <EmptyState>No candidates filed.</EmptyState> : null}
            {ranked.map((candidate) => {
              const rawVotes = firstPreferences[candidate.politicianId];
              const firstPreferenceShare =
                totalVotes > 0 ? voteWeight(rawVotes) / totalVotes : undefined;
              const isWinner = winnerId === candidate.politicianId;
              return (
                <EntityRow
                  key={candidate.politicianId}
                  title={politicianDisplayName(props.catalog, candidate.politicianId)}
                  meta={partyDisplayName(props.world, candidate.partyId ?? null, props.snap)}
                  status={
                    isWinner ? (
                      <StatusBadge tone="ok">Winner</StatusBadge>
                    ) : election.status === "resolved" ? (
                      <StatusBadge>Defeated</StatusBadge>
                    ) : (
                      <StatusBadge>On ballot</StatusBadge>
                    )
                  }
                  trailing={
                    rawVotes != null ? (
                      <span className="election-votes">
                        {formatPublicPercent(firstPreferenceShare)}
                        <span className="muted"> · {formatPublicNumber(rawVotes)}</span>
                      </span>
                    ) : null
                  }
                  selected={isWinner}
                />
              );
            })}
          </aside>
        </div>
        {rounds.length > 0 && finalVisible ? (
          <>
            <SectionDivider title="Ranked-choice rounds" hint="Elimination and election sequence" />
            <DataTable headers={["Round", "Outcome", "Exhausted"]} dense caption="RCV progression">
              {rounds.map((round, index) => (
                <tr key={index}>
                  <td>{round.round ?? index + 1}</td>
                  <td>
                    {round.eliminatedId
                      ? `Excluded ${politicianDisplayName(props.catalog, round.eliminatedId)}`
                      : round.electedId
                        ? `Elected ${politicianDisplayName(props.catalog, round.electedId)}`
                        : "Count complete"}
                  </td>
                  <td>{formatPublicNumber(round.exhaustedTotal)}</td>
                </tr>
              ))}
            </DataTable>
          </>
        ) : null}
      </article>
    );
  }

  function assemblyView(election: (typeof elections)[number]) {
    const cycle = election.assembly;
    const results = cycle?.constituencyResults ?? {};
    const fields = cycle?.constituencyFields ?? {};
    const previousAssembly =
      Object.values(props.snap.elections)
        .filter(
          (row) =>
            row.type === "assembly" &&
            row.status === "resolved" &&
            row.date < election.date &&
            row.assembly,
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0]?.assembly ??
      null;
    const seatRows = (entry: (typeof results)[string] | undefined) => {
      const totals = new Map<string | null, number>();
      for (const winnerId of entry?.electedIds ?? []) {
        const partyId = entry?.partyByCandidate[winnerId] ?? null;
        totals.set(partyId, (totals.get(partyId) ?? 0) + 1);
      }
      return [...totals.entries()]
        .map(([partyId, seats]) => ({ partyId, seats }))
        .sort((a, b) => b.seats - a.seats || String(a.partyId).localeCompare(String(b.partyId)));
    };
    const preferenceRows = (entry: (typeof results)[string] | undefined) => {
      const totals = new Map<string | null, number>();
      let total = 0;
      for (const [candidateId, raw] of Object.entries(entry?.firstPreferences ?? {})) {
        const votes = voteWeight(raw);
        total += votes;
        const partyId = entry?.partyByCandidate[candidateId] ?? null;
        totals.set(partyId, (totals.get(partyId) ?? 0) + votes);
      }
      return new Map(
        [...totals.entries()].map(([partyId, votes]) => [partyId, total ? votes / total : 0]),
      );
    };
    const assemblyMapParty = (id: string): string | null => {
      const current = results[id];
      if (!current) return null;
      if (assemblyMapMode === "largest" || assemblyMapMode === "composition")
        return seatRows(current)[0]?.partyId ?? null;
      const previous = previousAssembly?.constituencyResults[id];
      if (!previous) return null;
      if (assemblyMapMode === "seat_change") {
        const old = new Map(seatRows(previous).map((row) => [row.partyId, row.seats]));
        const largestGain = seatRows(current)
          .map((row) => ({ partyId: row.partyId, change: row.seats - (old.get(row.partyId) ?? 0) }))
          .sort(
            (a, b) => b.change - a.change || String(a.partyId).localeCompare(String(b.partyId)),
          )[0];
        return largestGain && largestGain.change > 0 ? largestGain.partyId : null;
      }
      const now = preferenceRows(current);
      const before = preferenceRows(previous);
      return (
        [...now.entries()]
          .map(([partyId, share]) => ({ partyId, swing: share - (before.get(partyId) ?? 0) }))
          .sort(
            (a, b) => b.swing - a.swing || String(a.partyId).localeCompare(String(b.partyId)),
          )[0]?.partyId ?? null
      );
    };
    const seatChangeMagnitude = (id: string): number => {
      const current = results[id];
      const previous = previousAssembly?.constituencyResults[id];
      if (!current || !previous) return 0;
      const old = new Map(seatRows(previous).map((row) => [row.partyId, row.seats]));
      return Math.max(
        0,
        ...seatRows(current).map((row) => row.seats - (old.get(row.partyId) ?? 0)),
      );
    };
    const swingMagnitude = (id: string): number => {
      const current = results[id];
      const previous = previousAssembly?.constituencyResults[id];
      if (!current || !previous) return 0;
      const now = preferenceRows(current);
      const before = preferenceRows(previous);
      return Math.max(
        0,
        ...[...now.entries()].map(([partyId, share]) => share - (before.get(partyId) ?? 0)),
      );
    };
    const maxSeatChange = Math.max(1, ...Object.keys(results).map(seatChangeMagnitude));
    const maxSwing = Math.max(0.01, ...Object.keys(results).map(swingMagnitude));
    const compositionDefs = Object.values(results).flatMap((entry) => {
      const seats = seatRows(entry);
      if (seats.length < 2) return [];
      const total = seats.reduce((sum, row) => sum + row.seats, 0) || 1;
      const band = 12;
      let cursor = 0;
      return [
        <pattern
          id={compositionPatternId(entry.constituencyId)}
          key={entry.constituencyId}
          width={band * seats.length}
          height={band}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          {seats.map((row) => {
            const width = Math.max(2, (row.seats / total) * band * seats.length);
            const x = cursor;
            cursor += width;
            return (
              <rect
                key={`${row.partyId ?? "independent"}:${x}`}
                x={x}
                y={0}
                width={width}
                height={band}
                fill={partyColor(props.world, row.partyId)}
              />
            );
          })}
        </pattern>,
      ];
    });
    const available = [...new Set([...Object.keys(results), ...Object.keys(fields)])].sort();
    const constituencyId =
      selection?.kind === "constituency" && available.includes(selection.id)
        ? selection.id
        : (available[0] ?? null);
    const result = constituencyId ? results[constituencyId] : null;
    const field = constituencyId ? fields[constituencyId] : null;
    const candidateIds = result?.candidateIds ?? field?.candidateIds ?? [];
    const elected = new Set(result?.electedIds ?? []);
    const firstPreferences = result?.firstPreferences ?? {};
    const totalFirstPreferences = Object.values(firstPreferences).reduce(
      (sum, value) => sum + voteWeight(value),
      0,
    );
    const candidateRows = candidateIds.slice().sort((a, b) => {
      const voteDelta = voteWeight(firstPreferences[b]) - voteWeight(firstPreferences[a]);
      return voteDelta || Number(elected.has(b)) - Number(elected.has(a)) || a.localeCompare(b);
    });
    const magnitude = result?.magnitude ?? field?.magnitude ?? 0;
    const partyRows = Object.entries(cycle?.partySeatTotals ?? {})
      .map(([partyKey, seats]) => ({
        partyKey,
        partyId: partyKey === "independent" ? null : partyKey,
        seats,
        change: seats - (cycle?.previousPartySeatTotals[partyKey] ?? 0),
      }))
      .sort((a, b) => b.seats - a.seats || a.partyKey.localeCompare(b.partyKey));
    const majority = partyRows.find((row) => row.seats >= 211);
    const pluralityParty = (id: string): string | null => {
      const constituency = results[id];
      if (!constituency) return null;
      const totals = new Map<string | null, number>();
      for (const winnerId of constituency.electedIds) {
        const partyId = constituency.partyByCandidate[winnerId] ?? null;
        totals.set(partyId, (totals.get(partyId) ?? 0) + 1);
      }
      return (
        [...totals.entries()].sort(
          (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
        )[0]?.[0] ?? null
      );
    };
    const steps = result?.countArchive?.steps ?? [];
    const playerFiled = Object.values(fields).some((entry) =>
      entry.candidateIds.includes(props.snap.playerPoliticianId),
    );
    const playerElected = Object.values(results).some((entry) =>
      entry.electedIds.includes(props.snap.playerPoliticianId),
    );
    const nightResultOrder = assemblyReportingOrder(election.id, Object.values(results));
    const runningSeats = new Map<string | null, number>();
    const partiesAlreadyAtMajority = new Set<string | null>();
    const nightEvents: ElectionNightEvent[] = nightResultOrder.map((entry) => {
      let crossedMajority = false;
      for (const electedId of entry.electedIds) {
        const partyId = entry.partyByCandidate[electedId] ?? null;
        const total = (runningSeats.get(partyId) ?? 0) + 1;
        runningSeats.set(partyId, total);
        if (total >= 211 && !partiesAlreadyAtMajority.has(partyId)) {
          partiesAlreadyAtMajority.add(partyId);
          crossedMajority = true;
        }
      }
      const currentSeats = seatRows(entry);
      const priorSeats = new Map(
        seatRows(previousAssembly?.constituencyResults[entry.constituencyId]).map((row) => [
          row.partyId,
          row.seats,
        ]),
      );
      const lead = currentSeats[0];
      const change = lead ? lead.seats - (priorSeats.get(lead.partyId) ?? 0) : 0;
      return {
        id: `${election.id}:${entry.constituencyId}`,
        title:
          props.catalog.places.get(entry.constituencyId)?.name ??
          constituencyDisplayName(props.catalog, entry.constituencyId),
        detail: `${entry.electedIds.length} seats certified · ${lead ? partyDisplayName(props.world, lead.partyId, props.snap) : "No party"} ${change > 0 ? `gains ${change}` : change < 0 ? `loses ${Math.abs(change)}` : "holds"}`,
        ...(crossedMajority || entry.candidateIds.includes(props.snap.playerPoliticianId)
          ? { pauseAfter: true }
          : {}),
      };
    });
    const replayKey = `assembly:${election.id}`;
    const historicalReplay = !isFreshElectionNight(election.date);
    const finalVisible = electionNightFinalVisible({
      status: election.status,
      eventCount: nightEvents.length,
      historical: historicalReplay,
      revealed: revealedNight[replayKey] === true,
    });

    return (
      <div className="assembly-election-view">
        {assemblyDue && election.status !== "resolved" ? (
          <ElectionNightPanel
            phase={props.countingElection || election.status === "voting" ? "counting" : "ready"}
            title={
              props.countingElection
                ? "The national STV count is underway"
                : "All constituency ballots are ready"
            }
            detail={
              props.countingElection
                ? "The count is running off the main interface. Results appear only when the exact count finishes."
                : "Begin the official count when ready. The count cannot be run twice."
            }
          />
        ) : election.status === "resolved" && finalVisible ? (
          <ElectionNightPanel
            phase="certified"
            title={
              majority
                ? `${partyDisplayName(props.world, majority.partyId, props.snap)} wins an Assembly majority`
                : "No party wins an Assembly majority"
            }
            detail={`Certified constituency STV results and the national party composition are shown below. ${certificationSummary(election.certification)}`}
            outcome={
              playerFiled ? (playerElected ? "You were elected." : "You were not elected.") : null
            }
          />
        ) : null}
        {election.status === "resolved" && nightEvents.length > 0 ? (
          <ElectionNightReplay
            replayKey={replayKey}
            title={`${election.date.slice(0, 4)} National Assembly Election`}
            subtitle="Constituency STV results populate the chamber and map from the archived certified counts."
            events={nightEvents}
            unitLabel="constituencies completed"
            historical={historicalReplay}
            onRevealChange={(complete) => revealState(replayKey, complete)}
            renderVisual={(visibleCount) => {
              const revealed = nightResultOrder.slice(0, visibleCount);
              const revealedIds = new Set(revealed.map((entry) => entry.constituencyId));
              const seats = new Map<string | null, number>();
              for (const entry of revealed)
                for (const winner of entry.electedIds) {
                  const partyId = entry.partyByCandidate[winner] ?? null;
                  seats.set(partyId, (seats.get(partyId) ?? 0) + 1);
                }
              const totals = [...seats.entries()].sort(
                (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
              );
              const allocated = totals.reduce((sum, [, seatTotal]) => sum + seatTotal, 0);
              return (
                <div className="assembly-night-stage">
                  <div className="assembly-night-totals">
                    <div>
                      <span>Seats allocated</span>
                      <strong>{allocated} / 420</strong>
                    </div>
                    <div>
                      <span>Majority</span>
                      <strong>211</strong>
                    </div>
                    <div>
                      <span>Constituencies</span>
                      <strong>
                        {visibleCount} / {nightResultOrder.length}
                      </strong>
                    </div>
                  </div>
                  <div className="assembly-night-grid">
                    <TerenaMap
                      bundle={props.bundle}
                      mode="election"
                      showConstituencies
                      fillFor={(feature, kind) =>
                        kind === "constituency"
                          ? revealedIds.has(feature.id)
                            ? partyColor(props.world, pluralityParty(feature.id))
                            : "#d9d6cf"
                          : "#f3f0e9"
                      }
                      onSelect={(picked) => {
                        if (picked.kind === "constituency") setSelection(picked);
                      }}
                      tooltipFor={(picked) => (
                        <>
                          <strong>{picked.name}</strong>
                          <span>
                            {revealedIds.has(picked.id)
                              ? `${partyDisplayName(props.world, pluralityParty(picked.id), props.snap)} largest delegation`
                              : "Result not yet shown"}
                          </span>
                        </>
                      )}
                    />
                    <div className="assembly-night-party-rail">
                      {totals.map(([partyId, seatTotal]) => (
                        <div key={partyId ?? "independent"}>
                          <span
                            className="party-swatch"
                            style={{ background: partyColor(props.world, partyId) }}
                          />
                          <strong>{partyDisplayName(props.world, partyId, props.snap)}</strong>
                          <b>{seatTotal}</b>
                          <small>
                            {seatTotal >= 211 ? "Majority" : `${211 - seatTotal} short`}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        ) : null}
        <div
          className="certified-result-gate"
          hidden={election.status === "resolved" && !finalVisible}
        >
          <SectionDivider
            title={electionDisplayName(election.id)}
            hint={`Election date ${election.date}`}
            actions={
              <StatusBadge tone={statusTone(election.status)}>
                {statusLabel(election.status)}
              </StatusBadge>
            }
          />
          {partyRows.length > 0 ? (
            <>
              <div className="composition-bar" aria-label="Assembly party composition">
                {partyRows.map((row) => (
                  <span
                    key={row.partyKey}
                    className="composition-seg"
                    style={{
                      width: `${(row.seats / 420) * 100}%`,
                      background: partyColor(props.world, row.partyId),
                    }}
                    title={`${partyDisplayName(props.world, row.partyId, props.snap)}: ${row.seats}`}
                  />
                ))}
              </div>
              <p className="majority-note">
                420 seats · 211 for a majority ·{" "}
                {majority
                  ? `${partyDisplayName(props.world, majority.partyId, props.snap)} holds a majority`
                  : "No party holds a majority"}
              </p>
              <DataTable headers={["Party", "Seats", "Change"]} dense>
                {partyRows.map((row) => (
                  <tr key={row.partyKey}>
                    <td>
                      <span
                        className="party-swatch"
                        style={{ background: partyColor(props.world, row.partyId) }}
                        aria-hidden
                      />{" "}
                      {partyDisplayName(props.world, row.partyId, props.snap)}
                    </td>
                    <td>{row.seats}</td>
                    <td className="muted">
                      {row.change === 0 ? "—" : row.change > 0 ? `+${row.change}` : row.change}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <SectionDivider
                title="Constituency result desk"
                hint="Highest-turnout certified counts"
              />
              <div className="election-result-feed">
                {Object.values(results)
                  .sort(
                    (a, b) =>
                      b.turnout.turnoutRate - a.turnout.turnoutRate ||
                      a.constituencyId.localeCompare(b.constituencyId),
                  )
                  .slice(0, 8)
                  .map((constituency) => (
                    <button
                      type="button"
                      key={constituency.constituencyId}
                      onClick={() =>
                        setSelection({
                          id: constituency.constituencyId,
                          kind: "constituency",
                          name: constituencyDisplayName(props.catalog, constituency.constituencyId),
                        })
                      }
                    >
                      <strong>
                        {constituencyDisplayName(props.catalog, constituency.constituencyId)}
                      </strong>
                      <span>
                        {constituency.electedIds
                          .map((id) => politicianDisplayName(props.catalog, id))
                          .join(", ")}
                      </span>
                      <small>Turnout {formatPublicPercent(constituency.turnout.turnoutRate)}</small>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <p className="muted">
              {cycle?.filingStatus === "open"
                ? `Candidate filing is open through ${cycle.filingDeadlineDate}.`
                : election.fieldFinalized
                  ? `${Object.keys(fields).length} constituency ballots are finalized.`
                  : "Candidate filing has not opened."}
            </p>
          )}
          {assemblyDue && election.status !== "resolved" ? (
            <button
              type="button"
              className="btn"
              disabled={props.countingElection}
              onClick={props.onResolveAssembly}
            >
              {props.countingElection ? "Counting election…" : "Resolve Assembly election"}
            </button>
          ) : null}
          {props.countingElection ? (
            <p className="counting-state" role="status" aria-live="polite">
              Counting election… The national STV count is running in the background.
            </p>
          ) : null}

          <MapDetailLayout
            className="assembly-results-layout"
            detailVisible={selection?.kind === "constituency"}
            map={
              <>
                <SectionDivider title="Constituency map" />
                <div className="map-scale-switch" aria-label="Assembly result map mode">
                  {(
                    [
                      ["largest", "Largest Delegation"],
                      ["composition", "Seat Composition"],
                      ["seat_change", "Seat Change"],
                      ["swing", "Swing"],
                      ["turnout", "Turnout"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      className={assemblyMapMode === id ? "active" : ""}
                      onClick={() => setAssemblyMapMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <TerenaMap
                  bundle={props.bundle}
                  mode="election"
                  selectedId={constituencyId}
                  defs={assemblyMapMode === "composition" ? compositionDefs : undefined}
                  fillFor={(feature, kind) => {
                    if (kind === "province") return "#e7efe6";
                    const entry = results[feature.id];
                    if (!entry) return "transparent";
                    if (assemblyMapMode === "turnout") {
                      const rate = entry.turnout.turnoutRate;
                      return `hsl(205, 35%, ${88 - Math.max(0, Math.min(1, (rate - 0.45) / 0.35)) * 42}%)`;
                    }
                    if (assemblyMapMode === "composition") {
                      const seats = seatRows(entry);
                      if (seats.length >= 2) return `url(#${compositionPatternId(feature.id)})`;
                      return partyColor(props.world, seats[0]?.partyId ?? null);
                    }
                    const partyId = assemblyMapParty(feature.id);
                    if (assemblyMapMode === "seat_change") {
                      if (!partyId) return "#d9d6cf";
                      return mixMapColor(
                        partyColor(props.world, partyId),
                        seatChangeMagnitude(feature.id) / maxSeatChange,
                      );
                    }
                    if (assemblyMapMode === "swing") {
                      if (!partyId) return "#d9d6cf";
                      return mixMapColor(
                        partyColor(props.world, partyId),
                        swingMagnitude(feature.id) / maxSwing,
                      );
                    }
                    return partyColor(props.world, partyId);
                  }}
                  onSelect={setSelection}
                  tooltipFor={(picked) => {
                    const entry = results[picked.id];
                    const seats = seatRows(entry);
                    const change = seatChangeMagnitude(picked.id);
                    const swing = swingMagnitude(picked.id);
                    return (
                      <>
                        <strong>{picked.name}</strong>
                        <span>
                          {entry
                            ? `${(entry.turnout.turnoutRate * 100).toFixed(1)}% turnout`
                            : "No certified result"}
                        </span>
                        {assemblyMapMode === "seat_change" && entry ? (
                          <small>
                            Largest seat gain {change > 0 ? `+${change}` : "none vs prior"}
                          </small>
                        ) : null}
                        {assemblyMapMode === "swing" && entry ? (
                          <small>
                            Largest 1st-pref swing{" "}
                            {swing > 0 ? `+${(swing * 100).toFixed(1)} pts` : "none"}
                          </small>
                        ) : null}
                        {seats.map((row) => (
                          <small key={row.partyId ?? "independent"}>
                            {partyDisplayName(props.world, row.partyId, props.snap)} · {row.seats}
                          </small>
                        ))}
                      </>
                    );
                  }}
                />
                <p className="muted">
                  {assemblyMapMode === "largest"
                    ? "Color = largest certified seat delegation."
                    : assemblyMapMode === "composition"
                      ? "Stripes = certified multi-party seat split within the constituency; solid = single-party slate."
                      : assemblyMapMode === "seat_change"
                        ? "Color = party with the largest certified seat gain; stronger tint = larger gain; gray = no gain or no comparison."
                        : assemblyMapMode === "swing"
                          ? "Color = party with the largest first-preference increase; stronger tint = larger swing; gray = no comparison."
                          : "Darker = higher certified turnout."}
                </p>
              </>
            }
            detail={
              <>
                <SectionDivider
                  title={
                    constituencyId
                      ? constituencyDisplayName(props.catalog, constituencyId)
                      : "Constituency"
                  }
                  {...(constituencyId
                    ? {
                        hint: `${magnitude} seat${magnitude === 1 ? "" : "s"}${
                          result
                            ? ` · turnout ${formatPublicPercent(result.turnout.turnoutRate)}`
                            : " · ballot field"
                        }`,
                      }
                    : {})}
                />
                {!constituencyId ? (
                  <EmptyState>Constituency fields are not available yet.</EmptyState>
                ) : (
                  <>
                    {result?.archiveCompleteness === "legacy_summary" ? (
                      <p className="muted">This result predates detailed STV archiving.</p>
                    ) : null}
                    <DataTable
                      headers={["Candidate", "Party", "1st pref", "Status"]}
                      dense
                      caption={magnitude > 1 ? "STV multi-member field" : "Constituency field"}
                    >
                      {candidateRows.map((candidateId) => {
                        const rawVotes = firstPreferences[candidateId];
                        const share =
                          totalFirstPreferences > 0
                            ? voteWeight(rawVotes) / totalFirstPreferences
                            : undefined;
                        const partyId =
                          result?.partyByCandidate[candidateId] ??
                          selectedAssembly?.assembly?.candidacies[candidateId]?.partyId ??
                          null;
                        const status = result
                          ? elected.has(candidateId)
                            ? "Elected"
                            : "Not elected"
                          : "Candidate";
                        return (
                          <tr
                            key={candidateId}
                            className={elected.has(candidateId) ? "selected" : ""}
                          >
                            <td>{politicianDisplayName(props.catalog, candidateId)}</td>
                            <td>{partyDisplayName(props.world, partyId, props.snap)}</td>
                            <td>
                              {rawVotes != null
                                ? `${formatPublicPercent(share)} · ${formatPublicNumber(rawVotes)}`
                                : "—"}
                            </td>
                            <td>
                              <StatusBadge tone={elected.has(candidateId) ? "ok" : "idle"}>
                                {status}
                              </StatusBadge>
                            </td>
                          </tr>
                        );
                      })}
                    </DataTable>
                    {steps.length > 0 ? (
                      <>
                        <SectionDivider title="STV count steps" />
                        <DataTable headers={["Count", "Outcome"]} dense>
                          {steps.map((step) => {
                            const electedNames = [
                              ...(step.electedId ? [step.electedId] : []),
                              ...(step.electedIds ?? []),
                            ].map((id) => politicianDisplayName(props.catalog, id));
                            return (
                              <tr key={step.step}>
                                <td>{step.step}</td>
                                <td>
                                  {electedNames.length
                                    ? `Elected ${electedNames.join(", ")}`
                                    : step.eliminatedId
                                      ? `Excluded ${politicianDisplayName(props.catalog, step.eliminatedId)}`
                                      : "Count complete"}
                                </td>
                              </tr>
                            );
                          })}
                        </DataTable>
                      </>
                    ) : null}
                  </>
                )}
              </>
            }
          />
        </div>
      </div>
    );
  }

  function provincialAssemblyView(election: (typeof provincialAssembly)[number]) {
    const sameCycle = provincialAssembly.filter(
      (candidate) => candidate.date.slice(0, 4) === election.date.slice(0, 4),
    );
    const pluralityParty = (race: (typeof provincialAssembly)[number]): string | null =>
      Object.entries(race.partySeats).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? null;
    const partyRows = [
      ...new Set([...Object.keys(election.partySeats), ...Object.keys(election.partyVoteShares)]),
    ]
      .map((partyId) => ({
        partyId,
        seats: election.partySeats[partyId] ?? 0,
        voteShare: election.partyVoteShares[partyId],
      }))
      .sort(
        (a, b) =>
          b.seats - a.seats ||
          (b.voteShare ?? 0) - (a.voteShare ?? 0) ||
          a.partyId.localeCompare(b.partyId),
      );
    const leadingParty = partyRows[0] ?? null;
    const playerFiled = election.candidateIds.includes(props.snap.playerPoliticianId);
    const playerElected = election.electedIds.includes(props.snap.playerPoliticianId);
    const resolvedCycle = provinceReportingOrder(
      `provincial-assembly:${election.date.slice(0, 4)}`,
      sameCycle.filter((race) => race.status === "resolved"),
    );
    const nightEvents: ElectionNightEvent[] = resolvedCycle.map((race) => {
      const leadParty = pluralityParty(race);
      return {
        id: race.id,
        title: props.catalog.places.get(race.provinceId)?.name ?? race.provinceId,
        detail: `${partyDisplayName(props.world, leadParty, props.snap)} largest bloc · ${race.electedIds.length} seats certified`,
        ...(race.candidateIds.includes(props.snap.playerPoliticianId) ? { pauseAfter: true } : {}),
      };
    });
    const replayKey = `provincial-assemblies:${election.date.slice(0, 4)}`;
    const historicalReplay = !isFreshElectionNight(election.date);
    const finalVisible = electionNightFinalVisible({
      status: election.status,
      eventCount: nightEvents.length,
      historical: historicalReplay,
      revealed: revealedNight[replayKey] === true,
    });

    return (
      <div className="provincial-assembly-election-view">
        {election.status === "resolved" && finalVisible ? (
          <ElectionNightPanel
            phase="certified"
            title={
              leadingParty
                ? `${partyDisplayName(props.world, leadingParty.partyId, props.snap)} leads the ${props.catalog.places.get(election.provinceId)?.name ?? "provincial"} Assembly`
                : "Provincial Assembly result certified"
            }
            detail={`The party vote, seat allocation, and elected slate below are the certified province-wide result. ${certificationSummary(election.certification)}`}
            outcome={
              playerFiled ? (playerElected ? "You won a seat." : "You were not elected.") : null
            }
          />
        ) : null}
        {election.status === "resolved" && nightEvents.length > 0 ? (
          <ElectionNightReplay
            replayKey={replayKey}
            historical={historicalReplay}
            onRevealChange={(complete) => revealState(replayKey, complete)}
            title={`${election.date.slice(0, 4)} Provincial Assembly Elections`}
            subtitle="Certified provincial party votes and seat allocations appear province by province."
            events={nightEvents}
            unitLabel="provincial results shown"
            renderVisual={(visibleCount) => {
              const visible = resolvedCycle.slice(0, visibleCount);
              const visibleByProvince = new Map(visible.map((race) => [race.provinceId, race]));
              const seatTotals = new Map<string | null, number>();
              for (const race of visible)
                for (const [partyId, seats] of Object.entries(race.partySeats))
                  seatTotals.set(partyId, (seatTotals.get(partyId) ?? 0) + seats);
              return (
                <div className="provincial-assembly-night-stage">
                  <TerenaMap
                    bundle={props.bundle}
                    mode="election"
                    showConstituencies={false}
                    fillFor={(feature, kind) =>
                      kind !== "province"
                        ? "transparent"
                        : visibleByProvince.has(feature.id)
                          ? partyColor(
                              props.world,
                              pluralityParty(visibleByProvince.get(feature.id)!),
                            )
                          : "#d9d6cf"
                    }
                    tooltipFor={(picked) => {
                      const race = visibleByProvince.get(picked.id);
                      return (
                        <>
                          <strong>{picked.name}</strong>
                          <span>
                            {race
                              ? `${partyDisplayName(props.world, pluralityParty(race), props.snap)} largest bloc`
                              : "Result not yet shown"}
                          </span>
                        </>
                      );
                    }}
                  />
                  <div className="provincial-night-seat-rail">
                    {[...seatTotals.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([partyId, seats]) => (
                        <div key={partyId ?? "independent"}>
                          <span
                            className="party-swatch"
                            style={{ background: partyColor(props.world, partyId) }}
                          />
                          <strong>{partyDisplayName(props.world, partyId, props.snap)}</strong>
                          <b>{seats}</b>
                          <small>seats shown</small>
                        </div>
                      ))}
                  </div>
                </div>
              );
            }}
          />
        ) : null}
        <div
          className="certified-result-gate"
          hidden={election.status === "resolved" && !finalVisible}
        >
          <label className="election-cycle-picker">
            Province
            <select
              value={election.id}
              onChange={(event) => setProvincialAssemblyElectionId(event.target.value)}
            >
              {provincialAssembly.map((race) => (
                <option key={race.id} value={race.id}>
                  {props.catalog.places.get(race.provinceId)?.name ?? "Province"} ·{" "}
                  {race.date.slice(0, 4)} · {statusLabel(race.status)}
                </option>
              ))}
            </select>
          </label>
          <MapDetailLayout
            className="provincial-election-layout"
            detailVisible
            map={
              <>
                <SectionDivider
                  title="Provincial Assembly map"
                  hint={`${election.date.slice(0, 4)} cycle`}
                />
                <TerenaMap
                  bundle={props.bundle}
                  mode="election"
                  selectedId={election.provinceId}
                  showConstituencies={false}
                  fillFor={(feature, kind) => {
                    if (kind !== "province") return "transparent";
                    const race = sameCycle.find((candidate) => candidate.provinceId === feature.id);
                    return race?.status === "resolved"
                      ? partyColor(props.world, pluralityParty(race))
                      : "#d8d6cf";
                  }}
                  onSelect={(selected) => {
                    if (selected.kind !== "province") return;
                    const race = sameCycle.find(
                      (candidate) => candidate.provinceId === selected.id,
                    );
                    if (race) setProvincialAssemblyElectionId(race.id);
                  }}
                  tooltipFor={(selected) => {
                    const race = sameCycle.find(
                      (candidate) => candidate.provinceId === selected.id,
                    );
                    const partyId = race ? pluralityParty(race) : null;
                    return (
                      <>
                        <strong>{selected.name}</strong>
                        <span>
                          {race?.status === "resolved" && partyId
                            ? `${partyDisplayName(props.world, partyId, props.snap)} holds the largest bloc`
                            : race
                              ? statusLabel(race.status)
                              : "No race in this cycle"}
                        </span>
                      </>
                    );
                  }}
                />
                <p className="muted">
                  Certified provinces are colored by the party holding the largest Assembly bloc,
                  not by a fictional single winner.
                </p>
              </>
            }
            detail={
              <>
                <SectionDivider
                  title={`${props.catalog.places.get(election.provinceId)?.name ?? "Province"} Assembly`}
                  hint={`${election.date} · ${props.snap.provincialRuntime.assemblies[election.provinceId]?.seatCount ?? election.electedIds.length} seats`}
                  actions={
                    <StatusBadge tone={statusTone(election.status)}>
                      {statusLabel(election.status)}
                    </StatusBadge>
                  }
                />
                {election.turnoutRate != null ? (
                  <p className="muted">Turnout {formatPublicPercent(election.turnoutRate)}</p>
                ) : null}
                {partyRows.length ? (
                  <DataTable headers={["Party", "Vote", "Seats"]} dense>
                    {partyRows.map((row) => (
                      <tr key={row.partyId}>
                        <td>
                          <span
                            className="party-swatch"
                            style={{ background: partyColor(props.world, row.partyId) }}
                            aria-hidden
                          />{" "}
                          {partyDisplayName(props.world, row.partyId, props.snap)}
                        </td>
                        <td>{row.voteShare == null ? "—" : formatPublicPercent(row.voteShare)}</td>
                        <td>{row.seats}</td>
                      </tr>
                    ))}
                  </DataTable>
                ) : (
                  <EmptyState>The provincial party field has not been finalized.</EmptyState>
                )}
                {election.electedIds.length ? (
                  <details className="elected-slate">
                    <summary>View elected members ({election.electedIds.length})</summary>
                    <div className="compact-result-list">
                      {election.electedIds.map((id) => (
                        <EntityRow
                          key={id}
                          title={politicianDisplayName(props.catalog, id)}
                          meta={partyDisplayName(
                            props.world,
                            Object.entries(election.personalRankingsByParty).find(
                              ([, candidateIds]) => candidateIds.includes(id),
                            )?.[0] ?? null,
                            props.snap,
                          )}
                          status={<StatusBadge tone="ok">Elected</StatusBadge>}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            }
          />
        </div>
      </div>
    );
  }

  function internalElectionView() {
    const selectedPartyId = internalSelection.startsWith("party:")
      ? internalSelection.slice(6)
      : null;
    const selectedCaucusId = internalSelection.startsWith("caucus:")
      ? internalSelection.slice(7)
      : null;
    const partyContest =
      internalPartyContests.find((contest) => contest.id === selectedPartyId) ?? null;
    const caucusContest =
      internalCaucusContests.find((contest) => contest.id === selectedCaucusId) ?? null;
    const provincialLeadership = Object.values(props.snap.provincialRuntime.assemblies)
      .flatMap((assemblyState) => assemblyState.leadershipHistory)
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .slice(0, 30);
    const caucusTallies = caucusContest
      ? Object.values(caucusContest.votes).reduce<Record<string, number>>((totals, candidateId) => {
          totals[candidateId] = (totals[candidateId] ?? 0) + 1;
          return totals;
        }, {})
      : {};

    return (
      <div className="internal-election-view">
        <div className="internal-election-picker">
          <label>
            Contest
            <select
              value={internalSelection}
              onChange={(event) => setInternalSelection(event.target.value)}
            >
              <optgroup label="Party and nomination contests">
                {internalPartyContests.map((contest) => (
                  <option key={contest.id} value={`party:${contest.id}`}>
                    {contestDisplayName(props.snap, props.world, contest.id)} ·{" "}
                    {statusLabel(contest.status)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Assembly Delegation elections">
                {internalCaucusContests.map((contest) => (
                  <option key={contest.id} value={`caucus:${contest.id}`}>
                    {partyDisplayName(props.world, contest.partyId, props.snap)}{" "}
                    {contest.role.replace(/_/g, " ")} · {statusLabel(contest.status)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
        {partyContest ? (
          <SectionCard title={contestDisplayName(props.snap, props.world, partyContest.id)}>
            {(() => {
              const isNomination = partyContest.type === "presidential_nomination";
              const primaryEntries = Object.values(partyContest.entries).filter(
                (entry) => entry.status !== "potential",
              );
              const nominationPoll = isNomination
                ? latestPublicPoll(props.snap, { contestId: partyContest.id })
                : null;
              const rounds = partyContest.countArchive?.rounds ?? [];
              const nightEvents: ElectionNightEvent[] = rounds.map((round, index) => ({
                id: `${partyContest.id}:round:${round.round ?? index + 1}`,
                title: round.electedId
                  ? `${politicianDisplayName(props.catalog, round.electedId)} nominated`
                  : round.eliminatedId
                    ? `${politicianDisplayName(props.catalog, round.eliminatedId)} eliminated`
                    : `Round ${round.round ?? index + 1} completed`,
                detail: "Party nomination count — same-party field only",
                pauseAfter: Boolean(round.electedId),
              }));
              const replayKey = `nomination:${partyContest.id}`;
              const resolveDate =
                partyContest.resolvedDate ??
                (typeof partyContest.metadata.electionDate === "string"
                  ? nominationCalendarDates(partyContest.metadata.electionDate).resolve
                  : props.snap.currentDate);
              const historicalReplay = !isFreshElectionNight(resolveDate);
              const finalVisible = electionNightFinalVisible({
                status: partyContest.status === "resolved" ? "resolved" : partyContest.status,
                eventCount: nightEvents.length,
                historical: historicalReplay,
                revealed: revealedNight[replayKey] === true,
              });
              return (
                <>
                  {partyContest.status === "resolved" ? (
                    <ElectionNightPanel
                      phase="certified"
                      title={
                        partyContest.winnerId
                          ? `${politicianDisplayName(props.catalog, partyContest.winnerId)} wins${isNomination ? " the nomination" : ""}`
                          : "Internal result certified"
                      }
                      detail={
                        isNomination
                          ? `${partyDisplayName(props.world, partyContest.partyId, props.snap)} primary field only — not the general election.`
                          : "The result is drawn from the recorded selector count."
                      }
                      outcome={
                        partyContest.entries[props.snap.playerPoliticianId]
                          ? partyContest.winnerId === props.snap.playerPoliticianId
                            ? "You won."
                            : "You were not elected."
                          : null
                      }
                    />
                  ) : null}
                  {isNomination &&
                  partyContest.status === "resolved" &&
                  rounds.length > 0 &&
                  finalVisible ? (
                    <ElectionNightReplay
                      replayKey={replayKey}
                      title={`${partyDisplayName(props.world, partyContest.partyId, props.snap)} nomination night`}
                      subtitle="Primary candidates only. Opposing general-election parties are not shown."
                      events={nightEvents}
                      unitLabel="Count rounds shown"
                      historical={historicalReplay}
                      onRevealChange={(complete) => revealState(replayKey, complete)}
                      renderVisual={(visibleCount) => (
                        <PresidentialNightVisual
                          replayKey={replayKey}
                          visibleCount={visibleCount}
                          rounds={rounds}
                          firstPreferences={
                            partyContest.countArchive?.firstPreferences ??
                            Object.fromEntries(primaryEntries.map((e) => [e.politicianId, "0"]))
                          }
                          exhaustedFinal={voteWeight(partyContest.countArchive?.exhausted)}
                          candidates={primaryEntries.map((entry) => ({
                            politicianId: entry.politicianId,
                            partyId: partyContest.partyId,
                          }))}
                          winnerId={partyContest.winnerId}
                          world={props.world}
                          catalog={props.catalog}
                        />
                      )}
                    />
                  ) : null}
                  <SectionDivider
                    title={isNomination ? "Primary field" : "Field"}
                    hint={`${partyDisplayName(props.world, partyContest.partyId, props.snap)} · ${statusLabel(partyContest.status)}`}
                  />
                  {isNomination && nominationPoll ? (
                    <p className="muted">
                      Nomination poll {nominationPoll.publicationDate}:{" "}
                      {pollShareLine(
                        props.catalog,
                        props.world,
                        props.snap,
                        nominationPoll.firstPreference,
                      )}
                    </p>
                  ) : null}
                  {primaryEntries
                    .slice()
                    .sort(
                      (a, b) =>
                        Number(b.politicianId === partyContest.winnerId) -
                          Number(a.politicianId === partyContest.winnerId) ||
                        a.politicianId.localeCompare(b.politicianId),
                    )
                    .map((entry) => (
                      <EntityRow
                        key={entry.politicianId}
                        title={politicianDisplayName(props.catalog, entry.politicianId)}
                        meta={
                          isNomination
                            ? `${statusLabel(entry.status)} · same party`
                            : statusLabel(entry.status)
                        }
                        status={
                          partyContest.winnerId === entry.politicianId ? (
                            <StatusBadge tone="ok">
                              {isNomination ? "Nominee" : "Winner"}
                            </StatusBadge>
                          ) : (
                            <StatusBadge>{statusLabel(entry.status)}</StatusBadge>
                          )
                        }
                        selected={partyContest.winnerId === entry.politicianId}
                      />
                    ))}
                  {partyContest.countArchive?.rounds.length ? (
                    <>
                      <SectionDivider
                        title="Ranked-choice count"
                        hint="Recorded elimination sequence"
                      />
                      <DataTable headers={["Round", "Outcome"]} dense>
                        {partyContest.countArchive.rounds.map((round, index) => (
                          <tr key={index}>
                            <td>{round.round}</td>
                            <td>
                              {round.eliminatedId
                                ? `Excluded ${politicianDisplayName(props.catalog, round.eliminatedId)}`
                                : round.electedId
                                  ? `Elected ${politicianDisplayName(props.catalog, round.electedId)}`
                                  : "Count complete"}
                            </td>
                          </tr>
                        ))}
                      </DataTable>
                    </>
                  ) : null}
                </>
              );
            })()}
          </SectionCard>
        ) : caucusContest ? (
          <SectionCard
            title={`${partyDisplayName(props.world, caucusContest.partyId, props.snap)} ${caucusContest.role.replace(/_/g, " ")} election`}
          >
            {caucusContest.status === "resolved" ? (
              <ElectionNightPanel
                phase="certified"
                title={
                  caucusContest.winnerId
                    ? `${politicianDisplayName(props.catalog, caucusContest.winnerId)} elected`
                    : "Assembly Delegation result certified"
                }
                detail="Party Assembly members' recorded ballots determine this delegation office. Ideological caucuses are separate party organizations."
                outcome={
                  caucusContest.candidateIds.includes(props.snap.playerPoliticianId)
                    ? caucusContest.winnerId === props.snap.playerPoliticianId
                      ? "You won."
                      : "You were not elected."
                    : null
                }
              />
            ) : null}
            <SectionDivider
              title="Candidates"
              hint={`${caucusContest.closeDate} · ${statusLabel(caucusContest.status)}`}
            />
            {caucusContest.candidateIds.map((candidateId) => (
              <EntityRow
                key={candidateId}
                title={politicianDisplayName(props.catalog, candidateId)}
                meta={(caucusContest.platforms[candidateId] ?? "No platform published").replace(
                  /_/g,
                  " ",
                )}
                trailing={
                  caucusContest.status === "resolved"
                    ? `${caucusTallies[candidateId] ?? 0} votes`
                    : null
                }
                status={
                  caucusContest.winnerId === candidateId ? (
                    <StatusBadge tone="ok">Winner</StatusBadge>
                  ) : (
                    <StatusBadge>
                      {caucusContest.status === "resolved" ? "Not elected" : "Declared"}
                    </StatusBadge>
                  )
                }
              />
            ))}
          </SectionCard>
        ) : (
          <EmptyState>No internal election has been recorded.</EmptyState>
        )}
        <SectionDivider
          title="Recent provincial leadership elections"
          hint="Speaker, floor leader, and whip"
        />
        <DataTable headers={["Date", "Province", "Office", "Winner", "Trigger"]} dense>
          {provincialLeadership.map((record) => (
            <tr key={record.id}>
              <td>{record.date}</td>
              <td>{props.catalog.places.get(record.provinceId)?.name ?? "Province"}</td>
              <td>{record.role.replace(/_/g, " ")}</td>
              <td>
                {record.winnerId
                  ? politicianDisplayName(props.catalog, record.winnerId)
                  : "No winner"}
              </td>
              <td>{record.trigger.replace(/_/g, " ")}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    );
  }

  return (
    <div className="page-tone-election elections-hub-v7">
      <PageHeader
        kicker="Returns desk"
        title="Elections"
        subtitle="Upcoming cycles, live counting, and certified public results — presented as political events, not a database table."
      />
      <TabBar
        tabs={[
          { id: "presidential", label: "Presidential" },
          { id: "assembly", label: "National Assembly" },
          { id: "provincial_assembly", label: "Provincial Assemblies" },
          { id: "gubernatorial", label: "Governors" },
          { id: "internal", label: "Internal Elections" },
          { id: "calendar", label: "Political Calendar" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "presidential" ? (
        <div>
          {(() => {
            const headerPoll =
              presidential[0] != null
                ? latestPublicPoll(props.snap, { electionId: presidential[0].id })
                : latestPublicPoll(props.snap);
            return headerPoll ? (
              <p className="muted">
                Latest national poll {headerPoll.publicationDate}:{" "}
                {pollShareLine(props.catalog, props.world, props.snap, headerPoll.firstPreference)}
              </p>
            ) : (
              <EmptyState>No current national presidential poll has been published.</EmptyState>
            );
          })()}
          {presidential.length === 0 ? (
            <EmptyState>No presidential election is scheduled.</EmptyState>
          ) : null}
          {presidential.map(presidentialView)}
        </div>
      ) : null}
      {tab === "assembly" ? (
        <div>
          {assembly.length > 1 ? (
            <label className="election-cycle-picker">
              Election cycle
              <select
                value={selectedAssembly?.id ?? ""}
                onChange={(e) => setAssemblyId(e.target.value)}
              >
                {assembly.map((election) => (
                  <option key={election.id} value={election.id}>
                    {election.date.slice(0, 4)} · {statusLabel(election.status)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedAssembly ? (
            assemblyView(selectedAssembly)
          ) : (
            <EmptyState>No Assembly election is scheduled.</EmptyState>
          )}
        </div>
      ) : null}
      {tab === "provincial_assembly" ? (
        selectedProvincialAssembly ? (
          provincialAssemblyView(selectedProvincialAssembly)
        ) : (
          <EmptyState>No Provincial Assembly election is scheduled.</EmptyState>
        )
      ) : null}
      {tab === "gubernatorial" ? (
        <div className="governor-election-view">
          {selectedGovernorRace ? (
            <>
              {(selectedGovernorRace.status === "resolved" ||
                selectedGovernorRace.status === "assumed") &&
              governorFinalVisible ? (
                <ElectionNightPanel
                  phase="certified"
                  title={
                    selectedGovernorRace.winnerId
                      ? `${politicianDisplayName(props.catalog, selectedGovernorRace.winnerId)} elected Governor`
                      : "Gubernatorial result certified"
                  }
                  detail={`Certified province-wide result for ${props.catalog.places.get(selectedGovernorRace.provinceId)?.name ?? "the province"}. ${certificationSummary(selectedGovernorRace.certification)}`}
                  outcome={
                    selectedGovernorRace.candidates[props.snap.playerPoliticianId]
                      ? selectedGovernorRace.winnerId === props.snap.playerPoliticianId
                        ? "You won the governorship."
                        : "Your campaign was defeated."
                      : null
                  }
                />
              ) : selectedGovernorRace.date <= props.snap.currentDate ? (
                <ElectionNightPanel
                  phase="ready"
                  title="Polls closed in the province"
                  detail="The official result will appear when the provincial count is completed."
                />
              ) : null}
              {selectedGovernorRace.status === "resolved" ||
              selectedGovernorRace.status === "assumed"
                ? (() => {
                    const sameCycle = provinceReportingOrder(
                      governorReplayKey,
                      gubernatorial.filter(
                        (race) =>
                          race.date === selectedGovernorRace.date &&
                          (race.status === "resolved" || race.status === "assumed") &&
                          race.winnerId,
                      ),
                    );
                    const events: ElectionNightEvent[] = sameCycle.map((race) => {
                      const winner = race.winnerId!;
                      const winnerParty =
                        race.candidates[winner]?.partyId ??
                        props.snap.politicians[winner]?.partyId ??
                        null;
                      const incumbentParty = race.incumbentId
                        ? (race.candidates[race.incumbentId]?.partyId ??
                          props.snap.politicians[race.incumbentId]?.partyId ??
                          null)
                        : null;
                      const change = !race.incumbentId
                        ? "Open province"
                        : incumbentParty === winnerParty
                          ? "Hold"
                          : "Gain";
                      return {
                        id: race.id,
                        title: props.catalog.places.get(race.provinceId)?.name ?? race.provinceId,
                        detail: `${politicianDisplayName(props.catalog, winner)} · ${partyDisplayName(props.world, winnerParty, props.snap)} ${change.toLowerCase()}`,
                        ...(race.provinceId === selectedGovernorRace.provinceId ||
                        race.candidates[props.snap.playerPoliticianId]
                          ? { pauseAfter: true }
                          : {}),
                      };
                    });
                    return (
                      <ElectionNightReplay
                        replayKey={governorReplayKey}
                        historical={governorHistoricalReplay}
                        onRevealChange={(complete) => revealState(governorReplayKey, complete)}
                        title={`${selectedGovernorRace.date.slice(0, 4)} Governor Elections`}
                        subtitle="Province-wide certified winners appear across the twenty-one-province map."
                        events={events}
                        unitLabel="province results shown"
                        renderVisual={(visibleCount) => {
                          const visible = sameCycle.slice(0, visibleCount);
                          const visibleByProvince = new Map(
                            visible.map((race) => [race.provinceId, race]),
                          );
                          const partyTotals = new Map<string | null, number>();
                          for (const race of visible) {
                            const winnerId = race.winnerId!;
                            const partyId =
                              race.candidates[winnerId]?.partyId ??
                              props.snap.politicians[winnerId]?.partyId ??
                              null;
                            partyTotals.set(partyId, (partyTotals.get(partyId) ?? 0) + 1);
                          }
                          return (
                            <div className="governor-night-stage">
                              <TerenaMap
                                bundle={props.bundle}
                                mode="election"
                                showConstituencies={false}
                                fillFor={(feature, kind) => {
                                  if (kind !== "province") return "transparent";
                                  const race = visibleByProvince.get(feature.id);
                                  if (!race?.winnerId) return "#d9d6cf";
                                  return partyColor(
                                    props.world,
                                    race.candidates[race.winnerId]?.partyId ??
                                      props.snap.politicians[race.winnerId]?.partyId ??
                                      null,
                                  );
                                }}
                                tooltipFor={(picked) => {
                                  const race = visibleByProvince.get(picked.id);
                                  return (
                                    <>
                                      <strong>{picked.name}</strong>
                                      <span>
                                        {race?.winnerId
                                          ? `Winner ${politicianDisplayName(props.catalog, race.winnerId)}`
                                          : "Result not yet shown"}
                                      </span>
                                    </>
                                  );
                                }}
                              />
                              <div className="governor-night-totals">
                                {[...partyTotals.entries()]
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([partyId, wins]) => (
                                    <div key={partyId ?? "independent"}>
                                      <span
                                        className="party-swatch"
                                        style={{ background: partyColor(props.world, partyId) }}
                                      />
                                      <strong>
                                        {partyDisplayName(props.world, partyId, props.snap)}
                                      </strong>
                                      <b>{wins}</b>
                                      <small>governor{wins === 1 ? "" : "s"}</small>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                    );
                  })()
                : null}
              <div
                className="certified-result-gate"
                hidden={
                  (selectedGovernorRace.status === "resolved" ||
                    selectedGovernorRace.status === "assumed") &&
                  !governorFinalVisible
                }
              >
                <label className="election-cycle-picker">
                  Province
                  <select
                    value={selectedGovernorRace.id}
                    onChange={(event) => setGovernorElectionId(event.target.value)}
                  >
                    {gubernatorial.map((race) => (
                      <option key={race.id} value={race.id}>
                        {props.catalog.places.get(race.provinceId)?.name ?? race.provinceId} ·{" "}
                        {race.date.slice(0, 4)} · {statusLabel(race.status)}
                      </option>
                    ))}
                  </select>
                </label>
                <MapDetailLayout
                  detailVisible
                  map={
                    <>
                      <SectionDivider title="Provincial election map" />
                      <TerenaMap
                        bundle={props.bundle}
                        mode="election"
                        selectedId={selectedGovernorRace.provinceId}
                        showConstituencies={false}
                        fillFor={(feature, kind) =>
                          mapFillFor(
                            "election",
                            props.world,
                            props.snap,
                            feature,
                            kind,
                            undefined,
                            undefined,
                            selectedGovernorRace.id,
                          )
                        }
                        onSelect={(selected) => {
                          if (selected.kind !== "province") return;
                          const race = gubernatorial.find(
                            (candidate) =>
                              candidate.provinceId === selected.id &&
                              candidate.date.slice(0, 4) === selectedGovernorRace.date.slice(0, 4),
                          );
                          if (race) setGovernorElectionId(race.id);
                        }}
                        tooltipFor={(selected) => {
                          const race = gubernatorial.find(
                            (candidate) =>
                              candidate.provinceId === selected.id &&
                              candidate.date.slice(0, 4) === selectedGovernorRace.date.slice(0, 4),
                          );
                          return (
                            <>
                              <strong>{selected.name}</strong>
                              <span>
                                {race?.winnerId
                                  ? `Winner ${politicianDisplayName(props.catalog, race.winnerId)}`
                                  : race
                                    ? `${statusLabel(race.status)} · ${Object.keys(race.candidates).length} candidates`
                                    : "No race in this cycle"}
                              </span>
                            </>
                          );
                        }}
                      />
                      <p className="muted">
                        Province-wide certified winners are colored by party. Unresolved races
                        remain neutral.
                      </p>
                    </>
                  }
                  detail={
                    <>
                      <SectionDivider
                        title={`${props.catalog.places.get(selectedGovernorRace.provinceId)?.name ?? selectedGovernorRace.provinceId} governor`}
                        hint={selectedGovernorRace.date}
                        actions={
                          <StatusBadge tone={statusTone(selectedGovernorRace.status)}>
                            {statusLabel(selectedGovernorRace.status)}
                          </StatusBadge>
                        }
                      />
                      {selectedGovernorRace.turnoutRate != null ? (
                        <p className="muted">
                          Turnout {formatPublicPercent(selectedGovernorRace.turnoutRate)}
                        </p>
                      ) : null}
                      <DataTable headers={["Candidate", "Party", "Share", "Status"]} dense>
                        {Object.values(selectedGovernorRace.candidates)
                          .filter((candidate) => !candidate.withdrawn)
                          .sort(
                            (a, b) =>
                              (selectedGovernorRace.voteShares[b.politicianId] ?? 0) -
                              (selectedGovernorRace.voteShares[a.politicianId] ?? 0),
                          )
                          .map((candidate) => {
                            const isWinner =
                              selectedGovernorRace.winnerId === candidate.politicianId;
                            const status = isWinner
                              ? "Winner"
                              : selectedGovernorRace.status === "resolved" ||
                                  selectedGovernorRace.status === "assumed"
                                ? "Not elected"
                                : candidate.incumbent
                                  ? "Incumbent"
                                  : "Filed";
                            return (
                              <tr key={candidate.politicianId}>
                                <td>
                                  {politicianDisplayName(props.catalog, candidate.politicianId)}
                                </td>
                                <td>
                                  {partyDisplayName(props.world, candidate.partyId, props.snap)}
                                </td>
                                <td>
                                  {selectedGovernorRace.voteShares[candidate.politicianId] != null
                                    ? formatPublicPercent(
                                        selectedGovernorRace.voteShares[candidate.politicianId],
                                      )
                                    : "—"}
                                </td>
                                <td>
                                  <StatusBadge tone={isWinner ? "ok" : "idle"}>
                                    {status}
                                  </StatusBadge>
                                </td>
                              </tr>
                            );
                          })}
                      </DataTable>
                      {Object.keys(selectedGovernorRace.candidates).length === 0 ? (
                        <EmptyState>The candidate field will form when filing opens.</EmptyState>
                      ) : null}
                    </>
                  }
                />
              </div>
            </>
          ) : (
            <EmptyState>No gubernatorial election is scheduled.</EmptyState>
          )}
        </div>
      ) : null}
      {tab === "internal" ? internalElectionView() : null}
      {tab === "calendar" ? (
        <div className="political-calendar">
          {calendarEvents.length === 0 ? (
            <EmptyState>No political dates are scheduled.</EmptyState>
          ) : null}
          {[...new Set(calendarEvents.map((event) => event.date.slice(0, 4)))].map((year) => (
            <section key={year} className="calendar-year">
              <h2>{year}</h2>
              <div className="calendar-events">
                {calendarEvents
                  .filter((event) => event.date.startsWith(year))
                  .map((event, index) => (
                    <EntityRow
                      key={`${event.date}:${event.title}:${index}`}
                      title={event.title}
                      meta={event.date}
                      status={<StatusBadge>{event.detail}</StatusBadge>}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
