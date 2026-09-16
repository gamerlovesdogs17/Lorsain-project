/**
 * FORM A GOVERNMENT — interactive hung-Assembly coalition talks.
 * Partners accept / reject / counter with visible terms; hidden negotiation
 * utility never leaves the sim layer.
 */
import { padId, pushHistory } from "../scheduler.js";
import { cabinetFormationMode } from "../provinces/constitutionGameplay.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";
import { ensurePartyOrgRuntime } from "../partyOrg/state.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { MAX_FORMATION_ATTEMPTS, conductAssemblyConfidenceVote } from "./coalitions.js";
import { ensurePoliticsRuntime } from "./state.js";
import type {
  CoalitionAgreement,
  CoalitionOfferTerms,
  GovernmentFormationRejectReason,
  GovernmentFormationSession,
} from "./types.js";

export type AssemblySeatMath = {
  totalSeats: number;
  majorityNeeded: number;
  byParty: Record<string, number>;
  ranked: Array<[string, number]>;
  hung: boolean;
  pluralityPartyId: string | null;
};

export type PotentialPartnerView = {
  partyId: string;
  seats: number;
  combinedWithLead: number;
  reachesMajority: boolean;
  ideologicalFit: "Close" | "Workable" | "Distant" | "Hostile";
  relationship: "Warm" | "Correct" | "Cool" | "Frosty" | "Unknown";
  publicPriorities: PartyPlatformIssue[];
  redLines: PartyPlatformIssue[];
};

type Outcome =
  { ok: true; events: SimEvent[] } | { ok: false; error: { code: string; message: string } };

function ok(events: SimEvent[] = []): Outcome {
  return { ok: true, events };
}
function fail(code: string, message: string): Outcome {
  return { ok: false, error: { code, message } };
}

export function assemblySeatMath(world: KernelWorld, state: SimState): AssemblySeatMath {
  const byParty: Record<string, number> = {};
  for (const id of currentAssemblyMemberIds(world, state)) {
    const partyId = state.politicians[id]?.partyId;
    if (!partyId) continue;
    if (state.partyStates[partyId]?.status === "defunct") continue;
    byParty[partyId] = (byParty[partyId] ?? 0) + 1;
  }
  const ranked = Object.entries(byParty).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const totalSeats = ranked.reduce((sum, [, n]) => sum + n, 0);
  const majorityNeeded = totalSeats > 0 ? Math.floor(totalSeats / 2) + 1 : 0;
  const top = ranked[0]?.[1] ?? 0;
  const hung = totalSeats > 0 && top < majorityNeeded;
  return {
    totalSeats,
    majorityNeeded,
    byParty,
    ranked,
    hung,
    pluralityPartyId: ranked[0]?.[0] ?? null,
  };
}

export function isHungAssembly(world: KernelWorld, state: SimState): boolean {
  return assemblySeatMath(world, state).hung;
}

function ideologyDistance(state: SimState, a: string, b: string): number {
  const pa = state.partyStates[a]?.publicPlatform?.positions;
  const pb = state.partyStates[b]?.publicPlatform?.positions;
  if (!pa || !pb) return 0.55;
  let sum = 0;
  for (const issue of PARTY_PLATFORM_ISSUES) {
    sum += Math.min(1, Math.abs((pa[issue] ?? 0) - (pb[issue] ?? 0)));
  }
  return sum / PARTY_PLATFORM_ISSUES.length;
}

function qualitativeFit(distance: number): PotentialPartnerView["ideologicalFit"] {
  if (distance <= 0.25) return "Close";
  if (distance <= 0.45) return "Workable";
  if (distance <= 0.7) return "Distant";
  return "Hostile";
}

function leaderAffinity(state: SimState, a: string, b: string): number | null {
  const la = state.partyStates[a]?.leaderId;
  const lb = state.partyStates[b]?.leaderId;
  if (!la || !lb) return null;
  return state.relationships[la]?.[lb]?.affinity ?? state.relationships[lb]?.[la]?.affinity ?? 0;
}

function qualitativeRelationship(affinity: number | null): PotentialPartnerView["relationship"] {
  if (affinity == null) return "Unknown";
  if (affinity >= 0.25) return "Warm";
  if (affinity >= 0) return "Correct";
  if (affinity >= -0.25) return "Cool";
  return "Frosty";
}

function topPublicPriorities(state: SimState, partyId: string): PartyPlatformIssue[] {
  const positions = state.partyStates[partyId]?.publicPlatform?.positions;
  if (!positions) return [];
  return [...PARTY_PLATFORM_ISSUES]
    .map((issue) => ({ issue, mag: Math.abs(positions[issue] ?? 0) }))
    .sort((a, b) => b.mag - a.mag || a.issue.localeCompare(b.issue))
    .slice(0, 3)
    .map((row) => row.issue);
}

/** Hard public red lines: strongly held positions opposite the lead party. */
function derivedRedLines(
  state: SimState,
  leadPartyId: string,
  partnerId: string,
): PartyPlatformIssue[] {
  const lead = state.partyStates[leadPartyId]?.publicPlatform?.positions;
  const partner = state.partyStates[partnerId]?.publicPlatform?.positions;
  if (!lead || !partner) return [];
  const out: PartyPlatformIssue[] = [];
  for (const issue of PARTY_PLATFORM_ISSUES) {
    const pv = partner[issue] ?? 0;
    const lv = lead[issue] ?? 0;
    if (Math.abs(pv) >= 0.55 && Math.sign(pv) !== 0 && Math.sign(pv) !== Math.sign(lv || pv)) {
      out.push(issue);
    } else if (Math.abs(pv) >= 0.7 && Math.abs(pv - lv) >= 0.9) {
      out.push(issue);
    }
  }
  return out.slice(0, 3);
}

function talkRedLines(
  state: SimState,
  leadPartyId: string,
  partnerId: string,
): PartyPlatformIssue[] {
  const org = state.partyOrgRuntime;
  const fromTalks = org?.coalitionTalks?.[partnerId]?.[leadPartyId]?.redLines ?? [];
  const parsed = fromTalks.filter((x): x is PartyPlatformIssue =>
    (PARTY_PLATFORM_ISSUES as readonly string[]).includes(x),
  );
  return [...new Set([...parsed, ...derivedRedLines(state, leadPartyId, partnerId)])].slice(0, 4);
}

export function listPotentialPartners(
  world: KernelWorld,
  state: SimState,
  leadPartyId: string,
): PotentialPartnerView[] {
  const math = assemblySeatMath(world, state);
  const leadSeats = math.byParty[leadPartyId] ?? 0;
  return math.ranked
    .filter(([id]) => id !== leadPartyId)
    .map(([partyId, seats]) => {
      const combined = leadSeats + seats;
      return {
        partyId,
        seats,
        combinedWithLead: combined,
        reachesMajority: combined >= math.majorityNeeded,
        ideologicalFit: qualitativeFit(ideologyDistance(state, leadPartyId, partyId)),
        relationship: qualitativeRelationship(leaderAffinity(state, leadPartyId, partyId)),
        publicPriorities: topPublicPriorities(state, partyId),
        redLines: talkRedLines(state, leadPartyId, partyId),
      };
    });
}

function playerPartyId(state: SimState): string | null {
  return state.politicians[state.playerPoliticianId]?.partyId ?? null;
}

function playerCanSteerParty(state: SimState, partyId: string): boolean {
  const actorId = state.playerPoliticianId;
  if (state.partyStates[partyId]?.leaderId === actorId) return true;
  const officers = ensurePartyOrgRuntime(state).officers[partyId];
  if (!officers) return false;
  if (officers.chair?.politicianId === actorId) return true;
  if (!officers.chair && officers.vice_chair?.politicianId === actorId) return true;
  return false;
}

export function playerCanSteerFormation(world: KernelWorld, state: SimState): boolean {
  if (!isHungAssembly(world, state)) return false;
  const partyId = playerPartyId(state);
  if (!partyId) return false;
  const math = assemblySeatMath(world, state);
  if ((math.byParty[partyId] ?? 0) <= 0) return false;
  return playerCanSteerParty(state, partyId);
}

function normalizeShares(
  shares: Record<string, number>,
  partyIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const id of partyIds) {
    const v = Math.max(0, shares[id] ?? 0);
    out[id] = v;
    sum += v;
  }
  if (sum <= 0) {
    const even = 1 / partyIds.length;
    for (const id of partyIds) out[id] = even;
    return out;
  }
  for (const id of partyIds) out[id] = out[id]! / sum;
  return out;
}

function seatProportionalShares(
  counts: Record<string, number>,
  partyIds: string[],
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const id of partyIds) raw[id] = counts[id] ?? 0;
  return normalizeShares(raw, partyIds);
}

function defaultProposal(
  state: SimState,
  leadPartyId: string,
  partnerIds: string[],
  counts: Record<string, number>,
): CoalitionOfferTerms {
  const partyIds = [leadPartyId, ...partnerIds];
  const scores = new Map<PartyPlatformIssue, number>();
  for (const issue of PARTY_PLATFORM_ISSUES) scores.set(issue, 0);
  for (const partyId of partyIds) {
    const positions = state.partyStates[partyId]?.publicPlatform?.positions;
    if (!positions) continue;
    for (const issue of PARTY_PLATFORM_ISSUES) {
      scores.set(issue, (scores.get(issue) ?? 0) + Math.abs(positions[issue] ?? 0));
    }
  }
  const policyPriorities = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([issue]) => issue);
  const redLines = [
    ...new Set(partnerIds.flatMap((id) => talkRedLines(state, leadPartyId, id))),
  ].filter((issue) => !policyPriorities.includes(issue)) as PartyPlatformIssue[];
  return {
    policyPriorities,
    redLines: redLines.slice(0, 3),
    cabinetShares: seatProportionalShares(counts, partyIds),
  };
}

/** Internal fit used only for accept/reject/counter — never exposed to UI. */
function hiddenFitScore(
  state: SimState,
  leadPartyId: string,
  partnerIds: string[],
  terms: CoalitionOfferTerms,
  counts: Record<string, number>,
): number {
  const partyIds = [leadPartyId, ...partnerIds];
  let ideo = 0;
  let pairs = 0;
  for (let i = 0; i < partyIds.length; i += 1) {
    for (let j = i + 1; j < partyIds.length; j += 1) {
      ideo += 1 - ideologyDistance(state, partyIds[i]!, partyIds[j]!);
      pairs += 1;
    }
  }
  const ideoMean = pairs > 0 ? ideo / pairs : 0;
  const seats = partyIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const majority = seats / total;
  let cabFair = 1;
  for (const id of partnerIds) {
    const seatShare = (counts[id] ?? 0) / (seats || 1);
    const offered = terms.cabinetShares[id] ?? 0;
    if (seatShare > 0 && offered < seatShare * 0.65) cabFair -= 0.25;
  }
  const redHit = terms.policyPriorities.some((p) =>
    partnerIds.some((id) => talkRedLines(state, leadPartyId, id).includes(p)),
  );
  const hist = 0.5;
  return (
    ideoMean * 0.4 +
    Math.min(1, majority) * 0.3 +
    Math.max(0, cabFair) * 0.15 +
    hist * 0.15 -
    (redHit ? 0.35 : 0)
  );
}

function evaluatePartnerResponse(
  state: SimState,
  leadPartyId: string,
  partnerIds: string[],
  terms: CoalitionOfferTerms,
  counts: Record<string, number>,
): {
  response: "accept" | "reject" | "counter";
  rejectReason: GovernmentFormationRejectReason | null;
  rejectNote: string | null;
  counteroffer: CoalitionOfferTerms | null;
  counterofferNote: string | null;
} {
  const partyIds = [leadPartyId, ...partnerIds];
  const seats = partyIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const majorityNeeded = Math.floor(total / 2) + 1;
  if (seats < majorityNeeded) {
    return {
      response: "reject",
      rejectReason: "insufficient_seats",
      rejectNote: "Combined caucus still short of a working majority.",
      counteroffer: null,
      counterofferNote: null,
    };
  }

  for (const partnerId of partnerIds) {
    const reds = talkRedLines(state, leadPartyId, partnerId);
    const hit = terms.policyPriorities.find((p) => reds.includes(p));
    if (hit) {
      return {
        response: "reject",
        rejectReason: "red_line",
        rejectNote: `Partner will not enter talks that elevate ${hit.replaceAll("_", " ")} as a governing priority.`,
        counteroffer: null,
        counterofferNote: null,
      };
    }
  }

  const fairShares = seatProportionalShares(counts, partyIds);
  let cabinetTooThin = false;
  for (const partnerId of partnerIds) {
    const seatShare = (counts[partnerId] ?? 0) / (seats || 1);
    const offered = terms.cabinetShares[partnerId] ?? 0;
    if (seatShare > 0 && offered < seatShare * 0.7) {
      cabinetTooThin = true;
      break;
    }
  }
  if (cabinetTooThin) {
    return {
      response: "counter",
      rejectReason: null,
      rejectNote: null,
      counteroffer: {
        policyPriorities: terms.policyPriorities.slice(0, 3),
        redLines: [
          ...new Set([
            ...terms.redLines,
            ...partnerIds.flatMap((id) => talkRedLines(state, leadPartyId, id)),
          ]),
        ].slice(0, 4) as PartyPlatformIssue[],
        cabinetShares: fairShares,
      },
      counterofferNote: "Partners want Cabinet shares closer to their seat weight.",
    };
  }

  const score = hiddenFitScore(state, leadPartyId, partnerIds, terms, counts);
  if (score < 0.32) {
    const reason: GovernmentFormationRejectReason =
      qualitativeFit(ideologyDistance(state, leadPartyId, partnerIds[0]!)) === "Hostile"
        ? "relationship"
        : "priorities";
    return {
      response: "reject",
      rejectReason: reason,
      rejectNote:
        reason === "relationship"
          ? "Leaders see too little common ground to govern together."
          : "Partners reject the proposed governing priorities.",
      counteroffer: null,
      counterofferNote: null,
    };
  }
  if (score < 0.48) {
    const adjustedPriorities = [
      ...new Set([...topPublicPriorities(state, partnerIds[0]!), ...terms.policyPriorities]),
    ]
      .filter((p) => !partnerIds.some((id) => talkRedLines(state, leadPartyId, id).includes(p)))
      .slice(0, 3) as PartyPlatformIssue[];
    return {
      response: "counter",
      rejectReason: null,
      rejectNote: null,
      counteroffer: {
        policyPriorities: adjustedPriorities.length ? adjustedPriorities : terms.policyPriorities,
        redLines: [
          ...new Set([
            ...terms.redLines,
            ...partnerIds.flatMap((id) => talkRedLines(state, leadPartyId, id)),
          ]),
        ].slice(0, 4) as PartyPlatformIssue[],
        cabinetShares: fairShares,
      },
      counterofferNote: "Partners counter with revised priorities and Cabinet balance.",
    };
  }

  return {
    response: "accept",
    rejectReason: null,
    rejectNote: null,
    counteroffer: null,
    counterofferNote: null,
  };
}

function requireSteerAuth(state: SimState, partyId: string, actorId: string): Outcome | null {
  if (state.partyStates[partyId]?.leaderId === actorId) return null;
  const officers = ensurePartyOrgRuntime(state).officers[partyId];
  if (officers?.chair?.politicianId === actorId) return null;
  if (!officers?.chair && officers?.vice_chair?.politicianId === actorId) return null;
  return fail(
    "NOT_PARTY_CHAIR",
    `Politician ${actorId} cannot steer government formation for ${partyId}.`,
  );
}

export function ensureHungFormationSession(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const math = assemblySeatMath(world, state);
  if (!math.hung) {
    const runtime = ensurePoliticsRuntime(state);
    if (
      runtime.governmentFormation &&
      !["formed", "fallback"].includes(runtime.governmentFormation.status)
    ) {
      runtime.governmentFormation = null;
    }
    return [];
  }

  const runtime = ensurePoliticsRuntime(state);
  const active = Object.values(runtime.coalitionAgreements).find(
    (c) => c.status === "active" || c.status === "negotiating",
  );
  if (active?.status === "active") return [];

  if (!playerCanSteerFormation(world, state)) return [];

  const leadPartyId = playerPartyId(state)!;
  const existing = runtime.governmentFormation;
  if (
    existing &&
    existing.leadPartyId === leadPartyId &&
    !["formed", "fallback", "failed"].includes(existing.status)
  ) {
    return [];
  }

  const trigger =
    cabinetFormationMode(state) === "assembly_confidence" ? "assembly_confidence" : "no_plurality";
  const id = padId("GF", state.counters.nextOrgActionId++);
  const session: GovernmentFormationSession = {
    id,
    openedDate: state.currentDate,
    status: "awaiting_partners",
    leadPartyId,
    selectedPartnerIds: [],
    proposal: null,
    counteroffer: null,
    counterofferNote: null,
    lastPartnerResponse: null,
    rejectReason: null,
    rejectNote: null,
    agreementId: null,
    attempt: existing && existing.status === "failed" ? existing.attempt : 0,
    humanControlled: true,
    trigger,
  };
  runtime.governmentFormation = session;

  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_FORMATION_OPENED",
      importance: 0.8,
      visibility: "public",
      actorIds: [state.playerPoliticianId],
      entityIds: [leadPartyId],
      payload: {
        sessionId: id,
        leadPartyId,
        majorityNeeded: math.majorityNeeded,
        yourSeats: math.byParty[leadPartyId] ?? 0,
        seatsShort: Math.max(0, math.majorityNeeded - (math.byParty[leadPartyId] ?? 0)),
        trigger,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function shouldDeferAutoCoalition(world: KernelWorld, state: SimState): boolean {
  if (!playerCanSteerFormation(world, state)) return false;
  const session = ensurePoliticsRuntime(state).governmentFormation;
  if (!session) return true;
  return !["formed", "fallback"].includes(session.status);
}

export function openGovernmentTalks(
  world: KernelWorld,
  state: SimState,
  args: {
    actorId: string;
    partnerPartyIds: string[];
    commandId: string;
  },
): Outcome {
  const math = assemblySeatMath(world, state);
  if (!math.hung)
    return fail("NOT_HUNG", "Assembly already has a majority party — no talks needed.");
  const leadPartyId = playerPartyId(state);
  if (!leadPartyId) return fail("NO_PARTY", "Player has no party.");
  const auth = requireSteerAuth(state, leadPartyId, args.actorId);
  if (auth) return auth;

  const partners = [...new Set(args.partnerPartyIds)].filter((id) => id !== leadPartyId).sort();
  if (partners.length === 0) return fail("NO_PARTNERS", "Select at least one partner party.");
  for (const id of partners) {
    if ((math.byParty[id] ?? 0) <= 0) {
      return fail("UNKNOWN_PARTNER", `Partner ${id} holds no Assembly seats.`);
    }
  }

  const runtime = ensurePoliticsRuntime(state);
  let session = runtime.governmentFormation;
  if (!session || session.leadPartyId !== leadPartyId) {
    ensureHungFormationSession(world, state, args.commandId);
    session = runtime.governmentFormation;
  }
  if (!session) return fail("NO_SESSION", "Government formation session missing.");
  if (["formed", "fallback"].includes(session.status)) {
    return fail("SESSION_CLOSED", "Formation already concluded.");
  }

  session.selectedPartnerIds = partners;
  session.proposal = defaultProposal(state, leadPartyId, partners, math.byParty);
  session.counteroffer = null;
  session.counterofferNote = null;
  session.lastPartnerResponse = null;
  session.rejectReason = null;
  session.rejectNote = null;
  session.status = "talks_open";

  const events = [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_TALKS_OPENED",
      importance: 0.7,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [leadPartyId, ...partners],
      payload: {
        sessionId: session.id,
        leadPartyId,
        partnerPartyIds: partners,
        proposal: session.proposal,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  ];
  return ok(events);
}

export function proposeCoalitionTerms(
  world: KernelWorld,
  state: SimState,
  args: {
    actorId: string;
    terms: CoalitionOfferTerms;
    commandId: string;
  },
): Outcome {
  const runtime = ensurePoliticsRuntime(state);
  const session = runtime.governmentFormation;
  if (!session) return fail("NO_SESSION", "No government formation session.");
  const auth = requireSteerAuth(state, session.leadPartyId, args.actorId);
  if (auth) return auth;
  if (!["talks_open", "counteroffer", "failed", "awaiting_partners"].includes(session.status)) {
    return fail("BAD_STATUS", `Cannot propose terms while session is ${session.status}.`);
  }
  if (session.selectedPartnerIds.length === 0) {
    return fail("NO_PARTNERS", "Open talks with partners before proposing terms.");
  }

  const math = assemblySeatMath(world, state);
  const partyIds = [session.leadPartyId, ...session.selectedPartnerIds];
  const terms: CoalitionOfferTerms = {
    policyPriorities: args.terms.policyPriorities
      .filter((p) => (PARTY_PLATFORM_ISSUES as readonly string[]).includes(p))
      .slice(0, 4) as PartyPlatformIssue[],
    redLines: args.terms.redLines
      .filter((p) => (PARTY_PLATFORM_ISSUES as readonly string[]).includes(p))
      .slice(0, 4) as PartyPlatformIssue[],
    cabinetShares: normalizeShares(args.terms.cabinetShares, partyIds),
  };
  if (terms.policyPriorities.length === 0) {
    return fail("NO_PRIORITIES", "Propose at least one governing priority.");
  }

  session.proposal = terms;
  const verdict = evaluatePartnerResponse(
    state,
    session.leadPartyId,
    session.selectedPartnerIds,
    terms,
    math.byParty,
  );
  session.lastPartnerResponse = verdict.response;
  session.rejectReason = verdict.rejectReason;
  session.rejectNote = verdict.rejectNote;
  session.counteroffer = verdict.counteroffer;
  session.counterofferNote = verdict.counterofferNote;

  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_TERMS_PROPOSED",
      importance: 0.65,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: partyIds,
      payload: {
        sessionId: session.id,
        proposal: terms,
        // Response kind only — never the hidden fit score.
        partnerResponse: verdict.response,
        rejectReason: verdict.rejectReason,
        rejectNote: verdict.rejectNote,
        counteroffer: verdict.counteroffer,
        counterofferNote: verdict.counterofferNote,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  ];

  if (verdict.response === "accept") {
    session.status = "agreement_ready";
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNMENT_TERMS_ACCEPTED",
        importance: 0.75,
        visibility: "public",
        actorIds: [],
        entityIds: partyIds,
        payload: { sessionId: session.id, proposal: terms },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
  } else if (verdict.response === "counter") {
    session.status = "counteroffer";
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNMENT_COUNTEROFFER",
        importance: 0.7,
        visibility: "public",
        actorIds: [],
        entityIds: partyIds,
        payload: {
          sessionId: session.id,
          counteroffer: verdict.counteroffer,
          note: verdict.counterofferNote,
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
  } else {
    session.status = "failed";
    session.attempt += 1;
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNMENT_TALKS_REJECTED",
        importance: 0.7,
        visibility: "public",
        actorIds: [],
        entityIds: partyIds,
        payload: {
          sessionId: session.id,
          reason: verdict.rejectReason,
          note: verdict.rejectNote,
          attempt: session.attempt,
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
    if (session.attempt >= MAX_FORMATION_ATTEMPTS) {
      events.push(...applyFormationFallback(state, session, args.commandId));
    } else {
      session.status = "awaiting_partners";
      session.selectedPartnerIds = [];
      session.proposal = null;
    }
  }

  return ok(events);
}

export function respondToCoalitionCounter(
  world: KernelWorld,
  state: SimState,
  args: {
    actorId: string;
    response: "accept" | "revise";
    revisedTerms?: CoalitionOfferTerms;
    commandId: string;
  },
): Outcome {
  const runtime = ensurePoliticsRuntime(state);
  const session = runtime.governmentFormation;
  if (!session) return fail("NO_SESSION", "No government formation session.");
  const auth = requireSteerAuth(state, session.leadPartyId, args.actorId);
  if (auth) return auth;
  if (session.status !== "counteroffer" || !session.counteroffer) {
    return fail("NO_COUNTER", "No counteroffer pending.");
  }

  if (args.response === "accept") {
    session.proposal = session.counteroffer;
    session.counteroffer = null;
    session.counterofferNote = null;
    session.lastPartnerResponse = "accept";
    session.status = "agreement_ready";
    return ok([
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNMENT_COUNTEROFFER_ACCEPTED",
        importance: 0.75,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [session.leadPartyId, ...session.selectedPartnerIds],
        payload: { sessionId: session.id, proposal: session.proposal },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    ]);
  }

  if (!args.revisedTerms) {
    return fail("NO_REVISED_TERMS", "Provide revised terms when revising a counteroffer.");
  }
  session.status = "talks_open";
  return proposeCoalitionTerms(world, state, {
    actorId: args.actorId,
    terms: args.revisedTerms,
    commandId: args.commandId,
  });
}

function applyCoalitionTerms(state: SimState, agreement: CoalitionAgreement): void {
  for (const partyId of agreement.partyIds) {
    const leadership = state.legislatureRuntime.caucusLeadership[partyId];
    if (!leadership) continue;
    leadership.platformDemand = agreement.policyPriorities[0] ?? leadership.platformDemand ?? null;
    leadership.coalitionPreference = agreement.partyIds.slice();
  }
}

function applyFormationFallback(
  state: SimState,
  session: GovernmentFormationSession,
  commandId: string,
): SimEvent[] {
  session.status = "fallback";
  const order = state.provincialRuntime.constitutionalOrder;
  order.cabinetHasAssemblyConfidence = false;
  order.cabinetNeedsConfidence = true;
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNING_FORMATION_FALLBACK",
      importance: 0.85,
      visibility: "public",
      actorIds: [],
      entityIds: [session.leadPartyId, ...session.selectedPartnerIds],
      payload: {
        sessionId: session.id,
        attempts: session.attempt,
        formationAttempts: session.attempt,
        maxAttempts: MAX_FORMATION_ATTEMPTS,
        reason: "talks_failed",
        fallback: "constitutional_default",
        cabinetNeedsConfidence: true,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function confirmGovernmentAgreement(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; commandId: string },
): Outcome {
  const runtime = ensurePoliticsRuntime(state);
  const session = runtime.governmentFormation;
  if (!session) return fail("NO_SESSION", "No government formation session.");
  const auth = requireSteerAuth(state, session.leadPartyId, args.actorId);
  if (auth) return auth;
  if (session.status !== "agreement_ready" || !session.proposal) {
    return fail("NO_AGREEMENT", "No accepted coalition agreement to confirm.");
  }

  const math = assemblySeatMath(world, state);
  const partners = [session.leadPartyId, ...session.selectedPartnerIds];
  const seats = partners.reduce((sum, id) => sum + (math.byParty[id] ?? 0), 0);
  if (seats < math.majorityNeeded) {
    return fail("SHORT_MAJORITY", "Agreement still short of majority seats.");
  }

  session.status = "investiture";
  const agreementId = padId("COAL", state.counters.nextOrgActionId++);
  const agreement: CoalitionAgreement = {
    id: agreementId,
    formedDate: state.currentDate,
    status: "active",
    brokenDate: null,
    partyIds: partners,
    policyPriorities: session.proposal.policyPriorities,
    cabinetShares: session.proposal.cabinetShares,
    trigger: session.trigger,
    breakdownReason: null,
    // Stored for sim internals / legacy displays that already map to qualitative labels.
    negotiationScore: hiddenFitScore(
      state,
      session.leadPartyId,
      session.selectedPartnerIds,
      session.proposal,
      math.byParty,
    ),
    alternativeOptions: [],
    metadata: {
      formationSessionId: session.id,
      redLines: session.proposal.redLines,
      humanFormed: true,
      formationAttempt: session.attempt + 1,
    },
  };
  runtime.coalitionAgreements[agreementId] = agreement;
  session.agreementId = agreementId;
  applyCoalitionTerms(state, agreement);

  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "COALITION_FORMED",
      importance: 0.85,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: partners,
      payload: {
        coalitionId: agreementId,
        partyIds: partners,
        trigger: session.trigger,
        policyPriorities: agreement.policyPriorities,
        cabinetShares: agreement.cabinetShares,
        redLines: session.proposal.redLines,
        formationAttempt: session.attempt + 1,
        sessionId: session.id,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  ];

  const mode = cabinetFormationMode(state);
  if (mode === "assembly_confidence" || session.trigger === "assembly_confidence") {
    const conf = conductAssemblyConfidenceVote(world, state, partners, args.commandId);
    events.push(...conf);
    if (conf.some((e) => e.type === "ASSEMBLY_CONFIDENCE_PASSED")) {
      session.status = "formed";
      session.attempt += 1;
      return ok(events);
    }
    agreement.status = "broken";
    agreement.brokenDate = state.currentDate;
    agreement.breakdownReason = "confidence_failed";
    session.attempt += 1;
    session.status = "failed";
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "COALITION_BROKEN",
        importance: 0.7,
        visibility: "public",
        actorIds: [],
        entityIds: partners,
        payload: {
          coalitionId: agreementId,
          reason: "confidence_failed",
          formationAttempt: session.attempt,
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
    if (session.attempt >= MAX_FORMATION_ATTEMPTS) {
      events.push(...applyFormationFallback(state, session, args.commandId));
    } else {
      session.status = "awaiting_partners";
      session.selectedPartnerIds = [];
      session.proposal = null;
      session.agreementId = null;
    }
    return ok(events);
  }

  // presidential_choice / party_slate: agreement stands; appointments follow existing procedure.
  const order = state.provincialRuntime.constitutionalOrder;
  if (mode === "presidential_choice") {
    order.cabinetNeedsConfidence = false;
    order.cabinetHasAssemblyConfidence = true;
  } else if (mode === "party_slate") {
    order.cabinetNeedsConfidence = false;
    order.cabinetHasAssemblyConfidence = true;
  }
  session.status = "formed";
  session.attempt += 1;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_FORMATION_COMPLETE",
      importance: 0.8,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: partners,
      payload: {
        sessionId: session.id,
        coalitionId: agreementId,
        cabinetFormation: mode,
        route: mode === "party_slate" ? "party_slate" : "presidential_appointment",
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );
  return ok(events);
}

export function abandonGovernmentTalks(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; commandId: string },
): Outcome {
  void world;
  const runtime = ensurePoliticsRuntime(state);
  const session = runtime.governmentFormation;
  if (!session) return fail("NO_SESSION", "No government formation session.");
  const auth = requireSteerAuth(state, session.leadPartyId, args.actorId);
  if (auth) return auth;
  if (["formed", "fallback"].includes(session.status)) {
    return fail("SESSION_CLOSED", "Formation already concluded.");
  }
  session.attempt += 1;
  session.status = "failed";
  session.selectedPartnerIds = [];
  session.proposal = null;
  session.counteroffer = null;
  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_TALKS_ABANDONED",
      importance: 0.6,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [session.leadPartyId],
      payload: { sessionId: session.id, attempt: session.attempt },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  ];
  if (session.attempt >= MAX_FORMATION_ATTEMPTS) {
    events.push(...applyFormationFallback(state, session, args.commandId));
  } else {
    session.status = "awaiting_partners";
  }
  return ok(events);
}

export function activeGovernmentFormation(state: SimState): GovernmentFormationSession | null {
  return ensurePoliticsRuntime(state).governmentFormation;
}

/** Fixture helper: force a hung seat map for tests. */
export function fragmentAssemblySeats(
  world: KernelWorld,
  state: SimState,
  partyIds: string[],
): void {
  const mps = currentAssemblyMemberIds(world, state);
  for (let i = 0; i < mps.length; i += 1) {
    const pol = state.politicians[mps[i]!];
    if (!pol) continue;
    pol.partyId = partyIds[i % partyIds.length]!;
  }
}
