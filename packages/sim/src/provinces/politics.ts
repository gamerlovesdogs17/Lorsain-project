import { getAgentProfile } from "../agents/profile.js";
import type { IdeologyAxis } from "../agents/types.js";
import { orgIssueFit } from "../organizations/monthly.js";
import type { KernelWorld, SimState } from "../types.js";
import { currentGovernorId } from "./state.js";
import type {
  ProvincialAssemblyState,
  ProvincialBill,
  ProvincialBillSubject,
  ProvincialLegislator,
  ProvincialPartyBillPosition,
  ProvincialVote,
} from "./types.js";

export type ProvincialPolicy = {
  issueId: string;
  axis: IdeologyAxis;
};

const SUBJECT_POLICY: Record<ProvincialBillSubject, ProvincialPolicy> = {
  transport_service: { issueId: "ISS_TRADE", axis: "economic" },
  housing_delivery: { issueId: "ISS_HOUSING", axis: "economic" },
  school_capacity: { issueId: "ISS_WELFARE", axis: "economic" },
  hospital_access: { issueId: "ISS_WELFARE", axis: "economic" },
  local_administration: { issueId: "ISS_REFORM", axis: "authority" },
};

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function provincialPoliticalHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function provincialPolicy(subject: ProvincialBillSubject): ProvincialPolicy {
  return SUBJECT_POLICY[subject];
}

export type ProvincialGovernmentRelation = "friendly" | "divided" | "hostile";

export function provincialGovernmentRelation(
  world: KernelWorld,
  state: SimState,
  provinceId: string,
): ProvincialGovernmentRelation {
  const governorId = currentGovernorId(world, state, provinceId);
  const governorParty = governorId ? state.politicians[governorId]?.partyId ?? null : null;
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!governorParty || !assembly) return "divided";
  const share = (assembly.partySeats[governorParty] ?? 0) / Math.max(1, assembly.seatCount);
  const plurality = Object.entries(assembly.partySeats)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  if (share >= 0.5 || (plurality === governorParty && share >= 0.36)) return "friendly";
  if (share < 0.22 && plurality !== governorParty) return "hostile";
  return "divided";
}

function partyIdeology(world: KernelWorld, partyId: string | null, axis: IdeologyAxis): number {
  return partyId ? world.partyPublicIdeology[partyId]?.[axis] ?? 0 : 0;
}

function memberIdeology(
  world: KernelWorld,
  state: SimState,
  member: ProvincialLegislator,
  axis: IdeologyAxis,
): number {
  const fullId = member.fullPoliticianId ?? (state.politicians[member.id] ? member.id : null);
  const profile = fullId ? getAgentProfile(world, state, fullId) : null;
  const baseline = profile?.ideology[axis] ?? partyIdeology(world, member.partyId, axis);
  const personalOffset = ((provincialPoliticalHash(`${member.id}:${axis}:lean`) % 361) - 180) / 1000;
  return clampSigned(baseline + personalOffset);
}

function memberPartyLoyalty(
  world: KernelWorld,
  state: SimState,
  member: ProvincialLegislator,
): number {
  const fullId = member.fullPoliticianId ?? (state.politicians[member.id] ? member.id : null);
  const profile = fullId ? getAgentProfile(world, state, fullId) : null;
  return profile?.traits.partyLoyalty ?? 0.4 + (provincialPoliticalHash(`${member.id}:loyalty`) % 46) / 100;
}

function provincialInterest(state: SimState, bill: ProvincialBill): number {
  const economy = state.economyRuntime.provinces[bill.provinceId];
  const governance = state.provincialRuntime.provinces[bill.provinceId];
  if (!economy) return 0;
  let need = 0;
  if (bill.subject === "housing_delivery") need = (100 - economy.housingIndex) / 12;
  else if (bill.subject === "transport_service") need = (100 - economy.conditionsIndex) / 16;
  else if (bill.subject === "school_capacity" || bill.subject === "hospital_access") {
    need = (100 - economy.conditionsIndex) / 14;
  } else {
    need = (0.45 - (governance?.politicalCapital ?? 0.45)) * 0.7;
  }
  return clampSigned(need * bill.policyDirection);
}

function organizationSignal(world: KernelWorld, bill: ProvincialBill): number {
  const policy = provincialPolicy(bill.subject);
  let signal = 0;
  let weight = 0;
  for (const [orgId, organization] of Object.entries(world.interestOrganizations)) {
    if (!organization.issues.includes(policy.issueId)) continue;
    signal += orgIssueFit(world, orgId, policy.issueId) * organization.strength;
    weight += organization.strength;
  }
  return weight > 0 ? clampSigned((signal / weight) * bill.policyDirection) : 0;
}

export function deriveProvincialPartyPositions(
  world: KernelWorld,
  state: SimState,
  assembly: ProvincialAssemblyState,
  bill: ProvincialBill,
): Record<string, ProvincialPartyBillPosition> {
  const positions: Record<string, ProvincialPartyBillPosition> = {};
  const policy = provincialPolicy(bill.subject);
  for (const partyId of Object.keys(assembly.partySeats).sort()) {
    const leadership = assembly.partyLeadership[partyId];
    const ideology = partyIdeology(world, partyId, policy.axis) * bill.policyDirection;
    const interest = provincialInterest(state, bill);
    const sponsorCoalition = [bill.sponsorId, ...bill.cosponsorIds].some(
      (id) => state.provincialRuntime.legislators[id]?.partyId === partyId || state.politicians[id]?.partyId === partyId,
    ) ? 1 : 0;
    const sponsor = state.provincialRuntime.legislators[bill.sponsorId];
    const sponsorStrength = sponsor ? (sponsor.legislativeSkill + sponsor.standing) / 2 : 0.5;
    const fiscalPressure = Math.max(0, Math.min(1, state.economyRuntime.national.fiscalPressure));
    const fiscal = Math.max(-1, Math.min(1, -bill.fiscalImpact * (2 + fiscalPressure * 2)));
    const organizations = organizationSignal(world, bill);
    const relation = provincialGovernmentRelation(world, state, bill.provinceId);
    const governorId = currentGovernorId(world, state, bill.provinceId);
    const governorParty = governorId ? state.politicians[governorId]?.partyId ?? null : null;
    const governorAgenda = bill.agendaSource === "governor_priority"
      ? partyId === governorParty ? 0.12 : relation === "hostile" ? -0.12 : -0.04
      : 0;
    const score =
      ideology * 0.52 +
      interest * 0.12 +
      sponsorCoalition * (0.06 + sponsorStrength * 0.07) +
      fiscal * 0.16 +
      organizations * 0.12 +
      governorAgenda;
    const stance = score > 0.16 ? "support" : score < -0.12 ? "oppose" : "free_vote";
    positions[partyId] = {
      partyId,
      stance,
      setById: leadership?.floorLeaderId ?? null,
      strength: Math.max(0.22, Math.min(0.88, 0.32 + Math.abs(score) * 0.5)),
    };
  }
  return positions;
}

export function chooseProvincialLegislativeVote(
  world: KernelWorld,
  state: SimState,
  bill: ProvincialBill,
  memberId: string,
  kind: ProvincialVote["subjectKind"],
): "yes" | "no" | "abstain" {
  if (memberId === state.playerPoliticianId) return "abstain";
  const member = state.provincialRuntime.legislators[memberId];
  if (!member) return "abstain";
  const policy = provincialPolicy(bill.subject);
  const ideology = memberIdeology(world, state, member, policy.axis) * bill.policyDirection;
  const partyPosition = bill.partyPositions[member.partyId ?? ""];
  const partyPush = partyPosition?.stance === "support" ? 1 : partyPosition?.stance === "oppose" ? -1 : 0;
  const loyalty = memberPartyLoyalty(world, state, member);
  const partyCohesion = member.partyId ? state.partyStates[member.partyId]?.cohesion ?? 0.5 : 0;
  const discipline = Math.max(0.22, Math.min(0.9, 0.28 + partyCohesion * 0.52));
  const governorId = currentGovernorId(world, state, bill.provinceId);
  const governorParty = governorId ? state.politicians[governorId]?.partyId ?? null : null;
  const governorSponsor = governorId === bill.sponsorId ? 1 : 0;
  const governorPartySignal = governorParty && member.partyId === governorParty ? 1 : 0;
  const overrideSignal = kind === "veto_override" ? -governorPartySignal * loyalty : 0;
  const constituencyInterest = provincialInterest(state, bill);
  const orgSignal = organizationSignal(world, bill);
  const relation = provincialGovernmentRelation(world, state, bill.provinceId);
  const sponsor = state.provincialRuntime.legislators[bill.sponsorId];
  const sponsorStrength = sponsor ? (sponsor.legislativeSkill + sponsor.standing - 1) : 0;
  const fiscalPressure = Math.max(0, Math.min(1, state.economyRuntime.national.fiscalPressure));
  const fiscalSignal = Math.max(-1, Math.min(1, -bill.fiscalImpact * (2 + fiscalPressure * 2.2)));
  const issueDissent = bill.subject === "local_administration" ? 0.16
    : bill.subject === "housing_delivery" ? 0.1
      : 0.06;
  const independence = 1 - loyalty;
  const personalMandate =
    (((provincialPoliticalHash(`${bill.id}:${kind}:${memberId}:mandate`) % 1001) - 500) / 2500) *
    independence;
  const noise = ((provincialPoliticalHash(`${bill.id}:${kind}:${memberId}:noise`) % 1001) - 500) / 3900;
  const score =
    ideology * 0.42 +
    partyPush * loyalty * discipline * (partyPosition?.strength ?? 0.35) * 0.32 +
    constituencyInterest * 0.2 +
    orgSignal * 0.12 +
    fiscalSignal * 0.13 +
    governorSponsor * governorPartySignal * (relation === "friendly" ? 0.09 : 0.04) +
    governorSponsor * (relation === "hostile" && !governorPartySignal ? -0.08 : 0) +
    overrideSignal * 0.22 +
    sponsorStrength * 0.06 +
    (member.legislativeSkill - 0.5) * independence * 0.1 +
    personalMandate * (1 + issueDissent) +
    noise;
  if (score > 0.07) return "yes";
  if (score < -0.07) return "no";
  return "abstain";
}

export type GovernorDispositionEvaluation = {
  decision: "sign" | "veto";
  score: number;
  factors: {
    ideology: number;
    party: number;
    agenda: number;
    provincialNeed: number;
    fiscal: number;
    organizations: number;
    legislature: number;
  };
};

export function evaluateGovernorDisposition(
  world: KernelWorld,
  state: SimState,
  governorId: string,
  bill: ProvincialBill,
): GovernorDispositionEvaluation {
  const governor = state.politicians[governorId];
  const profile = getAgentProfile(world, state, governorId);
  const policy = provincialPolicy(bill.subject);
  const ideology = (profile?.ideology[policy.axis] ?? partyIdeology(world, governor?.partyId ?? null, policy.axis)) * bill.policyDirection;
  const governorParty = governor?.partyId ?? null;
  const partyPosition = governorParty ? bill.partyPositions[governorParty] : null;
  const party = partyPosition?.stance === "support" ? 1 : partyPosition?.stance === "oppose" ? -1 : 0;
  const governance = state.provincialRuntime.provinces[bill.provinceId];
  const prioritySubject: Partial<Record<string, ProvincialBillSubject[]>> = {
    transport: ["transport_service"],
    land_use: ["housing_delivery"],
    schools: ["school_capacity"],
    hospitals: ["hospital_access"],
    local_revenue: ["local_administration"],
  };
  const agenda = prioritySubject[governance?.administrativePriority ?? ""]?.includes(bill.subject) ? bill.policyDirection : 0;
  const need = provincialInterest(state, bill);
  const fiscal = clampSigned(-bill.fiscalImpact * 2.2);
  const organizations = organizationSignal(world, bill);
  const assembly = state.provincialRuntime.assemblies[bill.provinceId];
  const sponsorParty = state.provincialRuntime.legislators[bill.sponsorId]?.partyId ?? state.politicians[bill.sponsorId]?.partyId ?? null;
  const legislature = governorParty && sponsorParty === governorParty ? 1 : assembly && governorParty
    ? ((assembly.partySeats[governorParty] ?? 0) / Math.max(1, assembly.seatCount)) * 2 - 0.5
    : 0;
  const noise = ((provincialPoliticalHash(`${bill.id}:${governorId}:disposition-noise`) % 1001) - 500) / 7000;
  const score =
    ideology * 0.36 +
    party * 0.22 +
    agenda * 0.15 +
    need * 0.13 +
    fiscal * 0.08 +
    organizations * 0.07 +
    legislature * 0.09 +
    (governance?.politicalCapital ?? 0.5) * 0.04 -
    0.02 +
    noise;
  return {
    decision: score >= 0 ? "sign" : "veto",
    score,
    factors: { ideology, party, agenda, provincialNeed: need, fiscal, organizations, legislature },
  };
}
