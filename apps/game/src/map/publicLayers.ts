import type { CampaignState, KernelWorld, PollRecord, SimState } from "@lorsain/sim";
import { constituencySittingSeatBreakdown } from "./fills.js";

export type CampaignMapLayer = "forecast" | "polling" | "ground_game" | "previous";

export type PublicGeographicDatum = {
  truth: "poll" | "forecast" | "campaign" | "certified" | "historical" | "no_data";
  leaderPartyId: string | null;
  label: string;
  detail: string;
  asOf: string | null;
  confidence: "direct" | "low" | "none";
  category?: "Toss-up" | "Lean" | "Likely" | "Safe";
  projectedSeats?: Array<{ partyId: string | null; seats: number }>;
};

function forecastCategory(margin: number): PublicGeographicDatum["category"] {
  return margin < 0.025 ? "Toss-up" : margin < 0.07 ? "Lean" : margin < 0.14 ? "Likely" : "Safe";
}

function projectSeats(rows: Array<[string | null, number]>, seats: number): Array<{ partyId: string | null; seats: number }> {
  if (seats <= 0 || rows.length === 0) return [];
  const total = rows.reduce((sum, [, share]) => sum + Math.max(0, share), 0) || 1;
  const allocations = rows.map(([partyId, share]) => {
    const exact = Math.max(0, share) / total * seats;
    return { partyId, seats: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = seats - allocations.reduce((sum, row) => sum + row.seats, 0);
  for (const row of allocations.slice().sort((a, b) => b.remainder - a.remainder || String(a.partyId).localeCompare(String(b.partyId)))) {
    if (remaining-- <= 0) break;
    row.seats += 1;
  }
  return allocations.map(({ partyId, seats: projected }) => ({ partyId, seats: projected })).filter((row) => row.seats > 0).sort((a, b) => b.seats - a.seats || String(a.partyId).localeCompare(String(b.partyId)));
}

function pollElectionId(poll: PollRecord): string | null {
  return poll.electionId ?? (typeof poll.metadata.electionId === "string" ? poll.metadata.electionId : null);
}

export function latestGeographicPoll(
  state: SimState,
  electionId: string | null,
  kind: "province" | "constituency",
  geographyId: string,
): PollRecord | null {
  return Object.values(state.polls)
    .filter((poll) => {
      if (electionId && pollElectionId(poll) !== electionId) return false;
      return kind === "province"
        ? poll.geographyKind === "province" && poll.provinceId === geographyId
        : poll.geographyKind === "constituency" && poll.constituencyId === geographyId;
    })
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate) || b.id.localeCompare(a.id))[0] ?? null;
}

function pollDatum(poll: PollRecord): PublicGeographicDatum {
  const byParty = new Map<string | null, number>();
  for (const row of poll.firstPreference) {
    byParty.set(row.partyId, (byParty.get(row.partyId) ?? 0) + row.share);
  }
  const ranked = [...byParty.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const margin = (ranked[0]?.[1] ?? 0) - (ranked[1]?.[1] ?? 0);
  const tooClose = ranked.length > 1 && margin <= poll.marginOfError * 1.15;
  return {
    truth: "poll",
    leaderPartyId: tooClose ? null : ranked[0]?.[0] ?? null,
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

function provinceSittingDelegation(world: KernelWorld, state: SimState, provinceId: string) {
  const totals = new Map<string | null, number>();
  for (const constituencyId of Object.keys(world.constituencyElectorate)) {
    const share = world.constituencyElectorate[constituencyId]?.provincePopulationShares.find((row) => row.provinceId === provinceId)?.share ?? 0;
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
  return Object.values(state.elections)
    .filter((election) => election.type === "assembly" && election.status === "resolved" && election.date < date && election.assembly)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0] ?? null;
}

export function previousPublicResult(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
  kind: "province" | "constituency",
  geographyId: string,
): PublicGeographicDatum {
  const targetDate = campaign.electionId
    ? state.elections[campaign.electionId]?.date ?? state.provincialRuntime.elections[campaign.electionId]?.date ?? state.provincialRuntime.assemblyElections[campaign.electionId]?.date ?? state.currentDate
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
      const rows = [...totals.entries()].map(([partyId, seats]) => ({ partyId, seats })).sort((a, b) => b.seats - a.seats || String(a.partyId).localeCompare(String(b.partyId)));
      return { truth: "historical", leaderPartyId: largestParty(rows), label: "Previous certified result", detail: `${previous.electedIds.length} seats in the previous Assembly election`, asOf: previousElection?.date ?? null, confidence: "direct", projectedSeats: rows };
    }
  } else if (campaign.type === "gubernatorial") {
    const previous = Object.values(state.provincialRuntime.elections)
      .filter((race) => race.provinceId === geographyId && race.status !== "planned" && race.winnerId && race.date < targetDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (previous?.winnerId) {
      return { truth: "historical", leaderPartyId: previous.candidates[previous.winnerId]?.partyId ?? null, label: "Previous certified governor result", detail: "Province-wide winner from the previous recorded contest", asOf: previous.date, confidence: "direct" };
    }
  } else if (campaign.type === "provincial_assembly") {
    const previous = Object.values(state.provincialRuntime.assemblyElections)
      .filter((race) => race.provinceId === geographyId && race.status === "resolved" && race.date < targetDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (previous) {
      const rows = Object.entries(previous.partySeats).map(([partyId, seats]) => ({ partyId, seats })).sort((a, b) => b.seats - a.seats || a.partyId.localeCompare(b.partyId));
      return { truth: "historical", leaderPartyId: largestParty(rows), label: "Previous certified Assembly result", detail: `${previous.electedIds.length} provincial seats`, asOf: previous.date, confidence: "direct" };
    }
  }
  return { truth: "no_data", leaderPartyId: null, label: "No comparable previous result", detail: "No legitimate geographic result is archived for this race type.", asOf: null, confidence: "none" };
}

export function publicForecast(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
  kind: "province" | "constituency",
  geographyId: string,
): PublicGeographicDatum {
  const direct = latestGeographicPoll(state, campaign.electionId ?? null, kind, geographyId);
  if (direct) {
    const datum = pollDatum(direct);
    const byParty = new Map<string | null, number>();
    for (const row of direct.firstPreference) byParty.set(row.partyId, (byParty.get(row.partyId) ?? 0) + row.share);
    const projectedSeats = kind === "constituency" ? projectSeats([...byParty.entries()], world.constituencyElectorate[geographyId]?.seats ?? 0) : undefined;
    return { ...datum, truth: "forecast", label: `${datum.category ?? "Toss-up"} public forecast`, detail: `${datum.detail}. Forecast uses only this published local poll${projectedSeats?.length ? " and a largest-remainder STV seat approximation" : ""}; it is not an official result.`, confidence: "direct", ...(projectedSeats ? { projectedSeats } : {}) };
  }
  const previous = previousPublicResult(world, state, campaign, kind, geographyId);
  if (previous.truth !== "no_data") {
    return { ...previous, truth: "forecast", label: previous.leaderPartyId ? "Low-confidence public lean" : "Public forecast: competitive", detail: `${previous.detail}. No direct current local poll; this is a low-confidence structural forecast and not an official result.`, confidence: "low", category: previous.leaderPartyId ? "Lean" : "Toss-up" };
  }
  const publicDelegation = kind === "constituency"
    ? constituencySittingSeatBreakdown(world, state, geographyId)
    : provinceSittingDelegation(world, state, geographyId);
  const leaderPartyId = largestParty(publicDelegation);
  if (publicDelegation.length) {
    return { truth: "forecast", leaderPartyId, label: leaderPartyId ? "Low-confidence public lean" : "Public forecast: competitive", detail: "Based on current public Assembly representation; no direct local poll is available. This is not an official result.", asOf: state.currentDate, confidence: "low", category: leaderPartyId ? "Lean" : "Toss-up", ...(kind === "constituency" ? { projectedSeats: publicDelegation } : {}) };
  }
  return { truth: "no_data", leaderPartyId: null, label: "No public forecast", detail: "There is not enough public geographic evidence to produce a forecast.", asOf: null, confidence: "none" };
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
    : { truth: "no_data", leaderPartyId: null, label: "No direct local poll", detail: "This area remains neutral because no published poll sampled it directly.", asOf: null, confidence: "none" };
}
