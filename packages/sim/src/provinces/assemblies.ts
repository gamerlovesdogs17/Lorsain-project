import { addMonths, addYears, compareIsoDate, formatIsoDate } from "../calendar.js";
import { syntheticAgentProfile } from "../agents/profile.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { recordOrganizationPolicyBehavior } from "../organizations/monthly.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type {
  ProvincialAssemblyElection,
  ProvincialAssemblyState,
  ProvincialBill,
  ProvincialBillSubject,
  ProvincialLeadershipRecord,
  ProvincialLeadershipRole,
  ProvincialLegislator,
  ProvincialPromotion,
  ProvincialVote,
} from "./types.js";

const FIRST_NAMES = [
  "Adela", "Adrian", "Alina", "Andrej", "Anika", "Bastian", "Celia", "Dara", "Dorian",
  "Elian", "Eliska", "Emil", "Farah", "Gregor", "Hana", "Ilan", "Ines", "Jarek", "Jonas",
  "Kaja", "Kamil", "Klara", "Leona", "Lukas", "Mara", "Marek", "Mina", "Nadia", "Niko",
  "Noemi", "Oren", "Petra", "Rafael", "Sabina", "Sami", "Soren", "Talia", "Tomas", "Vera",
  "Viktor", "Yara", "Zora",
] as const;

const LAST_NAMES = [
  "Aldren", "Baric", "Belen", "Cevik", "Dalen", "Dobrev", "Eris", "Faron", "Galen",
  "Havel", "Ilyan", "Joric", "Kadar", "Kovren", "Laska", "Marin", "Narek", "Orlic",
  "Pavelic", "Quarin", "Radan", "Selic", "Taren", "Ulen", "Varik", "Walen", "Yoric",
  "Zelen", "Arven", "Borsic", "Cadan", "Delvar", "Esren", "Fedorin", "Gavric", "Horvat",
  "Iskar", "Jovan", "Kresic", "Leric", "Matic", "Novak", "Ostir", "Peran", "Ristic",
] as const;

const BACKGROUNDS = [
  "municipal administrator",
  "school board advocate",
  "transport planner",
  "small-business solicitor",
  "hospital administrator",
  "trade-union organizer",
  "agricultural cooperative director",
  "housing campaigner",
] as const;

const PRIORITIES = [
  "reliable local services",
  "housing delivery",
  "regional transport",
  "school capacity",
  "hospital access",
  "municipal accountability",
] as const;

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function stableProvincialHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function provincePopulation(world: KernelWorld, provinceId: string): number {
  let population = 0;
  for (const electorate of Object.values(world.constituencyElectorate)) {
    const share = electorate.provincePopulationShares.find((row) => row.provinceId === provinceId)?.share ?? 0;
    population += electorate.population * share;
  }
  return population;
}

export function provincialAssemblySeatCount(world: KernelWorld, provinceId: string): number {
  const rows = world.provinceIds.map((id) => provincePopulation(world, id));
  const min = Math.min(...rows);
  const max = Math.max(...rows);
  const value = provincePopulation(world, provinceId);
  if (!Number.isFinite(value) || max <= min) return 35;
  const scaled = Math.sqrt(Math.max(0, (value - min) / (max - min)));
  return Math.max(25, Math.min(65, Math.round(25 + scaled * 40)));
}

function membershipPartyIds(world: KernelWorld): string[] {
  return Object.keys(world.partyDefinitions)
    .filter((id) => id !== world.independentAggregatePartyId)
    .sort();
}

function numericBaseline(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function provincePartyWeights(world: KernelWorld, provinceId: string): Array<{ partyId: string; weight: number }> {
  const parties = membershipPartyIds(world);
  const rows = parties.map((partyId) => ({
    partyId,
    weight: numericBaseline(world.partyProvinceBaseline[partyId]?.[provinceId]),
  }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (total <= 0) return rows.map((row) => ({ ...row, weight: 1 / Math.max(1, rows.length) }));
  return rows.map((row) => ({ ...row, weight: row.weight / total }));
}

function allocateSeats(
  seatCount: number,
  weights: Array<{ partyId: string; weight: number }>,
  salt: string,
): Record<string, number> {
  const total = weights.reduce((sum, row) => sum + Math.max(0, row.weight), 0) || 1;
  const exact = weights.map((row) => ({
    partyId: row.partyId,
    exact: (Math.max(0, row.weight) / total) * seatCount,
  }));
  const seats: Record<string, number> = {};
  let allocated = 0;
  for (const row of exact) {
    seats[row.partyId] = Math.floor(row.exact);
    allocated += seats[row.partyId]!;
  }
  const remainder = exact
    .map((row) => ({
      ...row,
      fraction: row.exact - Math.floor(row.exact),
      tie: stableProvincialHash(`${salt}:${row.partyId}`),
    }))
    .sort((a, b) => b.fraction - a.fraction || a.tie - b.tie || a.partyId.localeCompare(b.partyId));
  for (let index = 0; allocated < seatCount; index += 1) {
    const row = remainder[index % Math.max(1, remainder.length)];
    if (!row) break;
    seats[row.partyId] = (seats[row.partyId] ?? 0) + 1;
    allocated += 1;
  }
  return seats;
}

function factionForParty(world: KernelWorld, partyId: string | null, salt: string): string | null {
  if (!partyId) return null;
  const ids = (world.partyDefinitions[partyId]?.factionIds ?? [])
    .filter((id) => world.factionDefinitions[id]?.partyId === partyId)
    .sort();
  return ids.length > 0 ? ids[stableProvincialHash(`${salt}:faction`) % ids.length]! : null;
}

function publicName(provinceIndex: number, ordinal: number): string {
  const unique = provinceIndex * 128 + ordinal;
  const first = FIRST_NAMES[unique % FIRST_NAMES.length]!;
  const familyCycle = Math.floor(unique / (FIRST_NAMES.length * LAST_NAMES.length));
  const suffix = ["", "a", "en", "ic"][familyCycle % 4]!;
  const last = `${LAST_NAMES[Math.floor(unique / FIRST_NAMES.length) % LAST_NAMES.length]!}${suffix}`;
  return `${first} ${last}`;
}

function newLegislator(
  world: KernelWorld,
  state: SimState,
  provinceId: string,
  ordinal: number,
  source: ProvincialLegislator["source"],
): ProvincialLegislator {
  const provinceIndex = Math.max(0, world.provinceIds.indexOf(provinceId));
  const id = `PLEG_${provinceId}_${String(ordinal).padStart(3, "0")}`;
  const weights = provincePartyWeights(world, provinceId);
  const pick = (stableProvincialHash(`${id}:party`) % 100000) / 100000;
  let cursor = 0;
  let partyId = weights.at(-1)?.partyId ?? null;
  for (const row of weights) {
    cursor += row.weight;
    if (pick <= cursor) {
      partyId = row.partyId;
      break;
    }
  }
  const name = publicName(provinceIndex, ordinal);
  const familyName = name.split(" ").at(-1) ?? name;
  const background = BACKGROUNDS[stableProvincialHash(`${id}:background`) % BACKGROUNDS.length]!;
  const priority = PRIORITIES[stableProvincialHash(`${id}:priority`) % PRIORITIES.length]!;
  return {
    id,
    displayName: name,
    description: `${name} entered public life after working as a ${background}. ${familyName}'s record centers on ${priority}.`,
    provinceId,
    partyId,
    factionId: factionForParty(world, partyId, id),
    birthYear: Number(state.currentDate.slice(0, 4)) - (28 + (stableProvincialHash(`${id}:age`) % 36)),
    active: true,
    source,
    careerStartDate: state.currentDate,
    serviceStartDate: null,
    serviceEndDate: null,
    standing: 0.25 + (stableProvincialHash(`${id}:standing`) % 46) / 100,
    legislativeSkill: 0.3 + (stableProvincialHash(`${id}:legislation`) % 56) / 100,
    campaignSkill: 0.25 + (stableProvincialHash(`${id}:campaign`) % 61) / 100,
    ambition: 0.25 + (stableProvincialHash(`${id}:ambition`) % 66) / 100,
    fullPoliticianId: null,
  };
}

function nextLegislatorOrdinal(state: SimState, provinceId: string): number {
  let max = 0;
  for (const id of Object.keys(state.provincialRuntime.legislators)) {
    const match = new RegExp(`^PLEG_${provinceId}_(\\d+)$`).exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function plannedAssemblyElection(provinceId: string, date: string): ProvincialAssemblyElection {
  return {
    id: `ELEC_PASM_${provinceId}_${date.slice(0, 4)}`,
    provinceId,
    date,
    status: "planned",
    candidateIds: [],
    playerDecision: null,
    partyVoteShares: {},
    partySeats: {},
    electedIds: [],
    turnoutRate: null,
  };
}

function leadershipScore(
  member: ProvincialLegislator,
  role: ProvincialLeadershipRole,
): number {
  if (role === "speaker") {
    return member.legislativeSkill * 0.58 + member.standing * 0.27 + member.ambition * 0.15;
  }
  if (role === "floor_leader") {
    return member.legislativeSkill * 0.46 + member.standing * 0.28 + member.ambition * 0.26;
  }
  return member.legislativeSkill * 0.34 + member.campaignSkill * 0.34 + member.standing * 0.18 + member.ambition * 0.14;
}

function leadershipBallot(
  state: SimState,
  assembly: ProvincialAssemblyState,
  role: ProvincialLeadershipRole,
  partyId: string | null,
  salt: string,
  explicitCandidateId: string | null = null,
): { candidateIds: string[]; ballots: Record<string, number>; winnerId: string | null } {
  const members = assembly.memberIds
    .map((id) => state.provincialRuntime.legislators[id])
    .filter((row): row is ProvincialLegislator => Boolean(row?.active))
    .filter((row) => partyId == null || row.partyId === partyId);
  const npcCandidates = members
    .filter((row) => row.id !== state.playerPoliticianId)
    .sort((a, b) => leadershipScore(b, role) - leadershipScore(a, role) || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((row) => row.id);
  const candidateIds = [...new Set([
    ...(explicitCandidateId && members.some((row) => row.id === explicitCandidateId)
      ? [explicitCandidateId]
      : []),
    ...npcCandidates,
  ])].sort();
  if (candidateIds.length === 0) return { candidateIds: [], ballots: {}, winnerId: null };
  const ballots = Object.fromEntries(candidateIds.map((id) => [id, 0]));
  for (const voter of members) {
    const preferred = candidateIds
      .map((candidateId) => {
        const candidate = state.provincialRuntime.legislators[candidateId]!;
        const factionAffinity = voter.factionId && voter.factionId === candidate.factionId ? 0.1 : 0;
        const localVariance = (stableProvincialHash(`${salt}:${voter.id}:${candidateId}`) % 1000) / 10000;
        return { candidateId, score: leadershipScore(candidate, role) + factionAffinity + localVariance };
      })
      .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId))[0]?.candidateId;
    if (preferred) ballots[preferred] = (ballots[preferred] ?? 0) + 1;
  }
  const winnerId = candidateIds
    .slice()
    .sort((a, b) => (ballots[b] ?? 0) - (ballots[a] ?? 0) || stableProvincialHash(`${salt}:tie:${a}`) - stableProvincialHash(`${salt}:tie:${b}`) || a.localeCompare(b))[0] ?? null;
  return { candidateIds, ballots, winnerId };
}

function leadershipRecord(
  assembly: ProvincialAssemblyState,
  role: ProvincialLeadershipRole,
  partyId: string | null,
  result: ReturnType<typeof leadershipBallot>,
  trigger: ProvincialLeadershipRecord["trigger"],
  date: string,
): ProvincialLeadershipRecord {
  return {
    id: `PLEAD_${assembly.provinceId}_${String(assembly.leadershipHistory.length + 1).padStart(5, "0")}`,
    date,
    provinceId: assembly.provinceId,
    role,
    partyId,
    candidateIds: result.candidateIds,
    ballots: result.ballots,
    winnerId: result.winnerId,
    trigger,
  };
}

function assignProvincialLeadership(
  state: SimState,
  assembly: ProvincialAssemblyState,
  salt: string,
  recordElection: boolean,
): void {
  assembly.partyLeadership ??= {};
  assembly.leadershipHistory ??= [];
  const speaker = leadershipBallot(state, assembly, "speaker", null, `${salt}:speaker`);
  assembly.presidingOfficerId = speaker.winnerId;
  if (recordElection) {
    assembly.leadershipHistory.push(
      leadershipRecord(assembly, "speaker", null, speaker, "general_election", state.currentDate),
    );
  }
  const partyIds = [...new Set(
    assembly.memberIds
      .map((id) => state.provincialRuntime.legislators[id]?.partyId)
      .filter((id): id is string => Boolean(id)),
  )].sort();
  const leadership: ProvincialAssemblyState["partyLeadership"] = {};
  for (const partyId of partyIds) {
    const floor = leadershipBallot(state, assembly, "floor_leader", partyId, `${salt}:${partyId}:floor`);
    const whip = leadershipBallot(state, assembly, "whip", partyId, `${salt}:${partyId}:whip`);
    leadership[partyId] = {
      partyId,
      floorLeaderId: floor.winnerId,
      whipId: whip.winnerId === floor.winnerId
        ? whip.candidateIds.find((id) => id !== floor.winnerId) ?? null
        : whip.winnerId,
      selectedDate: state.currentDate,
    };
    if (recordElection) {
      assembly.leadershipHistory.push(
        leadershipRecord(assembly, "floor_leader", partyId, floor, "general_election", state.currentDate),
        leadershipRecord(assembly, "whip", partyId, { ...whip, winnerId: leadership[partyId]!.whipId }, "general_election", state.currentDate),
      );
    }
  }
  assembly.partyLeadership = leadership;
}

export function seedProvincialAssemblies(world: KernelWorld, state: SimState): void {
  for (const provinceId of world.provinceIds) {
    const seatCount = provincialAssemblySeatCount(world, provinceId);
    const reserveTarget = seatCount + Math.max(10, Math.ceil(seatCount * 0.45));
    let ordinal = nextLegislatorOrdinal(state, provinceId);
    while (
      Object.values(state.provincialRuntime.legislators).filter(
        (row) => row.provinceId === provinceId && row.active,
      ).length < reserveTarget
    ) {
      const row = newLegislator(world, state, provinceId, ordinal, "scenario");
      state.provincialRuntime.legislators[row.id] = row;
      ordinal += 1;
    }
    if (!state.provincialRuntime.assemblies[provinceId]) {
      const pool = Object.values(state.provincialRuntime.legislators)
        .filter((row) => row.provinceId === provinceId && row.active)
        .sort((a, b) => b.standing + b.legislativeSkill * 0.35 - (a.standing + a.legislativeSkill * 0.35) || a.id.localeCompare(b.id));
      const partySeats = allocateSeats(seatCount, provincePartyWeights(world, provinceId), `${provinceId}:2028`);
      const selected: string[] = [];
      for (const [partyId, count] of Object.entries(partySeats).sort(([a], [b]) => a.localeCompare(b))) {
        selected.push(...pool.filter((row) => row.partyId === partyId && !selected.includes(row.id)).slice(0, count).map((row) => row.id));
      }
      selected.push(...pool.filter((row) => !selected.includes(row.id)).slice(0, seatCount - selected.length).map((row) => row.id));
      for (const id of selected) {
        const row = state.provincialRuntime.legislators[id]!;
        row.serviceStartDate = state.currentDate;
      }
      const nextElectionDate = `${Number(state.scenarioStartDate.slice(0, 4)) + 1}-10-01`;
      state.provincialRuntime.assemblies[provinceId] = {
        provinceId,
        seatCount,
        memberIds: selected,
        partySeats,
        presidingOfficerId: selected.slice().sort((a, b) => {
          const pa = state.provincialRuntime.legislators[a]!;
          const pb = state.provincialRuntime.legislators[b]!;
          return pb.legislativeSkill - pa.legislativeSkill || a.localeCompare(b);
        })[0] ?? null,
        partyLeadership: {},
        leadershipHistory: [],
        termStartDate: state.currentDate,
        nextElectionDate,
        sessionLabel: `${state.currentDate.slice(0, 4)}–${nextElectionDate.slice(0, 4)} Provincial Assembly`,
        agendaBillIds: [],
      };
      const election = plannedAssemblyElection(provinceId, nextElectionDate);
      state.provincialRuntime.assemblyElections[election.id] = election;
    }
    const assembly = state.provincialRuntime.assemblies[provinceId]!;
    assembly.leadershipHistory ??= [];
    if (!assembly.partyLeadership || Object.keys(assembly.partyLeadership).length === 0) {
      assignProvincialLeadership(state, assembly, `${provinceId}:${assembly.termStartDate}:initial`, false);
    }
  }
  seedRuntimeConstitution(state);
}

function seedRuntimeConstitution(state: SimState): void {
  const rules = state.provincialRuntime.constitutionalRules;
  rules.assembly_term_years ??= { id: "assembly_term_years", label: "Assembly term", value: 4, unit: "years", amendedDate: null, sourceAmendmentId: null };
  rules.presidential_term_limit ??= { id: "presidential_term_limit", label: "Presidential elected-term limit", value: 2, unit: "terms", amendedDate: null, sourceAmendmentId: null };
  rules.court_term_years ??= { id: "court_term_years", label: "Constitutional Court term", value: 12, unit: "years", amendedDate: null, sourceAmendmentId: null };
  rules.veto_override_fraction ??= { id: "veto_override_fraction", label: "Provincial veto override", value: 2 / 3, unit: "fraction", amendedDate: null, sourceAmendmentId: null };
}

function ensureProvincialReserve(world: KernelWorld, state: SimState, provinceId: string): number {
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!assembly) return 0;
  const target = assembly.seatCount + Math.max(10, Math.ceil(assembly.seatCount * 0.45));
  let living = Object.values(state.provincialRuntime.legislators).filter(
    (row) => row.provinceId === provinceId && row.active,
  ).length;
  let created = 0;
  let ordinal = nextLegislatorOrdinal(state, provinceId);
  while (living < target) {
    const row = newLegislator(world, state, provinceId, ordinal, "recruited");
    state.provincialRuntime.legislators[row.id] = row;
    living += 1;
    created += 1;
    ordinal += 1;
  }
  return created;
}

function openProvincialAssemblyElection(state: SimState, election: ProvincialAssemblyElection): void {
  election.status = "filing_open";
  election.candidateIds = Object.values(state.provincialRuntime.legislators)
    .filter((row) => row.provinceId === election.provinceId && row.active && row.fullPoliticianId == null)
    .map((row) => row.id)
    .sort();
}

function resolveProvincialAssemblyElection(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  election: ProvincialAssemblyElection,
  commandId: string,
): SimEvent[] {
  const assembly = state.provincialRuntime.assemblies[election.provinceId];
  if (!assembly) return [];
  const weights = provincePartyWeights(world, election.provinceId).map((row) => ({
    ...row,
    weight: Math.max(0.01, row.weight * (0.94 + rng.float01("elections") * 0.12)),
  }));
  const total = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
  election.partyVoteShares = Object.fromEntries(weights.map((row) => [row.partyId, row.weight / total]));
  election.partySeats = allocateSeats(assembly.seatCount, weights, election.id);
  const oldMembers = new Set(assembly.memberIds);
  const pool = election.candidateIds
    .map((id) => state.provincialRuntime.legislators[id])
    .filter((row): row is ProvincialLegislator => Boolean(row?.active))
    .sort((a, b) => {
      const aInc = oldMembers.has(a.id) ? 0.12 : 0;
      const bInc = oldMembers.has(b.id) ? 0.12 : 0;
      const as = a.standing * 0.48 + a.campaignSkill * 0.3 + a.legislativeSkill * 0.22 + aInc;
      const bs = b.standing * 0.48 + b.campaignSkill * 0.3 + b.legislativeSkill * 0.22 + bInc;
      return bs - as || stableProvincialHash(`${election.id}:${a.id}`) - stableProvincialHash(`${election.id}:${b.id}`);
    });
  const elected: string[] = [];
  for (const [partyId, count] of Object.entries(election.partySeats).sort(([a], [b]) => a.localeCompare(b))) {
    elected.push(...pool.filter((row) => row.partyId === partyId && !elected.includes(row.id)).slice(0, count).map((row) => row.id));
  }
  elected.push(...pool.filter((row) => !elected.includes(row.id)).slice(0, assembly.seatCount - elected.length).map((row) => row.id));
  if (election.playerDecision === "filed" && !elected.includes(state.playerPoliticianId)) {
    const playerRow = state.provincialRuntime.legislators[state.playerPoliticianId];
    if (playerRow && playerRow.provinceId === election.provinceId && playerRow.active) {
      let samePartyIndex = -1;
      for (let index = elected.length - 1; index >= 0; index -= 1) {
        if (state.provincialRuntime.legislators[elected[index]!]?.partyId === playerRow.partyId) {
          samePartyIndex = index;
          break;
        }
      }
      if (samePartyIndex >= 0 && playerRow.campaignSkill + playerRow.standing >= 0.9) elected[samePartyIndex] = playerRow.id;
    }
  }
  for (const id of assembly.memberIds) {
    const row = state.provincialRuntime.legislators[id];
    if (row && !elected.includes(id)) row.serviceEndDate = state.currentDate;
  }
  for (const id of elected) {
    const row = state.provincialRuntime.legislators[id];
    if (row) {
      row.serviceStartDate ??= state.currentDate;
      row.serviceEndDate = null;
    }
  }
  assembly.memberIds = elected;
  assembly.partySeats = { ...election.partySeats };
  assembly.termStartDate = state.currentDate;
  const termYears = state.provincialRuntime.constitutionalRules.assembly_term_years?.value ?? 4;
  assembly.nextElectionDate = addYears(election.date, termYears);
  assembly.sessionLabel = `${election.date.slice(0, 4)}–${assembly.nextElectionDate.slice(0, 4)} Provincial Assembly`;
  assignProvincialLeadership(state, assembly, `${election.id}:leadership`, true);
  election.electedIds = [...elected];
  election.turnoutRate = 0.48 + rng.float01("elections") * 0.19;
  election.status = "resolved";
  const next = plannedAssemblyElection(election.provinceId, assembly.nextElectionDate);
  state.provincialRuntime.assemblyElections[next.id] = next;
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "PROVINCIAL_ASSEMBLY_ELECTION_RESOLVED",
      importance: 0.58,
      visibility: "public",
      actorIds: [],
      entityIds: [election.id, election.provinceId],
      payload: { electionId: election.id, provinceId: election.provinceId, seatCount: assembly.seatCount, partySeats: election.partySeats },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

const BILL_COPY: Record<ProvincialBillSubject, { titles: string[]; summaries: string[] }> = {
  transport_service: {
    titles: ["Regional Bus Reliability Act", "Provincial Roads Maintenance Act", "Rural Connections Act"],
    summaries: ["Sets service and maintenance priorities for the provincial transport network.", "Directs provincial capacity toward overdue road and transit work."],
  },
  housing_delivery: {
    titles: ["Homes Delivery Act", "Vacant Sites Renewal Act", "Municipal Housing Partnership Act"],
    summaries: ["Coordinates provincial land and administrative support for new homes.", "Speeds reuse of serviced sites while preserving municipal approval."],
  },
  school_capacity: {
    titles: ["Classroom Capacity Act", "Provincial Schools Renewal Act", "Teacher Placement Act"],
    summaries: ["Targets additional school capacity in districts under sustained pressure.", "Prioritizes repairs and staffing support across provincial schools."],
  },
  hospital_access: {
    titles: ["Community Clinics Act", "Provincial Care Access Act", "Hospital Capacity Act"],
    summaries: ["Expands access points for routine and urgent care.", "Directs provincial administration toward hospital and clinic capacity."],
  },
  local_administration: {
    titles: ["Municipal Accounts Act", "Local Services Coordination Act", "Provincial Procurement Act"],
    summaries: ["Strengthens reporting and coordination for provincial service delivery.", "Sets clearer procurement and public reporting duties."],
  },
};

function createAnnualProvincialBill(state: SimState, provinceId: string): ProvincialBill | null {
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!assembly || assembly.memberIds.length === 0) return null;
  const year = state.currentDate.slice(0, 4);
  if (Object.values(state.provincialRuntime.bills).some((bill) => bill.provinceId === provinceId && bill.introducedDate.slice(0, 4) === year)) return null;
  const subjects = Object.keys(BILL_COPY) as ProvincialBillSubject[];
  const subject = subjects[stableProvincialHash(`${provinceId}:${year}:subject`) % subjects.length]!;
  const copy = BILL_COPY[subject];
  const title = copy.titles[stableProvincialHash(`${provinceId}:${year}:title`) % copy.titles.length]!;
  const summary = copy.summaries[stableProvincialHash(`${provinceId}:${year}:summary`) % copy.summaries.length]!;
  const sponsorId = assembly.memberIds[stableProvincialHash(`${provinceId}:${year}:sponsor`) % assembly.memberIds.length]!;
  const id = `PBILL_${provinceId}_${year}`;
  const bill: ProvincialBill = {
    id,
    provinceId,
    title,
    summary,
    subject,
    sponsorId,
    introducedDate: state.currentDate,
    status: "introduced",
    voteId: null,
    governorDispositionDate: null,
    effectStrength: 0.35 + (stableProvincialHash(`${id}:effect`) % 31) / 100,
  };
  state.provincialRuntime.bills[id] = bill;
  assembly.agendaBillIds.push(id);
  return bill;
}

function recordProvincialVote(
  state: SimState,
  bill: ProvincialBill,
  kind: ProvincialVote["subjectKind"],
): ProvincialVote {
  const assembly = state.provincialRuntime.assemblies[bill.provinceId]!;
  const votes: ProvincialVote["votes"] = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const memberId of assembly.memberIds) {
    const row = state.provincialRuntime.legislators[memberId];
    const support = stableProvincialHash(`${bill.id}:${kind}:${memberId}`) % 100;
    const pendingId = `pending:${kind}:${bill.id}:${memberId}`;
    const pending = state.provincialRuntime.votes[pendingId]?.votes[memberId];
    const choice = pending ?? (memberId === state.playerPoliticianId
      ? "abstain"
      : support < 58 + Math.round((row?.legislativeSkill ?? 0.5) * 12)
        ? "yes"
        : support < 94
          ? "no"
          : "abstain");
    votes[memberId] = choice;
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
    delete state.provincialRuntime.votes[pendingId];
  }
  const overrideFraction =
    state.provincialRuntime.constitutionalRules.veto_override_fraction?.value ?? 2 / 3;
  const required = kind === "veto_override" ? Math.ceil(assembly.seatCount * overrideFraction) : Math.floor((yes + no) / 2) + 1;
  const id = `PVOTE_${String(Object.keys(state.provincialRuntime.votes).length + 1).padStart(6, "0")}`;
  const vote: ProvincialVote = { id, provinceId: bill.provinceId, subjectKind: kind, subjectId: bill.id, date: state.currentDate, votes, yes, no, abstain, passed: yes >= required };
  state.provincialRuntime.votes[id] = vote;
  return vote;
}

function progressProvincialBills(world: KernelWorld, state: SimState, commandId: string): SimEvent[] {
  const events: SimEvent[] = [];
  for (const bill of Object.values(state.provincialRuntime.bills).sort((a, b) => a.id.localeCompare(b.id))) {
    if (bill.status === "introduced" && compareIsoDate(state.currentDate, addMonths(bill.introducedDate, 1)) >= 0) {
      const vote = recordProvincialVote(state, bill, "bill");
      bill.voteId = vote.id;
      bill.status = vote.passed ? "passed" : "failed";
      events.push(pushHistory(state, { date: state.currentDate, type: "PROVINCIAL_BILL_VOTE", importance: 0.42, visibility: "public", actorIds: [bill.sponsorId], entityIds: [bill.id, vote.id, bill.provinceId], payload: { billId: bill.id, provinceId: bill.provinceId, yes: vote.yes, no: vote.no, abstain: vote.abstain, passed: vote.passed }, sourceScheduledEventId: null, sourceCommandId: commandId }));
      continue;
    }
    if (bill.status !== "passed") continue;
    const governorId = Object.values(state.officeTerms).find((term) => {
      const office = world.offices[term.officeId];
      return term.status === "active" && office?.kind === "governor" && office.provinceId === bill.provinceId;
    })?.holderId ?? null;
    if (!governorId || governorId === state.playerPoliticianId) continue;
    const sign = stableProvincialHash(`${bill.id}:${governorId}:disposition`) % 100 >= 24;
    bill.status = sign ? "signed" : "vetoed";
    bill.governorDispositionDate = state.currentDate;
    events.push(pushHistory(state, { date: state.currentDate, type: sign ? "PROVINCIAL_BILL_SIGNED" : "PROVINCIAL_BILL_VETOED", importance: 0.48, visibility: "public", actorIds: [governorId, bill.sponsorId], entityIds: [bill.id, bill.provinceId], payload: { billId: bill.id, provinceId: bill.provinceId }, sourceScheduledEventId: null, sourceCommandId: commandId }));
  }
  for (const bill of Object.values(state.provincialRuntime.bills).sort((a, b) => a.id.localeCompare(b.id))) {
    if (bill.status !== "vetoed" || !bill.governorDispositionDate) continue;
    if (compareIsoDate(state.currentDate, addMonths(bill.governorDispositionDate, 1)) < 0) continue;
    const vote = recordProvincialVote(state, bill, "veto_override");
    bill.status = vote.passed ? "override_passed" : "override_failed";
    const overrideFraction = state.provincialRuntime.constitutionalRules.veto_override_fraction?.value ?? 2 / 3;
    events.push(pushHistory(state, { date: state.currentDate, type: vote.passed ? "PROVINCIAL_VETO_OVERRIDDEN" : "PROVINCIAL_VETO_SUSTAINED", importance: 0.52, visibility: "public", actorIds: [bill.sponsorId], entityIds: [bill.id, vote.id, bill.provinceId], payload: { billId: bill.id, provinceId: bill.provinceId, yes: vote.yes, no: vote.no, abstain: vote.abstain, required: Math.ceil((state.provincialRuntime.assemblies[bill.provinceId]?.seatCount ?? 0) * overrideFraction) }, sourceScheduledEventId: null, sourceCommandId: commandId }));
  }
  return events;
}

export function processProvincialAssembliesMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  seedProvincialAssemblies(world, state);
  const events: SimEvent[] = [];
  const month = state.currentDate.slice(5, 7);
  if (month === "01") {
    let created = 0;
    for (const provinceId of world.provinceIds) created += ensureProvincialReserve(world, state, provinceId);
    if (created > 0) events.push(pushHistory(state, { date: state.currentDate, type: "PROVINCIAL_POLITICAL_RECRUITMENT", importance: 0.18, visibility: "system", actorIds: [], entityIds: [], payload: { recruits: created }, sourceScheduledEventId: null, sourceCommandId: commandId }));
  }
  for (const election of Object.values(state.provincialRuntime.assemblyElections).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (election.status === "planned" && compareIsoDate(state.currentDate, addMonths(election.date, -5)) >= 0) openProvincialAssemblyElection(state, election);
    if (election.status === "filing_open" && compareIsoDate(state.currentDate, election.date) >= 0) events.push(...resolveProvincialAssemblyElection(world, state, rng, election, commandId));
  }
  if (month === "03") {
    for (const provinceId of world.provinceIds) {
      const bill = createAnnualProvincialBill(state, provinceId);
      if (bill) events.push(pushHistory(state, { date: state.currentDate, type: "PROVINCIAL_BILL_INTRODUCED", importance: 0.32, visibility: "public", actorIds: [bill.sponsorId], entityIds: [bill.id, provinceId], payload: { billId: bill.id, provinceId, title: bill.title, subject: bill.subject }, sourceScheduledEventId: null, sourceCommandId: commandId }));
    }
  }
  events.push(...progressProvincialBills(world, state, commandId));
  return events;
}

export function fileProvincialAssemblyCandidacy(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  electionId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (politicianId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "The player may only file their own provincial candidacy") };
  const election = state.provincialRuntime.assemblyElections[electionId];
  if (!election || election.status !== "filing_open") return { error: reject("FILING_CLOSED", electionId) };
  const pol = state.politicians[politicianId];
  if (!pol?.alive || pol.retired) return { error: reject("INELIGIBLE", politicianId) };
  const home = pol.homeProvinceId ?? world.politicianHomeProvince[politicianId];
  if (home !== election.provinceId) return { error: reject("PROVINCIAL_RESIDENCY", `${politicianId} is not resident in ${election.provinceId}`) };
  if (election.playerDecision != null) return { error: reject("DECISION_ALREADY_MADE", electionId) };
  state.provincialRuntime.legislators[politicianId] = {
    id: politicianId,
    displayName: pol.displayName ?? politicianId,
    description: pol.description ?? "A candidate seeking a first term in the Provincial Assembly.",
    provinceId: election.provinceId,
    partyId: pol.partyId,
    factionId: pol.factionId,
    birthYear: Number(state.currentDate.slice(0, 4)) - 40,
    active: true,
    source: "player",
    careerStartDate: state.currentDate,
    serviceStartDate: null,
    serviceEndDate: null,
    standing: 0.5,
    legislativeSkill: 0.55,
    campaignSkill: 0.55,
    ambition: 0.6,
    fullPoliticianId: politicianId,
  };
  election.candidateIds = [...new Set([...election.candidateIds, politicianId])].sort();
  election.playerDecision = "filed";
  return { events: [pushHistory(state, { date: state.currentDate, type: "PROVINCIAL_ASSEMBLY_CANDIDACY_FILED", importance: 0.46, visibility: "public", actorIds: [politicianId], entityIds: [election.id, election.provinceId], payload: { electionId: election.id, provinceId: election.provinceId }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}

export function declineProvincialAssemblyCandidacy(
  state: SimState,
  politicianId: string,
  electionId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (politicianId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "The player may only decline their own candidacy") };
  const election = state.provincialRuntime.assemblyElections[electionId];
  if (!election || election.status !== "filing_open") return { error: reject("FILING_CLOSED", electionId) };
  if (election.playerDecision != null) return { error: reject("DECISION_ALREADY_MADE", electionId) };
  election.playerDecision = "declined";
  return { events: [pushHistory(state, { date: state.currentDate, type: "PROVINCIAL_ASSEMBLY_CANDIDACY_DECLINED", importance: 0.18, visibility: "system", actorIds: [politicianId], entityIds: [election.id], payload: { electionId }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}

export function seekProvincialLeadership(
  state: SimState,
  actorId: string,
  provinceId: string,
  role: ProvincialLeadershipRole,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", "The player may only enter their own leadership contest") };
  }
  const assembly = state.provincialRuntime.assemblies[provinceId];
  const member = state.provincialRuntime.legislators[actorId];
  if (!assembly || !member || !member.active || !assembly.memberIds.includes(actorId)) {
    return { error: reject("NOT_PROVINCIAL_LEGISLATOR", actorId) };
  }
  assembly.partyLeadership ??= {};
  assembly.leadershipHistory ??= [];
  if (assembly.leadershipHistory.some(
    (record) => record.date === state.currentDate && record.role === role && record.candidateIds.includes(actorId),
  )) {
    return { error: reject("LEADERSHIP_ATTEMPT_USED", "Only one contest for this role may be entered each month") };
  }
  const partyId = role === "speaker" ? null : member.partyId;
  if (role !== "speaker" && !partyId) {
    return { error: reject("PARTY_LEADERSHIP_REQUIRES_PARTY", actorId) };
  }
  const result = leadershipBallot(
    state,
    assembly,
    role,
    partyId,
    `${provinceId}:${state.currentDate}:${role}:${partyId ?? "chamber"}`,
    actorId,
  );
  const record = leadershipRecord(
    assembly,
    role,
    partyId,
    result,
    "player_challenge",
    state.currentDate,
  );
  assembly.leadershipHistory.push(record);
  if (role === "speaker") {
    assembly.presidingOfficerId = result.winnerId;
  } else if (partyId) {
    const current = assembly.partyLeadership[partyId] ?? {
      partyId,
      floorLeaderId: null,
      whipId: null,
      selectedDate: state.currentDate,
    };
    if (role === "floor_leader") {
      current.floorLeaderId = result.winnerId;
      if (current.whipId === result.winnerId) current.whipId = null;
    } else {
      current.whipId = result.winnerId;
      if (current.floorLeaderId === result.winnerId) current.floorLeaderId = null;
    }
    current.selectedDate = state.currentDate;
    assembly.partyLeadership[partyId] = current;
  }
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "PROVINCIAL_LEADERSHIP_ELECTION_RESOLVED",
        importance: 0.42,
        visibility: "public",
        actorIds: [...new Set([actorId, ...(result.winnerId ? [result.winnerId] : [])])],
        entityIds: [record.id, provinceId],
        payload: {
          provinceId,
          role,
          partyId,
          winnerId: result.winnerId,
          candidateIds: result.candidateIds,
          ballots: result.ballots,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function governorProvincialBillDisposition(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  billId: string,
  disposition: "sign" | "veto",
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const bill = state.provincialRuntime.bills[billId];
  if (!bill || bill.status !== "passed") return { error: reject("BILL_NOT_PENDING", billId) };
  const governor = Object.values(state.officeTerms).some((term) => {
    const office = world.offices[term.officeId];
    return term.status === "active" && term.holderId === actorId && office?.kind === "governor" && office.provinceId === bill.provinceId;
  });
  if (!governor) return { error: reject("NOT_PROVINCIAL_GOVERNOR", actorId) };
  bill.status = disposition === "sign" ? "signed" : "vetoed";
  bill.governorDispositionDate = state.currentDate;
  recordOrganizationPolicyBehavior(world, state, {
    politicianId: actorId,
    policyItems: [provincialBillPolicyItem(bill.subject)],
    behavior: disposition,
  });
  return { events: [pushHistory(state, { date: state.currentDate, type: disposition === "sign" ? "PROVINCIAL_BILL_SIGNED" : "PROVINCIAL_BILL_VETOED", importance: 0.5, visibility: "public", actorIds: [actorId, bill.sponsorId], entityIds: [bill.id, bill.provinceId], payload: { billId: bill.id, provinceId: bill.provinceId }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}

export function governorProposeProvincialBill(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  provinceId: string,
  subject: ProvincialBillSubject,
  commandId: string | null,
): { bill: ProvincialBill; events: SimEvent[] } | { error: CommandError } {
  const governor = Object.values(state.officeTerms).some((term) => {
    const office = world.offices[term.officeId];
    return term.status === "active" && term.holderId === actorId && office?.kind === "governor" && office.provinceId === provinceId;
  });
  if (!governor) return { error: reject("NOT_PROVINCIAL_GOVERNOR", actorId) };
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!assembly) return { error: reject("UNKNOWN_PROVINCIAL_ASSEMBLY", provinceId) };
  const openGovernorBill = Object.values(state.provincialRuntime.bills).some(
    (bill) => bill.provinceId === provinceId && bill.sponsorId === actorId && ["introduced", "passed"].includes(bill.status),
  );
  if (openGovernorBill) return { error: reject("PROVINCIAL_AGENDA_BUSY", "The Governor already has legislation before the Assembly") };
  const copy = BILL_COPY[subject];
  if (!copy) return { error: reject("INVALID_PROVINCIAL_SUBJECT", subject) };
  const sequence = Object.keys(state.provincialRuntime.bills).length + 1;
  const id = `PBILL_GOV_${String(sequence).padStart(6, "0")}`;
  const bill: ProvincialBill = {
    id,
    provinceId,
    title: copy.titles[stableProvincialHash(`${id}:title`) % copy.titles.length]!,
    summary: copy.summaries[stableProvincialHash(`${id}:summary`) % copy.summaries.length]!,
    subject,
    sponsorId: actorId,
    introducedDate: state.currentDate,
    status: "introduced",
    voteId: null,
    governorDispositionDate: null,
    effectStrength: 0.4 + (stableProvincialHash(`${id}:effect`) % 21) / 100,
  };
  state.provincialRuntime.bills[id] = bill;
  assembly.agendaBillIds = [...new Set([...assembly.agendaBillIds, id])];
  recordOrganizationPolicyBehavior(world, state, {
    politicianId: actorId,
    policyItems: [provincialBillPolicyItem(subject)],
    behavior: "sponsor",
  });
  return { bill, events: [pushHistory(state, { date: state.currentDate, type: "GOVERNOR_PROVINCIAL_BILL_PROPOSED", importance: 0.48, visibility: "public", actorIds: [actorId], entityIds: [id, provinceId], payload: { billId: id, provinceId, title: bill.title, subject }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}

function provincialBillPolicyItem(subject: ProvincialBillSubject): { issueId: string; direction: number } {
  switch (subject) {
    case "housing_delivery":
      return { issueId: "ISS_HOUSING", direction: 1 };
    case "school_capacity":
    case "hospital_access":
      return { issueId: "ISS_WELFARE", direction: 1 };
    case "local_administration":
      return { issueId: "ISS_REFORM", direction: 1 };
    case "transport_service":
      return { issueId: "ISS_TRADE", direction: 1 };
  }
}

export function castProvincialBillVote(
  state: SimState,
  actorId: string,
  billId: string,
  choice: "yes" | "no" | "abstain",
): { error?: CommandError } {
  if (actorId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "Only the player records this vote") };
  const bill = state.provincialRuntime.bills[billId];
  if (!bill || bill.status !== "introduced") return { error: reject("PROVINCIAL_BILL_NOT_OPEN", billId) };
  const assembly = state.provincialRuntime.assemblies[bill.provinceId];
  if (!assembly?.memberIds.includes(actorId)) return { error: reject("NOT_PROVINCIAL_LEGISLATOR", actorId) };
  const id = `pending:bill:${billId}:${actorId}`;
  state.provincialRuntime.votes[id] = { id, provinceId: bill.provinceId, subjectKind: "bill", subjectId: billId, date: state.currentDate, votes: { [actorId]: choice }, yes: choice === "yes" ? 1 : 0, no: choice === "no" ? 1 : 0, abstain: choice === "abstain" ? 1 : 0, passed: false };
  return {};
}

function promotionScore(row: ProvincialLegislator): number {
  return row.ambition * 0.35 + row.campaignSkill * 0.28 + row.standing * 0.24 + row.legislativeSkill * 0.13;
}

export function promoteProvincialCandidate(
  world: KernelWorld,
  state: SimState,
  legislatorId: string,
  reason: ProvincialPromotion["reason"] = "federal_recruitment",
): string | null {
  const row = state.provincialRuntime.legislators[legislatorId];
  if (!row?.active) return null;
  if (row.fullPoliticianId && state.politicians[row.fullPoliticianId]) return row.fullPoliticianId;
  const politicianId = `POL_${legislatorId}`;
  const birthMonth = 1 + (stableProvincialHash(`${legislatorId}:birth-month`) % 12);
  const birthDay = 1 + (stableProvincialHash(`${legislatorId}:birth-day`) % 28);
  state.politicians[politicianId] = {
    id: politicianId,
    alive: true,
    retired: false,
    partyId: row.partyId,
    factionId: row.factionId,
    homeProvinceId: row.provinceId,
    displayName: row.displayName,
    description: row.description,
  };
  const ideology = row.partyId ? world.partyPublicIdeology[row.partyId] : undefined;
  const roleTypes = ["provincial_legislator", "candidate"];
  if (/solicitor/i.test(row.description)) roleTypes.push("senior_lawyer");
  const profile = syntheticAgentProfile(politicianId, {
    birthDate: formatIsoDate(row.birthYear, birthMonth, birthDay),
    roleTypes,
    issueSalience: Object.fromEntries(
      world.issueIds.map((issueId) => [
        issueId,
        0.2 + (stableProvincialHash(`${legislatorId}:${issueId}:salience`) % 61) / 100,
      ]),
    ),
    ...(ideology ? { ideology } : {}),
  });
  profile.traits.ambition = row.ambition;
  profile.traits.retirementInclination =
    0.2 + (stableProvincialHash(`${legislatorId}:retirement`) % 35) / 100;
  profile.skills.campaigning = row.campaignSkill;
  profile.skills.legislation = row.legislativeSkill;
  profile.skills.fundraising =
    0.35 + (stableProvincialHash(`${legislatorId}:fundraising`) % 45) / 100;
  state.generatedAgentProfiles[politicianId] = profile;
  row.fullPoliticianId = politicianId;
  const id = `PROMO_${String(Object.keys(state.provincialRuntime.promotions).length + 1).padStart(6, "0")}`;
  state.provincialRuntime.promotions[id] = { id, date: state.currentDate, provinceId: row.provinceId, legislatorId, politicianId, reason };
  return politicianId;
}

/**
 * Build a visible federal recruitment class before filing allocation. This
 * promotes politicians who already existed in Provincial Assemblies; it never
 * invents a candidate at count or resolution time.
 */
export function recruitFederalAssemblyClass(
  world: KernelWorld,
  state: SimState,
  electionId: string,
  requestedPromotions?: number,
): string[] {
  seedProvincialAssemblies(world, state);
  const seatTotal = Object.values(world.constituencyElectorate).reduce((sum, row) => sum + row.seats, 0);
  const eligibleFull = Object.values(state.politicians).filter((row) => row.alive && !row.retired).length;
  const target = Math.ceil(seatTotal * 1.35);
  const needed = Math.max(
    0,
    requestedPromotions ?? target - eligibleFull,
  );
  if (needed === 0) return [];
  const pool = Object.values(state.provincialRuntime.legislators)
    .filter((row) => row.active && row.fullPoliticianId == null)
    .sort((a, b) => promotionScore(b) - promotionScore(a) || stableProvincialHash(`${electionId}:${a.id}`) - stableProvincialHash(`${electionId}:${b.id}`));
  const promoted: string[] = [];
  for (const row of pool.slice(0, needed)) {
    const id = promoteProvincialCandidate(world, state, row.id);
    if (id) promoted.push(id);
  }
  return promoted;
}
