import type { CampaignState, KernelWorld, PollRecord, SimState } from "@lorsain/sim";
import { daysBetween } from "@lorsain/sim";
import { nationalPublicEconomy, regionalPublicEconomy } from "../presentation/economy.js";
import { constituencySittingSeatBreakdown } from "./fills.js";

export type CampaignMapLayer = "forecast" | "polling" | "ground_game" | "previous";

export type PublicGeographicDatum = {
  truth: "poll" | "forecast" | "campaign" | "certified" | "historical" | "no_data";
  leaderPartyId: string | null;
  label: string;
  detail: string;
  asOf: string | null;
  /** Polling uses `direct`; Forecast uses high/medium/low; absence is `none`. */
  confidence: "direct" | "high" | "medium" | "low" | "none";
  category?: "Toss-up" | "Lean" | "Likely" | "Safe";
  projectedSeats?: Array<{ partyId: string | null; seats: number }>;
};

type PartyShare = Map<string | null, number>;

function forecastCategory(margin: number): NonNullable<PublicGeographicDatum["category"]> {
  return margin < 0.025 ? "Toss-up" : margin < 0.07 ? "Lean" : margin < 0.14 ? "Likely" : "Safe";
}

function projectSeats(
  rows: Array<[string | null, number]>,
  seats: number,
): Array<{ partyId: string | null; seats: number }> {
  if (seats <= 0 || rows.length === 0) return [];
  const total = rows.reduce((sum, [, share]) => sum + Math.max(0, share), 0) || 1;
  const allocations = rows.map(([partyId, share]) => {
    const exact = (Math.max(0, share) / total) * seats;
    return { partyId, seats: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = seats - allocations.reduce((sum, row) => sum + row.seats, 0);
  for (const row of allocations
    .slice()
    .sort(
      (a, b) => b.remainder - a.remainder || String(a.partyId).localeCompare(String(b.partyId)),
    )) {
    if (remaining-- <= 0) break;
    row.seats += 1;
  }
  return allocations
    .map(({ partyId, seats: projected }) => ({ partyId, seats: projected }))
    .filter((row) => row.seats > 0)
    .sort((a, b) => b.seats - a.seats || String(a.partyId).localeCompare(String(b.partyId)));
}

function pollElectionId(poll: PollRecord): string | null {
  return (
    poll.electionId ??
    (typeof poll.metadata.electionId === "string" ? poll.metadata.electionId : null)
  );
}

export function latestGeographicPoll(
  state: SimState,
  electionId: string | null,
  kind: "province" | "constituency",
  geographyId: string,
): PollRecord | null {
  return (
    Object.values(state.polls)
      .filter((poll) => {
        if (electionId && pollElectionId(poll) !== electionId) return false;
        return kind === "province"
          ? poll.geographyKind === "province" && poll.provinceId === geographyId
          : poll.geographyKind === "constituency" && poll.constituencyId === geographyId;
      })
      .sort(
        (a, b) => b.publicationDate.localeCompare(a.publicationDate) || b.id.localeCompare(a.id),
      )[0] ?? null
  );
}

function latestNationalPoll(state: SimState, electionId: string | null): PollRecord | null {
  return (
    Object.values(state.polls)
      .filter((poll) => {
        if (poll.geographyKind !== "national") return false;
        if (electionId && pollElectionId(poll) !== electionId) return false;
        return true;
      })
      .sort(
        (a, b) => b.publicationDate.localeCompare(a.publicationDate) || b.id.localeCompare(a.id),
      )[0] ?? null
  );
}

function pollShares(poll: PollRecord): PartyShare {
  const byParty: PartyShare = new Map();
  for (const row of poll.firstPreference) {
    byParty.set(row.partyId, (byParty.get(row.partyId) ?? 0) + row.share);
  }
  return byParty;
}

function rankedShares(byParty: PartyShare): Array<[string | null, number]> {
  return [...byParty.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
  );
}

function normalizeShares(byParty: PartyShare): PartyShare {
  const total = [...byParty.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return new Map();
  const out: PartyShare = new Map();
  for (const [partyId, value] of byParty) out.set(partyId, Math.max(0, value) / total);
  return out;
}

function addWeightedShares(target: PartyShare, source: PartyShare, weight: number): void {
  if (weight <= 0) return;
  const normalized = normalizeShares(source);
  for (const [partyId, share] of normalized) {
    target.set(partyId, (target.get(partyId) ?? 0) + share * weight);
  }
}

function addPartyWeight(target: PartyShare, partyId: string | null, weight: number): void {
  if (weight === 0) return;
  target.set(partyId, (target.get(partyId) ?? 0) + weight);
}

/** Days-since-publication weight: fresh polls dominate; stale polls remain informative but weaker. */
function pollFreshnessWeight(publicationDate: string, asOf: string): number {
  const age = Math.max(0, daysBetween(publicationDate, asOf));
  if (age <= 21) return 1;
  if (age <= 45) return 0.85;
  if (age <= 90) return 0.6;
  if (age <= 150) return 0.4;
  return 0.22;
}

function pollDatum(poll: PollRecord): PublicGeographicDatum {
  const ranked = rankedShares(pollShares(poll));
  const margin = (ranked[0]?.[1] ?? 0) - (ranked[1]?.[1] ?? 0);
  const tooClose = ranked.length > 1 && margin <= poll.marginOfError * 1.15;
  return {
    truth: "poll",
    leaderPartyId: tooClose ? null : (ranked[0]?.[0] ?? null),
    label: tooClose ? "No clear polling leader" : "Polling leader",
    detail: `Direct ${poll.method.replaceAll("_", " ")} sample · n=${poll.sampleSize.toLocaleString()} · margin of error ±${Math.round(poll.marginOfError * 1000) / 10}%`,
    asOf: poll.publicationDate,
    confidence: "direct",
    category: forecastCategory(margin),
  };
}

function largestParty(rows: Array<{ partyId: string | null; seats: number }>): string | null {
  if (!rows.length) return null;
  if (rows.length > 1 && rows[0]!.seats === rows[1]!.seats) return null;
  return rows[0]!.partyId;
}

function seatsToShares(rows: Array<{ partyId: string | null; seats: number }>): PartyShare {
  const shares: PartyShare = new Map();
  for (const row of rows) addPartyWeight(shares, row.partyId, row.seats);
  return shares;
}

function provinceSittingDelegation(world: KernelWorld, state: SimState, provinceId: string) {
  const totals = new Map<string | null, number>();
  for (const constituencyId of Object.keys(world.constituencyElectorate)) {
    const share =
      world.constituencyElectorate[constituencyId]?.provincePopulationShares.find(
        (row) => row.provinceId === provinceId,
      )?.share ?? 0;
    if (share <= 0) continue;
    for (const row of constituencySittingSeatBreakdown(world, state, constituencyId)) {
      totals.set(row.partyId, (totals.get(row.partyId) ?? 0) + row.seats * share);
    }
  }
  return [...totals.entries()]
    .map(([partyId, seats]) => ({ partyId, seats }))
    .sort((a, b) => b.seats - a.seats || String(a.partyId).localeCompare(String(b.partyId)));
}

function latestResolvedAssemblyBefore(state: SimState, date: string) {
  return (
    Object.values(state.elections)
      .filter(
        (election) =>
          election.type === "assembly" &&
          election.status === "resolved" &&
          election.date < date &&
          election.assembly,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0] ?? null
  );
}

export function previousPublicResult(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
  kind: "province" | "constituency",
  geographyId: string,
): PublicGeographicDatum {
  const targetDate = campaign.electionId
    ? (state.elections[campaign.electionId]?.date ??
      state.provincialRuntime.elections[campaign.electionId]?.date ??
      state.provincialRuntime.assemblyElections[campaign.electionId]?.date ??
      state.currentDate)
    : state.currentDate;
  if (kind === "constituency") {
    const previousElection = latestResolvedAssemblyBefore(state, targetDate);
    const previous = previousElection?.assembly?.constituencyResults[geographyId];
    if (previous) {
      const totals = new Map<string | null, number>();
      for (const electedId of previous.electedIds) {
        const partyId = previous.partyByCandidate[electedId] ?? null;
        totals.set(partyId, (totals.get(partyId) ?? 0) + 1);
      }
      const rows = [...totals.entries()]
        .map(([partyId, seats]) => ({ partyId, seats }))
        .sort((a, b) => b.seats - a.seats || String(a.partyId).localeCompare(String(b.partyId)));
      return {
        truth: "historical",
        leaderPartyId: largestParty(rows),
        label: "Previous certified result",
        detail: `${previous.electedIds.length} seats in the previous Assembly election`,
        asOf: previousElection?.date ?? null,
        confidence: "direct",
        projectedSeats: rows,
      };
    }
  } else if (campaign.type === "gubernatorial") {
    const previous = Object.values(state.provincialRuntime.elections)
      .filter(
        (race) =>
          race.provinceId === geographyId &&
          race.status !== "planned" &&
          race.winnerId &&
          race.date < targetDate,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (previous?.winnerId) {
      return {
        truth: "historical",
        leaderPartyId: previous.candidates[previous.winnerId]?.partyId ?? null,
        label: "Previous certified governor result",
        detail: "Province-wide winner from the previous recorded contest",
        asOf: previous.date,
        confidence: "direct",
      };
    }
  } else if (campaign.type === "provincial_assembly") {
    const previous = Object.values(state.provincialRuntime.assemblyElections)
      .filter(
        (race) =>
          race.provinceId === geographyId && race.status === "resolved" && race.date < targetDate,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (previous) {
      const rows = Object.entries(previous.partySeats)
        .map(([partyId, seats]) => ({ partyId, seats }))
        .sort((a, b) => b.seats - a.seats || a.partyId.localeCompare(b.partyId));
      return {
        truth: "historical",
        leaderPartyId: largestParty(rows),
        label: "Previous certified Assembly result",
        detail: `${previous.electedIds.length} provincial seats`,
        asOf: previous.date,
        confidence: "direct",
        projectedSeats: rows,
      };
    }
  }
  return {
    truth: "no_data",
    leaderPartyId: null,
    label: "No comparable previous result",
    detail: "No legitimate geographic result is archived for this race type.",
    asOf: null,
    confidence: "none",
  };
}

function campaignPartyId(state: SimState, campaign: CampaignState): string | null {
  return state.politicians[campaign.politicianId]?.partyId ?? null;
}

function incumbentPartyId(
  world: KernelWorld,
  state: SimState,
  kind: "province" | "constituency",
  geographyId: string,
): string | null {
  if (kind === "constituency") {
    return largestParty(constituencySittingSeatBreakdown(world, state, geographyId));
  }
  return largestParty(provinceSittingDelegation(world, state, geographyId));
}

/** Public economic climate score in roughly −1..+1 from published briefing metrics only. */
function publicEconomyClimate(
  state: SimState,
  kind: "province" | "constituency",
  geographyId: string,
  world: KernelWorld,
): number | null {
  const national = nationalPublicEconomy(state);
  let unemployment = national.unemployment;
  let regionalPull = 0;
  let regions = 0;
  if (kind === "province") {
    const regional = regionalPublicEconomy(state, geographyId);
    if (regional) {
      unemployment = regional.unemployment;
      regionalPull =
        regional.conditions === "Strong"
          ? 0.35
          : regional.conditions === "Firm"
            ? 0.15
            : regional.conditions === "Soft"
              ? -0.2
              : -0.4;
      regions = 1;
    }
  } else {
    const shares = world.constituencyElectorate[geographyId]?.provincePopulationShares ?? [];
    for (const row of shares) {
      const regional = regionalPublicEconomy(state, row.provinceId);
      if (!regional) continue;
      unemployment += (regional.unemployment - national.unemployment) * row.share;
      regionalPull +=
        (regional.conditions === "Strong"
          ? 0.35
          : regional.conditions === "Firm"
            ? 0.15
            : regional.conditions === "Soft"
              ? -0.2
              : -0.4) * row.share;
      regions += row.share;
    }
  }
  if (regions <= 0 && !Number.isFinite(national.unemployment)) return null;
  const labor =
    unemployment <= 4.5 ? 0.35 : unemployment <= 6.5 ? 0.1 : unemployment <= 9 ? -0.2 : -0.4;
  const confidence =
    national.confidence === "High"
      ? 0.25
      : national.confidence === "Positive"
        ? 0.1
        : national.confidence === "Cautious"
          ? -0.1
          : -0.25;
  return Math.max(-1, Math.min(1, labor * 0.55 + confidence * 0.25 + regionalPull * 0.45));
}

function publicEndorsementBoost(state: SimState, campaign: CampaignState): number {
  let count = 0;
  if (campaign.contestId) {
    for (const endorsement of Object.values(state.endorsements)) {
      if (
        endorsement.public &&
        endorsement.status === "active" &&
        endorsement.contestId === campaign.contestId &&
        endorsement.targetId === campaign.politicianId
      ) {
        count += 1;
      }
    }
  }
  for (const actor of Object.values(state.organizationRuntime?.actors ?? {})) {
    for (const endorsement of actor.endorsements) {
      if (
        endorsement.public &&
        (endorsement.status ?? "active") === "active" &&
        endorsement.politicianId === campaign.politicianId &&
        (endorsement.campaignId == null || endorsement.campaignId === campaign.id)
      ) {
        count += 1;
      }
    }
  }
  return Math.min(0.1, count * 0.025);
}

function geographyActivityBoost(
  campaign: CampaignState,
  geographyId: string,
  asOf: string,
): number {
  let score = 0;
  for (const effect of campaign.recentEffects) {
    if (effect.geographyId !== geographyId) continue;
    const age = Math.max(0, daysBetween(effect.date, asOf));
    if (age > 75) continue;
    const freshness = age <= 21 ? 1 : age <= 45 ? 0.65 : 0.35;
    const kindScale = effect.kind.startsWith("gotv:")
      ? 1.1
      : effect.kind.startsWith("organize:")
        ? 0.9
        : effect.kind.startsWith("visit:")
          ? 0.7
          : effect.kind.startsWith("advertise:")
            ? 0.55
            : 0.4;
    score += Math.abs(effect.magnitude) * kindScale * freshness;
  }
  return Math.min(0.09, score * 0.12);
}

function groundGameBoost(
  campaign: CampaignState,
  kind: "province" | "constituency",
  geographyId: string,
): number {
  const local =
    kind === "province"
      ? (campaign.organizationByProvince[geographyId] ?? 0)
      : (campaign.organizationByConstituency[geographyId] ?? 0);
  const national = campaign.fieldOrganization ?? 0;
  // Only politically readable org presence moves the forecast — thin footprints stay ignored.
  const readable = local + national * (kind === "province" ? 0.18 : 0.12);
  if (readable < 0.12) return 0;
  return Math.min(0.08, (readable - 0.12) * 0.14);
}

function forecastConfidence(
  evidence: number,
  hasFreshLocalPoll: boolean,
  hasAnyLocalPoll: boolean,
): PublicGeographicDatum["confidence"] {
  if ((evidence >= 2.2 && hasFreshLocalPoll) || evidence >= 3.6) return "high";
  if (evidence >= 1.5 || (hasAnyLocalPoll && evidence >= 1.1)) return "medium";
  if (evidence > 0) return "low";
  return "none";
}

function uncertaintyPhrase(confidence: PublicGeographicDatum["confidence"], seats: number): string {
  if (seats > 1) {
    if (confidence === "high") return "Seat projection uncertainty is narrow";
    if (confidence === "medium") return "Seat projection uncertainty is moderate";
    return "Seat projection uncertainty is wide";
  }
  if (confidence === "high") return "Model uncertainty is narrow";
  if (confidence === "medium") return "Model uncertainty is moderate";
  return "Model uncertainty is wide";
}

/**
 * Public campaign forecast: blends only observable public inputs.
 * Never reads latent voter support. Distinct from Polling (published polls only),
 * Previous (certified results), and Ground Game (organization strength alone).
 */
export function publicForecast(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
  kind: "province" | "constituency",
  geographyId: string,
): PublicGeographicDatum {
  const asOf = state.currentDate;
  const electionId = campaign.electionId ?? null;
  const blended: PartyShare = new Map();
  const signals: string[] = [];
  let evidence = 0;
  let asOfDate: string | null = null;
  let hasLocalPoll = false;
  let hasFreshLocalPoll = false;

  const local = latestGeographicPoll(state, electionId, kind, geographyId);
  if (local) {
    const freshness = pollFreshnessWeight(local.publicationDate, asOf);
    addWeightedShares(blended, pollShares(local), 1.15 * freshness);
    evidence += 2.4 * freshness;
    hasLocalPoll = true;
    hasFreshLocalPoll = freshness >= 0.85;
    asOfDate = local.publicationDate;
    signals.push(
      freshness >= 0.85
        ? "direct local poll"
        : freshness >= 0.5
          ? "aging local poll"
          : "stale local poll",
    );
  }

  const national = latestNationalPoll(state, electionId);
  if (national) {
    const freshness = pollFreshnessWeight(national.publicationDate, asOf);
    const weight = (hasLocalPoll ? 0.28 : 0.7) * freshness;
    addWeightedShares(blended, pollShares(national), weight);
    evidence += (hasLocalPoll ? 0.7 : 1.5) * freshness;
    asOfDate ??= national.publicationDate;
    signals.push("national polling environment");
  }

  const previous = previousPublicResult(world, state, campaign, kind, geographyId);
  if (previous.truth !== "no_data") {
    const prevShares: PartyShare = previous.projectedSeats?.length
      ? seatsToShares(previous.projectedSeats)
      : previous.leaderPartyId
        ? new Map([[previous.leaderPartyId, 1]])
        : new Map();
    if (prevShares.size) {
      addWeightedShares(blended, prevShares, hasLocalPoll ? 0.22 : 0.55);
      evidence += hasLocalPoll ? 0.55 : 1.25;
      asOfDate ??= previous.asOf;
      signals.push("previous certified result");
    }
  }

  const sitting =
    kind === "constituency"
      ? constituencySittingSeatBreakdown(world, state, geographyId)
      : provinceSittingDelegation(world, state, geographyId);
  const incumbent = incumbentPartyId(world, state, kind, geographyId);
  if (sitting.length) {
    addWeightedShares(blended, seatsToShares(sitting), hasLocalPoll ? 0.12 : 0.32);
    evidence += hasLocalPoll ? 0.35 : 0.75;
    signals.push("incumbency / sitting representation");
  }

  const climate = publicEconomyClimate(state, kind, geographyId, world);
  if (climate != null && incumbent) {
    // Strong public conditions support incumbents; weak conditions lift the field against them.
    const tilt = climate * 0.07;
    addPartyWeight(blended, incumbent, tilt);
    if (tilt < 0) {
      for (const [partyId] of blended) {
        if (partyId !== incumbent)
          addPartyWeight(blended, partyId, -tilt / Math.max(1, blended.size - 1));
      }
    }
    evidence += 0.35;
    signals.push("public economic environment");
  }

  const partyId = campaignPartyId(state, campaign);
  const hasGeographicBaseline = blended.size > 0;
  if (partyId && hasGeographicBaseline) {
    // Only materialized public standing — never invent latent defaults here.
    const standing = state.candidateStanding[campaign.politicianId];
    if (standing) {
      const standingScore =
        standing.favorability * 0.45 +
        standing.nameRecognition * 0.3 +
        standing.enthusiasm * 0.15 +
        standing.momentum * 0.1;
      const standingTilt = (standingScore - 0.42) * 0.12;
      if (Math.abs(standingTilt) >= 0.008) {
        addPartyWeight(blended, partyId, standingTilt);
        evidence += 0.35;
        signals.push("public candidate standing");
      }
    }

    const endorsementTilt = publicEndorsementBoost(state, campaign);
    if (endorsementTilt > 0) {
      addPartyWeight(blended, partyId, endorsementTilt);
      evidence += 0.3;
      signals.push("public endorsements");
    }

    const activityTilt = geographyActivityBoost(campaign, geographyId, asOf);
    if (activityTilt > 0) {
      addPartyWeight(blended, partyId, activityTilt);
      evidence += 0.25;
      signals.push("recent observable campaign activity");
    }

    const orgTilt = groundGameBoost(campaign, kind, geographyId);
    if (orgTilt > 0) {
      addPartyWeight(blended, partyId, orgTilt);
      evidence += 0.3;
      signals.push("Ground Game organization");
    }
  }

  const normalized = normalizeShares(blended);
  if (!normalized.size || evidence <= 0) {
    return {
      truth: "no_data",
      leaderPartyId: null,
      label: "No public forecast",
      detail: "There is not enough public geographic evidence to produce a forecast.",
      asOf: null,
      confidence: "none",
    };
  }

  const ranked = rankedShares(normalized);
  const margin = (ranked[0]?.[1] ?? 0) - (ranked[1]?.[1] ?? 0);
  const category = forecastCategory(margin);
  const confidence = forecastConfidence(evidence, hasFreshLocalPoll, hasLocalPoll);
  const seats =
    kind === "constituency" ? (world.constituencyElectorate[geographyId]?.seats ?? 0) : 0;
  const projectedSeats = seats > 0 ? projectSeats(ranked, seats) : undefined;
  const leaderPartyId = category === "Toss-up" && margin < 0.02 ? null : (ranked[0]?.[0] ?? null);
  const signalText = signals.slice(0, 5).join("; ");

  return {
    truth: "forecast",
    leaderPartyId,
    label: `${category} public forecast`,
    detail: `Model estimate (${confidence} confidence) blending ${signalText || "public inputs"}. ${uncertaintyPhrase(confidence, seats)}. Not an official result and not a published poll.`,
    asOf: asOfDate ?? asOf,
    confidence,
    category,
    ...(projectedSeats ? { projectedSeats } : {}),
  };
}

export function publicPolling(
  state: SimState,
  campaign: CampaignState,
  kind: "province" | "constituency",
  geographyId: string,
): PublicGeographicDatum {
  const poll = latestGeographicPoll(state, campaign.electionId ?? null, kind, geographyId);
  return poll
    ? pollDatum(poll)
    : {
        truth: "no_data",
        leaderPartyId: null,
        label: "No direct local poll",
        detail: "This area remains neutral because no published poll sampled it directly.",
        asOf: null,
        confidence: "none",
      };
}
