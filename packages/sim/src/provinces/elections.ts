import { addMonths, addYears, compareIsoDate } from "../calendar.js";
import { ageOnDate, getAgentProfile } from "../agents/profile.js";
import { createCampaignRecord, activeCampaignFor } from "../campaigns/state.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import { blocSupportShares } from "../elections/support.js";
import { registeredElectorate } from "../elections/turnout.js";
import {
  activeTermsForPolitician,
  assumeOffice,
  endTerm,
  officesAreIncompatible,
  occupyingTerms,
} from "../offices.js";
import { jsonClone } from "../hash.js";
import { applyPoliticianExit } from "../political-lifecycle.js";
import type { RngService } from "../rng.js";
import { constituencyGotvBoost } from "../campaigns/gotv.js";
import { pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { createGubernatorialElection, governorOfficeForProvince } from "./state.js";
import { promoteProvincialCandidate } from "./assemblies.js";
import type {
  GubernatorialCandidate,
  GubernatorialElection,
  GubernatorialIncumbentDecision,
} from "./types.js";
import { resolveLegalLot } from "@lorsain/election-math";
import { certifyShareResult } from "../elections/certification.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableFraction(text: string): number {
  return stableHash(text) / 0x1_0000_0000;
}

export function gubernatorialEligibilityError(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  provinceId: string,
): CommandError | null {
  const politician = state.politicians[politicianId];
  if (!politician) return reject("UNKNOWN_POLITICIAN", politicianId);
  if (!politician.alive || politician.retired) return reject("INELIGIBLE", politicianId);
  if (!world.provinceIds.includes(provinceId)) return reject("UNKNOWN_PROVINCE", provinceId);
  if ((politician.homeProvinceId ?? world.politicianHomeProvince[politicianId]) !== provinceId) {
    return reject("PROVINCIAL_RESIDENCY", `${politicianId} is not resident in ${provinceId}`);
  }
  const presidentElect = Object.values(state.elections).some(
    (election) =>
      election.type === "presidential" &&
      election.status === "resolved" &&
      election.winnerIds.includes(politicianId) &&
      ((typeof election.metadata.assumptionDate === "string" &&
        compareIsoDate(state.currentDate, election.metadata.assumptionDate) < 0) ||
        state.scheduler.events.some(
          (event) =>
            event.eventType === "PRESIDENTIAL_ASSUMPTION_DUE" &&
            event.payload.electionId === election.id &&
            compareIsoDate(state.currentDate, event.dueDate) < 0,
        )),
  );
  if (presidentElect) return reject("INCOMPATIBLE_CANDIDACY", `${politicianId} is President-elect`);
  const nationalCandidacy = Object.values(state.elections).some((election) => {
    if (election.status === "resolved" || election.status === "cancelled") return false;
    if (election.candidates[politicianId] && !election.candidates[politicianId]!.withdrawn)
      return true;
    return election.assembly?.candidacies[politicianId]?.status === "filed";
  });
  if (nationalCandidacy)
    return reject("INCOMPATIBLE_CANDIDACY", `${politicianId} is already seeking national office`);
  for (const term of activeTermsForPolitician(state, politicianId)) {
    const office = world.offices[term.officeId];
    if (!office) continue;
    if (office.kind === "constitutional_court_justice" || office.kind === "president") {
      return reject("INCOMPATIBLE_OFFICE", office.kind);
    }
    if (office.kind === "governor" && office.provinceId !== provinceId) {
      return reject("INCOMPATIBLE_OFFICE", `governor of ${office.provinceId}`);
    }
  }
  return null;
}

function createGubernatorialSpecialElection(
  provinceId: string,
  openedDate: string,
): GubernatorialElection {
  const filingDeadlineDate = addMonths(openedDate, 3);
  const date = addMonths(openedDate, 6);
  const assumptionDate = addMonths(date, 1);
  return {
    id: `ELEC_GOV_${provinceId}_${date.slice(0, 7).replace("-", "")}_SPECIAL`,
    provinceId,
    date,
    filingOpenDate: openedDate,
    filingDeadlineDate,
    assumptionDate,
    cycleKind: "special",
    status: "planned",
    incumbentId: null,
    incumbentDecision: null,
    candidates: {},
    playerDecision: null,
    winnerId: null,
    voteShares: {},
    turnoutRate: null,
    resultEventId: null,
  };
}

function completedGovernorTerms(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  provinceId: string,
): number {
  return Object.values(state.officeTerms).filter((term) => {
    const office = world.offices[term.officeId];
    return (
      term.holderId === politicianId &&
      term.holdingKind === "substantive" &&
      office?.kind === "governor" &&
      office.provinceId === provinceId
    );
  }).length;
}

function incumbentVulnerability(
  state: SimState,
  election: GubernatorialElection,
  incumbentId: string,
): number {
  const latest = Object.values(state.provincialRuntime.elections)
    .filter((row) => row.provinceId === election.provinceId && row.date < election.date)
    .filter((row) => row.status === "resolved" || row.status === "assumed")
    .filter((row) => row.voteShares[incumbentId] != null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  if (!latest) return 0;
  const incumbentShare = latest.voteShares[incumbentId] ?? 0;
  const challengerShare = Object.entries(latest.voteShares)
    .filter(([id]) => id !== incumbentId)
    .reduce((highest, [, share]) => Math.max(highest, share), 0);
  return Math.max(-1, Math.min(1, (challengerShare - incumbentShare) * 3));
}

function hasNearTermHigherOfficeOpportunity(
  state: SimState,
  election: GubernatorialElection,
): boolean {
  const electionYear = Number(election.date.slice(0, 4));
  return Object.values(state.elections).some((row) => {
    if (row.status === "resolved" || row.status === "cancelled") return false;
    const year = Number(row.date.slice(0, 4));
    return (
      (row.type === "presidential" || row.type === "assembly") &&
      year >= electionYear &&
      year <= electionYear + 2
    );
  });
}

function chooseIncumbentDecision(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  incumbentId: string,
): GubernatorialIncumbentDecision {
  const profile = getAgentProfile(world, state, incumbentId);
  const standing = candidateStandingOrDefault(world, state, incumbentId);
  const age = ageOnDate(profile?.birthDate ?? null, election.filingOpenDate) ?? 58;
  const ambition = profile?.traits.ambition ?? 0.5;
  const retirement = profile?.traits.retirementInclination ?? 0.5;
  const terms = completedGovernorTerms(state, world, incumbentId, election.provinceId);
  const vulnerability = incumbentVulnerability(state, election, incumbentId);
  const incumbentParty = state.politicians[incumbentId]?.partyId ?? null;
  const assembly = state.provincialRuntime.assemblies[election.provinceId];
  const partyControl =
    incumbentParty && assembly
      ? (assembly.partySeats[incumbentParty] ?? 0) / Math.max(1, assembly.seatCount)
      : 0;
  const agePenalty = Math.max(0, age - 62) * 0.018 + Math.max(0, age - 72) * 0.026;
  const termPenalty = Math.max(0, terms - 2) * 0.065;
  const seekProbability = Math.max(
    0.005,
    Math.min(
      0.95,
      0.62 +
        ambition * 0.25 -
        retirement * 0.24 +
        standing.favorability * 0.18 +
        partyControl * 0.12 -
        Math.max(0, vulnerability) * 0.14 -
        agePenalty -
        termPenalty,
    ),
  );
  if (stableFraction(`${election.id}:${incumbentId}:career-decision`) < seekProbability) {
    return "seek_reelection";
  }
  if (
    age < 76 &&
    ambition >= 0.7 &&
    hasNearTermHigherOfficeOpportunity(state, election) &&
    stableFraction(`${election.id}:${incumbentId}:higher-office`) < ambition
  ) {
    return "seek_other_office";
  }
  return age >= 66 || retirement >= 0.55 || terms >= 4 ? "retire" : "leave_electoral_politics";
}

function npcCandidateScore(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  election: GubernatorialElection,
): number {
  const standing = candidateStandingOrDefault(world, state, politicianId);
  const kinds = activeTermsForPolitician(state, politicianId).map(
    (term) => world.offices[term.officeId]?.kind,
  );
  let score = standing.nameRecognition * 0.8 + (standing.favorability + 1) * 0.35;
  if (kinds.includes("governor")) score += 0.55;
  if (kinds.includes("mayor")) score += 0.24;
  if (kinds.includes("minister")) score += 0.18;
  if (Object.values(state.partyStates).some((party) => party.leaderId === politicianId))
    score += 0.2;
  score += (stableHash(`${election.id}:${politicianId}`) % 1000) / 100000;
  return score;
}

function filedCandidate(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  politicianId: string,
  source: "player" | "npc",
): GubernatorialCandidate {
  return {
    politicianId,
    partyId: state.politicians[politicianId]?.partyId ?? null,
    filedDate: state.currentDate,
    incumbent: election.incumbentId === politicianId,
    source,
    withdrawn: false,
  };
}

function openField(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  commandId: string,
): SimEvent[] {
  if (election.status !== "planned") return [];
  election.status = "filing_open";
  const events: SimEvent[] = [];
  if (election.incumbentId && election.incumbentId !== state.playerPoliticianId) {
    election.incumbentDecision = chooseIncumbentDecision(
      state,
      world,
      election,
      election.incumbentId,
    );
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNOR_CAREER_DECISION",
        importance: 0.48,
        visibility: "public",
        actorIds: [election.incumbentId],
        entityIds: [election.id, election.provinceId],
        payload: {
          electionId: election.id,
          provinceId: election.provinceId,
          decision: election.incumbentDecision,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  const eligibleIds = Object.keys(state.politicians)
    .filter((id) => id !== state.playerPoliticianId)
    .filter((id) => gubernatorialEligibilityError(state, world, id, election.provinceId) == null)
    .filter(
      (id) => id !== election.incumbentId || election.incumbentDecision === "seek_reelection",
    );
  if (eligibleIds.length < 4) {
    const provincialPool = Object.values(state.provincialRuntime.legislators)
      .filter(
        (row) =>
          row.provinceId === election.provinceId && row.active && row.fullPoliticianId == null,
      )
      .sort(
        (a, b) =>
          b.ambition + b.campaignSkill + b.standing - (a.ambition + a.campaignSkill + a.standing) ||
          stableHash(`${election.id}:${a.id}:recruit`) -
            stableHash(`${election.id}:${b.id}:recruit`),
      );
    for (const row of provincialPool) {
      if (eligibleIds.length >= 6) break;
      const promoted = promoteProvincialCandidate(
        world,
        state,
        row.id,
        "gubernatorial_recruitment",
      );
      if (
        promoted &&
        gubernatorialEligibilityError(state, world, promoted, election.provinceId) == null
      ) {
        eligibleIds.push(promoted);
      }
    }
  }
  const pool = [...new Set(eligibleIds)].sort(
    (a, b) =>
      npcCandidateScore(state, world, b, election) - npcCandidateScore(state, world, a, election) ||
      stableHash(`${election.id}:${a}`) - stableHash(`${election.id}:${b}`),
  );
  if (
    election.incumbentId &&
    election.incumbentId !== state.playerPoliticianId &&
    election.incumbentDecision === "seek_reelection"
  ) {
    const incumbent = election.incumbentId;
    const standing = candidateStandingOrDefault(world, state, incumbent);
    if (
      gubernatorialEligibilityError(state, world, incumbent, election.provinceId) == null &&
      standing.favorability > -0.55
    ) {
      election.candidates[incumbent] = filedCandidate(state, world, election, incumbent, "npc");
    }
  }
  const representedParties = new Set(
    Object.values(election.candidates).map((candidate) => candidate.partyId),
  );
  for (const politicianId of pool) {
    if (Object.keys(election.candidates).length >= 4) break;
    if (election.candidates[politicianId]) continue;
    const partyId = state.politicians[politicianId]?.partyId ?? null;
    if (representedParties.has(partyId) && Object.keys(election.candidates).length >= 2) continue;
    election.candidates[politicianId] = filedCandidate(state, world, election, politicianId, "npc");
    representedParties.add(partyId);
  }
  for (const candidate of Object.values(election.candidates)) {
    if (!activeCampaignFor(state, candidate.politicianId, "gubernatorial")) {
      createCampaignRecord(state, world, {
        politicianId: candidate.politicianId,
        type: "gubernatorial",
        electionId: election.id,
        status: "active",
        metadata: { provinceId: election.provinceId },
      });
    }
  }
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "GUBERNATORIAL_FILING_OPENED",
      importance: 0.52,
      visibility: "public",
      actorIds: [],
      entityIds: [election.id, election.provinceId],
      payload: {
        electionId: election.id,
        provinceId: election.provinceId,
        filingDeadlineDate: election.filingDeadlineDate,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}

export function fileGubernatorialCandidacy(
  state: SimState,
  world: KernelWorld,
  args: { politicianId: string; electionId: string; provinceId: string },
  commandId: string | null,
) {
  const election = state.provincialRuntime.elections[args.electionId];
  if (!election || election.provinceId !== args.provinceId) {
    return { error: reject("INVALID_ELECTION", args.electionId) };
  }
  if (
    election.status !== "filing_open" ||
    compareIsoDate(state.currentDate, election.filingDeadlineDate) >= 0
  ) {
    return { error: reject("FILING_CLOSED", election.id) };
  }
  const error = gubernatorialEligibilityError(state, world, args.politicianId, args.provinceId);
  if (error) return { error };
  if (election.playerDecision === "declined")
    return { error: reject("ALREADY_DECLINED", args.politicianId) };
  if (election.candidates[args.politicianId])
    return { error: reject("ALREADY_FILED", args.politicianId) };
  election.candidates[args.politicianId] = filedCandidate(
    state,
    world,
    election,
    args.politicianId,
    "player",
  );
  if (args.politicianId === state.playerPoliticianId) election.playerDecision = "filed";
  const event = pushHistory(state, {
    date: state.currentDate,
    type: "GUBERNATORIAL_CANDIDACY_FILED",
    importance: 0.62,
    visibility: "public",
    actorIds: [args.politicianId],
    entityIds: [election.id, election.provinceId],
    payload: { electionId: election.id, provinceId: election.provinceId },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  return { candidate: election.candidates[args.politicianId]!, events: [event] };
}

export function declineGubernatorialCandidacy(
  state: SimState,
  args: { politicianId: string; electionId: string },
  commandId: string | null,
) {
  const election = state.provincialRuntime.elections[args.electionId];
  if (!election) return { error: reject("INVALID_ELECTION", args.electionId) };
  if (election.status !== "filing_open") return { error: reject("FILING_CLOSED", election.id) };
  if (election.candidates[args.politicianId])
    return { error: reject("ALREADY_FILED", args.politicianId) };
  if (args.politicianId === state.playerPoliticianId) election.playerDecision = "declined";
  const event = pushHistory(state, {
    date: state.currentDate,
    type: "GUBERNATORIAL_CANDIDACY_DECLINED",
    importance: 0.25,
    visibility: "system",
    actorIds: [args.politicianId],
    entityIds: [election.id],
    payload: { electionId: election.id },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  return { events: [event] };
}

function campaignForElection(state: SimState, politicianId: string, electionId: string) {
  return Object.values(state.campaignRuntime.campaigns).find(
    (campaign) =>
      campaign.type === "gubernatorial" &&
      campaign.electionId === electionId &&
      campaign.politicianId === politicianId &&
      (campaign.status === "active" || campaign.status === "exploring"),
  );
}

function resolveElection(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  election: GubernatorialElection,
  commandId: string,
): SimEvent[] {
  const candidateIds = Object.values(election.candidates)
    .filter((candidate) => !candidate.withdrawn)
    .map((candidate) => candidate.politicianId)
    .sort();
  if (candidateIds.length === 0) return [];
  const votes = Object.fromEntries(candidateIds.map((id) => [id, 0])) as Record<string, number>;
  let electorateWeight = 0;
  let turnoutWeight = 0;
  for (const [constituencyId, electorate] of Object.entries(world.constituencyElectorate)) {
    const provinceShare =
      electorate.provincePopulationShares.find((row) => row.provinceId === election.provinceId)
        ?.share ?? 0;
    if (provinceShare <= 0) continue;
    const registered = registeredElectorate(electorate) * provinceShare;
    for (const blocId of world.voterBlocIdsByConstituency[constituencyId] ?? []) {
      const bloc = world.voterBlocs[blocId];
      if (!bloc) continue;
      const weight = registered * bloc.weight * (0.82 + bloc.turnoutPropensity * 0.18);
      const shares = blocSupportShares(world, state, bloc, candidateIds);
      for (const politicianId of candidateIds) {
        const campaign = campaignForElection(state, politicianId, election.id);
        const organization = campaign
          ? 1 +
            campaign.fieldOrganization * 0.05 +
            (campaign.organizationByProvince[election.provinceId] ?? 0) * 0.12 +
            (campaign.organizationByConstituency[constituencyId] ?? 0) * 0.06 +
            constituencyGotvBoost(world, campaign, constituencyId, state.currentDate) * 0.1
          : 1;
        votes[politicianId] =
          (votes[politicianId] ?? 0) + weight * (shares[politicianId] ?? 0) * organization;
      }
      electorateWeight += weight;
      turnoutWeight += weight * (0.5 + bloc.turnoutPropensity * 0.15);
    }
  }
  for (const politicianId of candidateIds) {
    votes[politicianId] = (votes[politicianId] ?? 0) * (0.992 + rng.float01("elections") * 0.016);
  }
  const total = Object.values(votes).reduce((sum, value) => sum + value, 0);
  election.voteShares = Object.fromEntries(
    candidateIds.map((politicianId) => [
      politicianId,
      total > 0 ? votes[politicianId]! / total : 1 / candidateIds.length,
    ]),
  );
  const ranked = candidateIds
    .slice()
    .sort((a, b) => election.voteShares[b]! - election.voteShares[a]! || a.localeCompare(b));
  const topShare = election.voteShares[ranked[0]!]!;
  const tied = ranked.filter(
    (id) => Math.abs(election.voteShares[id]! - topShare) <= Number.EPSILON,
  );
  const lot =
    tied.length > 1 ? resolveLegalLot(tied, { nextUint32: () => rng.uint32("elections") }) : null;
  election.winnerId = lot?.selectedId ?? ranked[0]!;
  election.turnoutRate = electorateWeight > 0 ? turnoutWeight / electorateWeight : 0.58;
  election.certification = certifyShareResult({
    date: state.currentDate,
    authority: "provincial_electoral_commission",
    shares: Object.values(election.voteShares),
    legalLotUsed: lot != null,
  });
  election.status = "resolved";
  for (const candidateId of candidateIds) {
    const campaign = campaignForElection(state, candidateId, election.id);
    if (!campaign) continue;
    campaign.status = candidateId === election.winnerId ? "won" : "lost";
    campaign.endedDate = state.currentDate;
  }
  const event = pushHistory(state, {
    date: state.currentDate,
    type: "GUBERNATORIAL_ELECTION_RESOLVED",
    importance: 0.72,
    visibility: "public",
    actorIds: [election.winnerId],
    entityIds: [election.id, election.provinceId],
    payload: {
      electionId: election.id,
      provinceId: election.provinceId,
      winnerId: election.winnerId,
      turnoutRate: election.turnoutRate,
      certification: election.certification,
      ...(lot ? { legalLot: lot } : {}),
    },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  election.resultEventId = event.id;
  return [event];
}

function assumeWinner(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  commandId: string,
): SimEvent[] {
  if (!election.winnerId) return [];
  const office = governorOfficeForProvince(world, election.provinceId);
  if (!office) return [];
  const prepare = (target: SimState) => {
    for (const term of occupyingTerms(target, office.id)) {
      endTerm(target, term.id, target.currentDate, "gubernatorial_transition");
    }
    for (const term of activeTermsForPolitician(target, election.winnerId!)) {
      const held = world.offices[term.officeId];
      // Incompatibility is deliberately symmetric.  A Speaker cannot remain
      // Speaker while becoming Governor even though the Governor definition
      // does not need to repeat every restriction declared by the Speakership.
      if (held && officesAreIncompatible(office, held)) {
        endTerm(target, term.id, target.currentDate, "assumed_governorship");
      }
    }
  };
  const args = {
    officeId: office.id,
    holderId: election.winnerId,
    date: state.currentDate,
    accessionReason: "provincial_election",
    holdingKind: "substantive",
    endDate: addYears(state.currentDate, 4),
    startKnown: true,
    sourceElectionId: election.id,
  } as const;
  const preview = jsonClone(state);
  prepare(preview);
  const previewAssumed = assumeOffice(preview, world, args);
  if ("error" in previewAssumed) {
    return [
      pushHistory(state, {
        date: state.currentDate,
        type: "GUBERNATORIAL_ASSUMPTION_BLOCKED",
        importance: 0.9,
        visibility: "system",
        actorIds: [election.winnerId],
        entityIds: [election.id, election.provinceId, office.id],
        payload: { code: previewAssumed.error.code, message: previewAssumed.error.message },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ];
  }
  prepare(state);
  const assumed = assumeOffice(state, world, args);
  if ("error" in assumed)
    throw new Error(`Governor assumption preview drift: ${assumed.error.code}`);
  election.status = "assumed";
  delete state.provincialRuntime.governorVacancies[election.provinceId];
  if (election.cycleKind === "special") {
    const nextRegular = Object.values(state.provincialRuntime.elections)
      .filter(
        (row) =>
          row.provinceId === election.provinceId &&
          row.cycleKind === "regular" &&
          row.status !== "assumed",
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
    if (nextRegular) nextRegular.incumbentId = election.winnerId;
    else {
      const next = createGubernatorialElection(
        election.provinceId,
        Number(election.date.slice(0, 4)) + 4,
        election.winnerId,
      );
      state.provincialRuntime.elections[next.id] = next;
    }
  } else {
    const next = createGubernatorialElection(
      election.provinceId,
      Number(election.date.slice(0, 4)) + 4,
      election.winnerId,
    );
    state.provincialRuntime.elections[next.id] = next;
  }
  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNOR_ASSUMED_OFFICE",
      importance: 0.68,
      visibility: "public",
      actorIds: [election.winnerId],
      entityIds: [office.id, election.id, election.provinceId],
      payload: { electionId: election.id, provinceId: election.provinceId, officeId: office.id },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
  if (
    election.incumbentId &&
    election.incumbentId !== election.winnerId &&
    (election.incumbentDecision === "retire" ||
      election.incumbentDecision === "leave_electoral_politics")
  ) {
    events.push(
      ...applyPoliticianExit(state, world, election.incumbentId, "retirement", commandId),
    );
  }
  return events;
}

function reconcileGovernorAuthority(
  state: SimState,
  world: KernelWorld,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const provinceId of world.provinceIds) {
    const office = governorOfficeForProvince(world, provinceId);
    if (!office) continue;
    const holders = occupyingTerms(state, office.id);
    const valid = holders.filter((term) => {
      const politician = state.politicians[term.holderId];
      const termCurrent =
        term.endDate == null || compareIsoDate(state.currentDate, term.endDate) < 0;
      return politician?.alive && !politician.retired && termCurrent;
    });
    if (valid.length > 0) {
      if (state.provincialRuntime.governorVacancies[provinceId]) {
        delete state.provincialRuntime.governorVacancies[provinceId];
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "GOVERNOR_VACANCY_ENDED",
            importance: 0.55,
            visibility: "public",
            actorIds: valid.map((term) => term.holderId),
            entityIds: [provinceId, office.id],
            payload: { provinceId, officeId: office.id },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
      continue;
    }
    for (const term of holders) {
      const reason =
        term.endDate != null && compareIsoDate(state.currentDate, term.endDate) >= 0
          ? "term_expired"
          : "holder_ineligible";
      endTerm(state, term.id, state.currentDate, reason);
    }
    const futureRegular =
      Object.values(state.provincialRuntime.elections)
        .filter((row) => row.provinceId === provinceId && row.status !== "assumed")
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null;
    let future =
      Object.values(state.provincialRuntime.elections)
        .filter(
          (row) =>
            row.provinceId === provinceId &&
            row.cycleKind === "special" &&
            row.status !== "assumed",
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null;
    if (
      !future &&
      (!futureRegular || compareIsoDate(futureRegular.date, addMonths(state.currentDate, 12)) > 0)
    ) {
      future = createGubernatorialSpecialElection(provinceId, state.currentDate);
      state.provincialRuntime.elections[future.id] = future;
    }
    if (!future) future = futureRegular;
    if (!future) {
      future = createGubernatorialElection(
        provinceId,
        Number(state.currentDate.slice(0, 4)) + 1,
        null,
      );
      state.provincialRuntime.elections[future.id] = future;
    }
    if (!state.provincialRuntime.governorVacancies[provinceId]) {
      state.provincialRuntime.governorVacancies[provinceId] = {
        provinceId,
        status: "vacant",
        openedDate: state.currentDate,
        reason: holders.length > 0 ? "holder_ineligible" : "office_unoccupied",
        actingHolderId: null,
        expectedElectionId: future.id,
      };
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "GOVERNOR_VACANCY_OPENED",
          importance: 0.72,
          visibility: "public",
          actorIds: [],
          entityIds: [provinceId, office.id, future.id],
          payload: { provinceId, officeId: office.id, expectedElectionId: future.id },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

export function processGubernatorialCalendar(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const elections = Object.values(state.provincialRuntime.elections).sort(
    (a, b) => a.date.localeCompare(b.date) || a.provinceId.localeCompare(b.provinceId),
  );
  for (const election of elections) {
    if (
      election.status === "planned" &&
      compareIsoDate(state.currentDate, election.filingOpenDate) >= 0
    ) {
      events.push(...openField(state, world, election, commandId));
    }
    if (
      election.status === "filing_open" &&
      compareIsoDate(state.currentDate, election.filingDeadlineDate) >= 0
    ) {
      if (election.playerDecision == null) election.playerDecision = "declined";
      election.status = "field_finalized";
    }
    if (
      election.status === "field_finalized" &&
      compareIsoDate(state.currentDate, election.date) >= 0
    ) {
      events.push(...resolveElection(state, world, rng, election, commandId));
    }
    if (
      election.status === "resolved" &&
      compareIsoDate(state.currentDate, election.assumptionDate) >= 0
    ) {
      events.push(...assumeWinner(state, world, election, commandId));
    }
  }
  events.push(...reconcileGovernorAuthority(state, world, commandId));
  return events;
}

export function currentGubernatorialOpportunity(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
): GubernatorialElection[] {
  return Object.values(state.provincialRuntime.elections)
    .filter(
      (election) =>
        (election.status === "planned" || election.status === "filing_open") &&
        election.playerDecision == null &&
        gubernatorialEligibilityError(state, world, politicianId, election.provinceId) == null,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.provinceId.localeCompare(b.provinceId));
}
