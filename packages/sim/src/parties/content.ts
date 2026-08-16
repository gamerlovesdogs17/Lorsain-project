import type { KernelWorld } from "../types.js";
import { DEFAULT_PRESIDENTIAL_ELIGIBILITY } from "./eligibility.js";
import { buildProvincialPartyOrganizations } from "./organizations.js";
import { INDEPENDENT_AGGREGATE_ID } from "./policy.js";
import {
  MEMBERSHIP_PARTY_ORGANIZATION,
  isNominationMethod,
  type FactionDefinition,
  type NominationRuleDefinition,
  type PartyDefinition,
} from "./types.js";

export type PartyContentInput = {
  parties: Array<{
    id: string;
    name: string;
    short?: string;
    organization_type?: string;
    nomination_rule_id: string;
    factions: Array<{ id: string; name: string; share: number; party_id?: string }>;
  }>;
  nominationRules: Array<{
    id: string;
    party_id: string;
    method: string;
    member_weight?: number;
    affiliate_union_delegate_weight?: number;
    entry_requirements?: Record<string, unknown>;
  }>;
  figures: Array<{
    id: string;
    party_id?: string | null;
    faction_id?: string | null;
    home_province_id?: string;
    roles?: Array<{ type: string; party_id?: string; faction_id?: string }>;
    presidential_status?: string | null;
  }>;
  provinces?: string[];
  constituencies?: Array<{
    id: string;
    provinceShares: Array<{ provinceId: string; share: number }>;
  }>;
  assemblyElection?: {
    constituencies: Array<{
      constituencyId: string;
      candidates: Array<{ id: string; partyId: string | null }>;
      firstPreferences: Record<string, string>;
    }>;
  };
};

export class PartyContentError extends Error {
  readonly code = "CONTENT_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "PartyContentError";
  }
}

function req(entry: Record<string, unknown> | undefined, key: string): unknown {
  return entry?.[key];
}

export function buildPartyKernelSlice(
  input: PartyContentInput,
): Pick<
  KernelWorld,
  | "partyDefinitions"
  | "factionDefinitions"
  | "nominationRules"
  | "independentAggregatePartyId"
  | "startingPartyLeaders"
  | "startingFactionChairs"
  | "provinceIds"
  | "politicianHomeProvince"
  | "constituencyProvinceShares"
  | "partyProvinceBaseline"
  | "provincialPartyOrganizations"
  | "presidentialEligibility"
> {
  const partyDefinitions: Record<string, PartyDefinition> = {};
  const factionDefinitions: Record<string, FactionDefinition> = {};
  let independent = INDEPENDENT_AGGREGATE_ID;
  for (const p of input.parties) {
    if (p.organization_type === "independent_aggregate") {
      independent = p.id;
      continue;
    }
    if (p.organization_type && p.organization_type !== MEMBERSHIP_PARTY_ORGANIZATION) {
      throw new PartyContentError(`Party ${p.id} has unknown organization_type`);
    }
    const factionIds = p.factions.map((f) => f.id).sort();
    const shares: Record<string, number> = {};
    for (const f of p.factions) {
      if (factionDefinitions[f.id]) throw new PartyContentError(`Duplicate faction ${f.id}`);
      if (f.party_id && f.party_id !== p.id) {
        throw new PartyContentError(`Faction ${f.id} party_id mismatch`);
      }
      factionDefinitions[f.id] = { factionId: f.id, partyId: p.id, name: f.name, share: f.share };
      shares[f.id] = f.share;
    }
    partyDefinitions[p.id] = {
      partyId: p.id,
      name: p.name,
      short: p.short ?? p.id,
      organizationType: MEMBERSHIP_PARTY_ORGANIZATION,
      nominationRuleId: p.nomination_rule_id,
      factionIds,
      canonicalFactionShares: shares,
    };
  }
  const nominationRules: Record<string, NominationRuleDefinition> = {};
  for (const r of input.nominationRules) {
    if (!isNominationMethod(r.method)) {
      throw new PartyContentError(`Unknown nomination method ${r.method}`);
    }
    const entry = r.entry_requirements ?? {};
    nominationRules[r.id] = {
      ruleId: r.id,
      partyId: r.party_id,
      method: r.method,
      memberWeight: typeof r.member_weight === "number" ? r.member_weight : null,
      affiliateUnionDelegateWeight:
        typeof r.affiliate_union_delegate_weight === "number"
          ? r.affiliate_union_delegate_weight
          : null,
      assemblyCaucusEndorsementFraction:
        typeof req(entry, "assembly_caucus_endorsement_fraction") === "number"
          ? (entry.assembly_caucus_endorsement_fraction as number)
          : null,
      provincialOrganizationEndorsementsMin:
        typeof req(entry, "provincial_organization_endorsements_min") === "number"
          ? (entry.provincial_organization_endorsements_min as number)
          : null,
      memberNominationsRequired: req(entry, "member_nominations") === true,
      memberNominationThresholdRequired: req(entry, "member_nomination_threshold") === true,
      provincialNominationSupportRequired: req(entry, "provincial_nomination_support") === true,
      supporterRegistrationRequired: req(entry, "supporter_registration_required") === true,
    };
  }
  for (const p of Object.values(partyDefinitions)) {
    if (!nominationRules[p.nominationRuleId]) {
      throw new PartyContentError(`Party ${p.partyId} nomination_rule_id does not resolve`);
    }
    if (nominationRules[p.nominationRuleId]!.partyId !== p.partyId) {
      throw new PartyContentError(`Nomination rule ${p.nominationRuleId} party mismatch`);
    }
  }
  const figureIds = new Set(input.figures.map((f) => f.id));
  const startingPartyLeaders: Record<string, string> = {};
  const startingFactionChairs: Record<string, string> = {};
  const politicianHomeProvince: Record<string, string> = {};
  for (const f of input.figures) {
    if (f.party_id === independent) {
      throw new PartyContentError(`${f.id} cannot have PARTY_IND membership`);
    }
    if (f.party_id && !partyDefinitions[f.party_id]) {
      throw new PartyContentError(`${f.id} unknown party ${f.party_id}`);
    }
    if (f.faction_id) {
      const fac = factionDefinitions[f.faction_id];
      if (!fac) throw new PartyContentError(`${f.id} unknown faction ${f.faction_id}`);
      if (fac.partyId !== f.party_id) {
        throw new PartyContentError(`${f.id} faction does not belong to party`);
      }
    }
    if (f.home_province_id) politicianHomeProvince[f.id] = f.home_province_id;
    for (const role of f.roles ?? []) {
      if (role.type === "party_leader") {
        const pid = role.party_id ?? f.party_id;
        if (!pid || !partyDefinitions[pid])
          throw new PartyContentError(`${f.id} party_leader missing party`);
        if (startingPartyLeaders[pid]) throw new PartyContentError(`Duplicate leader for ${pid}`);
        if (f.party_id !== pid) throw new PartyContentError(`${f.id} leader must belong to ${pid}`);
        startingPartyLeaders[pid] = f.id;
      }
      if (role.type === "faction_chair") {
        const fid = role.faction_id ?? f.faction_id;
        if (!fid || !factionDefinitions[fid])
          throw new PartyContentError(`${f.id} faction_chair missing faction`);
        if (startingFactionChairs[fid]) throw new PartyContentError(`Duplicate chair for ${fid}`);
        if (f.faction_id !== fid)
          throw new PartyContentError(`${f.id} chair must belong to ${fid}`);
        startingFactionChairs[fid] = f.id;
      }
    }
  }
  const membershipIds = Object.keys(partyDefinitions);
  if (membershipIds.length !== 0 && membershipIds.length !== 6) {
    throw new PartyContentError(`Expected 6 membership parties, found ${membershipIds.length}`);
  }
  if (membershipIds.length === 6) {
    if (Object.keys(factionDefinitions).length !== 15) {
      throw new PartyContentError(
        `Expected 15 factions, found ${Object.keys(factionDefinitions).length}`,
      );
    }
    for (const pid of membershipIds) {
      if (!startingPartyLeaders[pid]) throw new PartyContentError(`Missing leader for ${pid}`);
    }
    for (const fid of Object.keys(factionDefinitions)) {
      if (!startingFactionChairs[fid]) throw new PartyContentError(`Missing chair for ${fid}`);
    }
  }
  void figureIds;
  const constituencyProvinceShares: Record<
    string,
    Array<{ provinceId: string; share: number }>
  > = {};
  for (const c of input.constituencies ?? []) {
    constituencyProvinceShares[c.id] = c.provinceShares;
  }
  const partyProvinceBaseline: Record<string, Record<string, string>> = {};
  const provinceIds = (input.provinces ?? []).slice().sort();
  if (input.assemblyElection) {
    const acc: Record<string, Record<string, { n: number; d: number }>> = {};
    for (const c of input.assemblyElection.constituencies) {
      const shares = constituencyProvinceShares[c.constituencyId] ?? [];
      const partyOf = new Map(c.candidates.map((x) => [x.id, x.partyId]));
      for (const [cand, pref] of Object.entries(c.firstPreferences)) {
        const partyId = partyOf.get(cand);
        if (!partyId || partyId === independent || !partyDefinitions[partyId]) continue;
        const parts = pref.split("/").map(Number);
        const pn = parts[0];
        const pd = parts[1];
        if (
          pn === undefined ||
          pd === undefined ||
          !Number.isFinite(pn) ||
          !Number.isFinite(pd) ||
          pd === 0
        ) {
          continue;
        }
        for (const sh of shares) {
          const w = (pn / pd) * sh.share;
          acc[partyId] ??= {};
          acc[partyId]![sh.provinceId] ??= { n: 0, d: 1 };
          acc[partyId]![sh.provinceId]!.n += w;
        }
      }
    }
    for (const [partyId, byProv] of Object.entries(acc)) {
      partyProvinceBaseline[partyId] = {};
      let total = 0;
      for (const v of Object.values(byProv)) total += v.n;
      if (total <= 0) continue;
      for (const [prov, v] of Object.entries(byProv)) {
        partyProvinceBaseline[partyId]![prov] =
          `${Math.round(v.n * 1_000_000)}/${Math.round(total * 1_000_000)}`;
      }
    }
  }
  return {
    partyDefinitions,
    factionDefinitions,
    nominationRules,
    independentAggregatePartyId: independent,
    startingPartyLeaders,
    startingFactionChairs,
    provinceIds,
    politicianHomeProvince,
    constituencyProvinceShares,
    partyProvinceBaseline,
    provincialPartyOrganizations: buildProvincialPartyOrganizations(
      Object.keys(partyDefinitions),
      provinceIds,
    ),
    presidentialEligibility: DEFAULT_PRESIDENTIAL_ELIGIBILITY,
  };
}

export function emptyPartyKernelSlice(): ReturnType<typeof buildPartyKernelSlice> {
  return {
    partyDefinitions: {},
    factionDefinitions: {},
    nominationRules: {},
    independentAggregatePartyId: INDEPENDENT_AGGREGATE_ID,
    startingPartyLeaders: {},
    startingFactionChairs: {},
    provinceIds: [],
    politicianHomeProvince: {},
    constituencyProvinceShares: {},
    partyProvinceBaseline: {},
    provincialPartyOrganizations: {},
    presidentialEligibility: DEFAULT_PRESIDENTIAL_ELIGIBILITY,
  };
}
