import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allocateSeats } from "./allocate_seats.ts";
import { archetypeHabitWarnings, buildConstituencyBlocs } from "./archetypes.ts";
import {
  calibrateNationalElection,
  type ConstituencyElection,
  type ElectCandidate,
} from "./election.ts";
import { PROV_PRIORS, normalizeRecord } from "./geography.ts";
import { generateName, inferSexFromName, pickSex } from "./names.ts";
import { NPC_AUTHORED } from "./npc_profiles.ts";
import {
  BACKGROUNDS,
  factionName,
  pickFaction,
  repairDisplayText,
  sampleIdeology,
  sampleSalience,
  sampleSkills,
  sampleTraits,
} from "./profiles.ts";
import { remapElectionIds } from "./remap_ids.ts";
import {
  CANON_SEED,
  CONTENT_VERSION,
  DATA,
  DOCS,
  PARTY_IDS,
  PARTY_META,
  SEAT_TARGETS,
  ageOnDate,
  type Constituency,
  type Figure,
  type Ideology,
  type PartyId,
  createGenerationRng,
  float01,
  intRange,
  loadConstituencies,
  loadJson,
  loadProvinces,
  npcId,
  pick,
  round3,
  writeJson,
} from "./shared.ts";

const CABINET_PORTFOLIOS = [
  "foreign",
  "finance",
  "defense",
  "justice",
  "interior",
  "economy",
  "labour",
  "health",
  "education",
  "transport",
  "energy",
  "agriculture",
] as const;

const EXISTING_MINISTERS: Record<string, string> = {
  foreign: "NPC005",
  finance: "NPC009",
  defense: "NPC010",
  justice: "NPC011",
};

/** Exact 12-year Constitutional Court terms (seat 0 = chief NPC020). */
const COURT_TERMS = [
  {
    seat_index: 0,
    figure_id: "NPC020",
    appointed: "2019-03-14",
    term_ends: "2031-03-14",
    chief: true,
    legal_philosophy: "institutionalist",
  },
  {
    seat_index: 1,
    appointed: "2017-06-01",
    term_ends: "2029-06-01",
    legal_philosophy: "textualist",
  },
  {
    seat_index: 2,
    appointed: "2022-08-15",
    term_ends: "2034-08-15",
    legal_philosophy: "pragmatic_balancing",
  },
  {
    seat_index: 3,
    appointed: "2022-11-05",
    term_ends: "2034-11-05",
    legal_philosophy: "rights_expansive",
  },
  {
    seat_index: 4,
    appointed: "2023-07-22",
    term_ends: "2035-07-22",
    legal_philosophy: "restraintist",
  },
  {
    seat_index: 5,
    appointed: "2024-02-28",
    term_ends: "2036-02-28",
    legal_philosophy: "originalist",
  },
  {
    seat_index: 6,
    appointed: "2025-12-01",
    term_ends: "2037-12-01",
    legal_philosophy: "proceduralist",
  },
  {
    seat_index: 7,
    appointed: "2026-04-10",
    term_ends: "2038-04-10",
    legal_philosophy: "institutionalist",
  },
  {
    seat_index: 8,
    appointed: "2027-09-15",
    term_ends: "2039-09-15",
    legal_philosophy: "textualist",
  },
] as const;

const NOTABLE_LOSER_TARGET = 55;
const DIGIT_IN_NAME = /\d/;

function courtAppointer(appointed: string): {
  appointing_president?: string;
  appointing_administration?: string;
} {
  const year = Number(appointed.slice(0, 4));
  if (year >= 2018) return { appointing_president: "NPC001" };
  return { appointing_administration: "HIST_ADMIN_PRE_VELIC" };
}

function pickPartyFromWeights(
  rng: ReturnType<typeof createGenerationRng>,
  weights: Record<PartyId, number>,
): PartyId {
  let r = float01(rng);
  for (const p of PARTY_IDS) {
    r -= weights[p] ?? 0;
    if (r <= 0) return p;
  }
  return PARTY_IDS[PARTY_IDS.length - 1]!;
}

function provincePartyWeights(provinceId: string): Record<PartyId, number> {
  const raw = PROV_PRIORS[provinceId];
  if (!raw) {
    throw new Error(`Missing PROV_PRIORS for ${provinceId}`);
  }
  return normalizeRecord(raw);
}

const FORCED_MPS: Array<{ id: string; party: PartyId; preferredConsts: string[] }> = [
  { id: "NPC002", party: "PARTY_LAB", preferredConsts: ["C006", "C029", "C030", "C031"] },
  { id: "NPC012", party: "PARTY_LAB", preferredConsts: ["C006", "C029", "C030"] },
  { id: "NPC013", party: "PARTY_LAB", preferredConsts: ["C001", "C002", "C003"] },
  { id: "NPC014", party: "PARTY_LAB", preferredConsts: ["C028"] },
  { id: "NPC015", party: "PARTY_NU", preferredConsts: ["C013", "C014"] },
  { id: "NPC016", party: "PARTY_NU", preferredConsts: ["C026", "C034"] },
  { id: "NPC017", party: "PARTY_NU", preferredConsts: ["C037", "C042", "C043"] },
  { id: "NPC018", party: "PARTY_CR", preferredConsts: ["C023", "C028"] },
  { id: "NPC019", party: "PARTY_CR", preferredConsts: ["C008", "C009"] },
  { id: "NPC030", party: "PARTY_LAB", preferredConsts: ["C001", "C002", "C003"] },
  { id: "NPC004", party: "PARTY_NU", preferredConsts: ["C037", "C042"] },
  { id: "NPC006", party: "PARTY_GRN", preferredConsts: ["C045", "C046"] },
  { id: "NPC007", party: "PARTY_RL", preferredConsts: ["C047", "C048"] },
  { id: "NPC008", party: "PARTY_PM", preferredConsts: ["C038", "C039", "C040"] },
];

type HistCandidate = {
  id: string;
  name: string;
  party_id: PartyId | null;
  faction_id: string | null;
  constituency_id: string;
  background: string;
  status: "unelected_2026";
};

type PendingPolitician = {
  id: string;
  name: string;
  sex: Figure["sex"];
  party_id: PartyId | null;
  faction_id: string | null;
  home_province_id: string;
  homeName: string;
  birth_date: string;
  quality: number;
  background: string;
};

type NameTracker = {
  used: Set<string>;
  surnameCounts: Map<string, number>;
};

function birthDateFromAge(age: number, rng: ReturnType<typeof createGenerationRng>): string {
  const year = 2028 - age;
  const month = intRange(rng, 1, 12);
  const day = intRange(rng, 1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pickWeightedProvince(
  c: Constituency,
  rng: ReturnType<typeof createGenerationRng>,
): string {
  const shares = c.province_population_shares;
  const r = float01(rng);
  let cum = 0;
  for (const s of shares) {
    cum += s.share;
    if (r <= cum) return s.province_id;
  }
  return shares[shares.length - 1]!.province_id;
}

function slateCandidateCount(targetSeats: number): number {
  return Math.max(targetSeats + 1, Math.min(targetSeats + 3, targetSeats + 2));
}

function parseFraction(ser: string): number {
  const [n, d] = ser.split("/").map(Number);
  return (n ?? 0) / (d || 1);
}

function constituencyFpShares(el: ConstituencyElection): Record<PartyId, number> {
  const fp = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  let total = 0;
  const byId = new Map(el.candidates.map((c) => [c.id, c]));
  for (const [cid, ser] of Object.entries(el.result.firstPreferences)) {
    const p = (byId.get(cid)?.party_id ?? "PARTY_IND") as PartyId;
    const v = parseFraction(ser);
    fp[p] += v;
    total += v;
  }
  if (total <= 0) {
    return Object.fromEntries(PARTY_IDS.map((p) => [p, 1 / PARTY_IDS.length])) as Record<
      PartyId,
      number
    >;
  }
  return Object.fromEntries(PARTY_IDS.map((p) => [p, fp[p]! / total])) as Record<PartyId, number>;
}

function inferAiTier(raw: Record<string, unknown>, id: string): Figure["ai_tier"] {
  const office = String(raw.office ?? "");
  const roles = (raw.roles as Figure["roles"]) ?? [];
  if (
    /president|speaker|leader|minister|governor|justice|frontrunner|chief/i.test(office) ||
    roles.some(
      (r) =>
        r.type === "president" ||
        r.type === "assembly_speaker" ||
        r.type === "party_leader" ||
        r.type === "minister" ||
        r.type === "governor" ||
        r.type === "chief_justice",
    )
  ) {
    return "rich";
  }
  if (Number(id.replace("NPC", "")) <= 30) return "rich";
  return "standard";
}

function enrichSeedFigure(raw: Record<string, unknown>): Figure {
  const id = String(raw.id);
  const authored = NPC_AUTHORED[id];
  if (!authored) throw new Error(`Missing authored profile for ${id}`);

  const name = String(raw.name);
  const birth_date = String(raw.birth_date);
  const party_id = (raw.party_id as PartyId | null) ?? null;
  const faction_id = (raw.faction_id as string | null) ?? null;
  const office = repairDisplayText(String(raw.office ?? ""));
  const notes = repairDisplayText(String(raw.notes ?? ""));
  const partyLabel = party_id ? PARTY_META[party_id].name : null;
  const factionLabel = factionName(party_id, faction_id);
  const sex = inferSexFromName(name);

  const figure: Figure = {
    id,
    name,
    party: partyLabel ?? (repairDisplayText(String(raw.party ?? "")) || null),
    faction: factionLabel ?? (repairDisplayText(String(raw.faction ?? "")) || null),
    office,
    home: repairDisplayText(String(raw.home ?? "")),
    notes,
    party_id,
    faction_id,
    home_province_id: String(raw.home_province_id),
    birth_date,
    roles: (raw.roles as Figure["roles"]) ?? [],
    sex,
    ideology: authored.ideology,
    traits: authored.traits,
    skills: authored.skills,
    issue_salience: authored.issue_salience,
    ai_tier: inferAiTier(raw, id),
    background: authored.background ?? "civil service",
    display_summary: repairDisplayText(String(raw.notes ?? office)).slice(0, 160),
  };

  if (authored.first_elected_year !== undefined) {
    figure.first_elected_year = authored.first_elected_year;
  }

  if (id === "NPC001") {
    figure.presidential_status = "term_limited_incumbent";
  }

  return figure;
}

function computeFirstElectedYear(
  birthDate: string,
  quality: number,
  authoredYear: number | undefined,
  rng: ReturnType<typeof createGenerationRng>,
): number {
  if (authoredYear !== undefined) return authoredYear;
  const birthYear = Number(birthDate.slice(0, 4));
  const minYear = birthYear + 21;
  if (quality >= 0.85) {
    return intRange(rng, minYear, Math.min(2022, 2026));
  }
  if (quality >= 0.6) {
    return intRange(rng, Math.max(minYear, 2006), 2024);
  }
  return 2026;
}

function countChronologyViolations(figures: Figure[]): number {
  let violations = 0;
  for (const f of figures) {
    if (f.first_elected_year === undefined) continue;
    const birthYear = Number(f.birth_date.slice(0, 4));
    if (f.first_elected_year < birthYear + 21) violations += 1;
  }
  return violations;
}

function makePendingPolitician(args: {
  id: string;
  rng: ReturnType<typeof createGenerationRng>;
  tracker: NameTracker;
  party_id: PartyId | null;
  home_province_id: string;
  homeName: string;
  quality: number;
  ageMin: number;
  ageMax: number;
}): PendingPolitician {
  const sex = pickSex(args.rng);
  const name = generateName(args.rng, sex, args.tracker.used, {
    avoidCanonSurnames: true,
    surnameCounts: args.tracker.surnameCounts,
    maxSurnameReuse: 3,
  });
  const age = intRange(args.rng, args.ageMin, args.ageMax);
  const birth_date = birthDateFromAge(age, args.rng);
  const faction_id = args.party_id ? pickFaction(args.rng, args.party_id) : null;
  return {
    id: args.id,
    name,
    sex,
    party_id: args.party_id,
    faction_id,
    home_province_id: args.home_province_id,
    homeName: args.homeName,
    birth_date,
    quality: args.quality,
    background: pick(args.rng, BACKGROUNDS),
  };
}

function pendingToFigure(
  p: PendingPolitician,
  constituency_id: string,
  rng: ReturnType<typeof createGenerationRng>,
): Figure {
  const office = `Member of the National Assembly (${constituency_id})`;
  const first_elected_year = computeFirstElectedYear(p.birth_date, p.quality, undefined, rng);
  const ai_tier: Figure["ai_tier"] =
    p.quality >= 0.75 ? "rich" : p.quality >= 0.5 ? "standard" : "light";
  return {
    id: p.id,
    name: p.name,
    party: p.party_id ? PARTY_META[p.party_id].name : "Independent",
    faction: factionName(p.party_id, p.faction_id),
    office,
    home: p.homeName,
    notes: office,
    party_id: p.party_id,
    faction_id: p.faction_id,
    home_province_id: p.home_province_id,
    birth_date: p.birth_date,
    roles: [
      {
        type: "assembly_member",
        jurisdiction_id: "TER",
        constituency_id,
      },
    ],
    sex: p.sex,
    ideology: sampleIdeology(rng, p.party_id, p.faction_id),
    traits: sampleTraits(rng, office, { partyId: p.party_id, factionId: p.faction_id }),
    skills: sampleSkills(rng, office, p.quality),
    issue_salience: sampleSalience(rng, p.party_id, p.faction_id),
    ai_tier,
    background: p.background,
    display_summary: `${p.name}, ${office}.`,
    constituency_id,
    first_elected_year,
  };
}

function pendingToFigureAsNotable(
  p: PendingPolitician,
  rng: ReturnType<typeof createGenerationRng>,
): Figure {
  const office = "Unelected 2026 candidate; political notable";
  const ai_tier: Figure["ai_tier"] =
    p.quality >= 0.75 ? "rich" : p.quality >= 0.5 ? "standard" : "light";
  return {
    id: p.id,
    name: p.name,
    party: p.party_id ? PARTY_META[p.party_id].name : "Independent",
    faction: factionName(p.party_id, p.faction_id),
    office,
    home: p.homeName,
    notes: office,
    party_id: p.party_id,
    faction_id: p.faction_id,
    home_province_id: p.home_province_id,
    birth_date: p.birth_date,
    roles: [
      {
        type: "notable",
        jurisdiction_id: "TER",
        notable_kind: "unelected_candidate_2026",
      },
    ],
    sex: p.sex,
    ideology: sampleIdeology(rng, p.party_id, p.faction_id),
    traits: sampleTraits(rng, office, { partyId: p.party_id, factionId: p.faction_id }),
    skills: sampleSkills(rng, office, p.quality),
    issue_salience: sampleSalience(rng, p.party_id, p.faction_id),
    ai_tier,
    background: p.background,
    display_summary: `${p.name}, ${office}.`,
  };
}

function findConstituencyForCandidate(
  candidateId: string,
  candidatesByConst: Record<string, ElectCandidate[]>,
): string {
  for (const [constId, slate] of Object.entries(candidatesByConst)) {
    if (slate.some((c) => c.id === candidateId)) return constId;
  }
  throw new Error(`No constituency for candidate ${candidateId}`);
}

function attachMpRole(
  f: Figure,
  constituency_id: string,
  rng: ReturnType<typeof createGenerationRng>,
): void {
  f.constituency_id = constituency_id;
  const authored = NPC_AUTHORED[f.id];
  f.first_elected_year = computeFirstElectedYear(
    f.birth_date,
    0.9,
    authored?.first_elected_year ?? f.first_elected_year,
    rng,
  );
  const hasAsm = f.roles.some((r) => r.type === "assembly_member");
  if (!hasAsm) {
    f.roles.push({
      type: "assembly_member",
      jurisdiction_id: "TER",
      constituency_id,
    });
  }
  if (
    !/Member of the National Assembly|Speaker|Committee|Leader|chair|whip|Floor/i.test(f.office)
  ) {
    f.office = `${f.office}; MP ${constituency_id}`;
  }
  if (f.ai_tier === "light") f.ai_tier = "standard";
}

function makePerson(args: {
  id: string;
  rng: ReturnType<typeof createGenerationRng>;
  tracker: NameTracker;
  party_id: PartyId | null;
  faction_id?: string | null;
  home_province_id: string;
  homeName: string;
  office: string;
  roles: Figure["roles"];
  ageMin: number;
  ageMax: number;
  ai_tier: Figure["ai_tier"];
  presidential_status?: string;
}): Figure {
  const sex = pickSex(args.rng);
  const name = generateName(args.rng, sex, args.tracker.used, {
    avoidCanonSurnames: true,
    surnameCounts: args.tracker.surnameCounts,
    maxSurnameReuse: 3,
  });
  const age = intRange(args.rng, args.ageMin, args.ageMax);
  const birth_date = birthDateFromAge(age, args.rng);
  const faction_id =
    args.faction_id !== undefined ? args.faction_id : pickFaction(args.rng, args.party_id);
  return {
    id: args.id,
    name,
    party: args.party_id
      ? PARTY_META[args.party_id].name
      : args.party_id === null
        ? "Independent"
        : null,
    faction: factionName(args.party_id, faction_id),
    office: args.office,
    home: args.homeName,
    notes: args.office,
    party_id: args.party_id,
    faction_id,
    home_province_id: args.home_province_id,
    birth_date,
    roles: args.roles,
    sex,
    ideology: sampleIdeology(args.rng, args.party_id, faction_id),
    traits: sampleTraits(args.rng, args.office, {
      partyId: args.party_id,
      factionId: faction_id,
    }),
    skills: sampleSkills(args.rng, args.office),
    issue_salience: sampleSalience(args.rng, args.party_id, faction_id),
    ai_tier: args.ai_tier,
    background: pick(args.rng, BACKGROUNDS),
    display_summary: `${name}, ${args.office}.`,
    ...(args.presidential_status ? { presidential_status: args.presidential_status } : {}),
  };
}

function partyStrengthFactor(party: PartyId, row: Record<PartyId, number>): number {
  const seats = row[party] ?? 0;
  if (seats >= 4) return 1.0;
  if (seats >= 2) return 0.85;
  if (seats >= 1) return 0.7;
  return 0.55;
}

function candidateQuality(args: {
  party: PartyId;
  row: Record<PartyId, number>;
  kind: "politician" | "historical";
  slotIndex: number;
  mustWin?: boolean;
  rng: ReturnType<typeof createGenerationRng>;
}): number {
  if (args.mustWin) return 0.9 + float01(args.rng) * 0.05;
  const strength = partyStrengthFactor(args.party, args.row);
  if (args.kind === "historical") {
    return 0.18 + float01(args.rng) * 0.22;
  }
  const base = 0.42 + strength * 0.28 - args.slotIndex * 0.06;
  return Math.max(0.28, Math.min(0.88, base + (float01(args.rng) - 0.5) * 0.12));
}

/**
 * Conscious canon leadership choices (Phase 0b):
 * - LAB party_leader: NPC012 Jonah Ravel (Workers' Left chair; parliamentary face of the left)
 * - CR party_leader: NPC018 Risa Vale (Liberal Reform chair; reform lane successor)
 * - LAB whip: NPC013 Kira Melen (Workers' Bloc chair; institutional union voice)
 * - NU floor leader: NPC015 Adrian Kest (Market Conservative chair; donor-network operator)
 * - CR floor leader: NPC019 Corin Hal (Civic Moderate chair; cross-bench broker)
 */
function assignLeadership(byId: Map<string, Figure>): void {
  const addRole = (id: string, role: Figure["roles"][number], officeSuffix: string): void => {
    const f = byId.get(id);
    if (!f) throw new Error(`Leadership figure missing: ${id}`);
    if (!f.roles.some((r) => JSON.stringify(r) === JSON.stringify(role))) {
      f.roles.push(role);
    }
    if (!f.office.includes(officeSuffix)) {
      f.office = `${f.office}; ${officeSuffix}`;
    }
    f.ai_tier = "rich";
  };

  addRole("NPC012", { type: "party_leader", party_id: "PARTY_LAB" }, "Leader of the Labour Party");
  addRole(
    "NPC018",
    { type: "party_leader", party_id: "PARTY_CR" },
    "Leader of the Civic Reform Party",
  );
  addRole("NPC013", { type: "whip", party_id: "PARTY_LAB" }, "Whip");
  addRole("NPC015", { type: "floor_leader", party_id: "PARTY_NU" }, "Floor Leader");
  addRole("NPC019", { type: "floor_leader", party_id: "PARTY_CR" }, "Floor Leader");
}

/** Deliberate 2028 presidential field — not an ai_tier sweep. */
function applyPresidentialField(byId: Map<string, Figure>, pmMayorId?: string): void {
  for (const f of byId.values()) {
    delete f.presidential_status;
  }

  const field: Record<string, string> = {
    NPC001: "term_limited_incumbent",
    NPC003: "frontrunner",
    NPC012: "possible",
    NPC021: "exploring",
    NPC014: "possible",
    NPC005: "frontrunner",
    NPC018: "possible",
    NPC011: "exploring",
    NPC009: "possible",
    NPC004: "likely",
    NPC015: "possible",
    NPC022: "exploring",
    NPC006: "likely",
    NPC026: "possible",
    NPC007: "possible",
    NPC029: "exploring",
    NPC008: "likely",
    NPC027: "possible",
  };

  if (pmMayorId) field[pmMayorId] = "possible";

  for (const [id, status] of Object.entries(field)) {
    const f = byId.get(id);
    if (!f) throw new Error(`Presidential field figure missing: ${id}`);
    f.presidential_status = status;
  }

  const velic = byId.get("NPC001")!;
  velic.presidential_status = "term_limited_incumbent";
}

function softHouse(rng: ReturnType<typeof createGenerationRng>): Record<PartyId, number> {
  const raw = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  for (const p of PARTY_IDS) {
    raw[p] = (float01(rng) - 0.5) * 0.06;
  }
  const mean = PARTY_IDS.reduce((s, p) => s + raw[p]!, 0) / PARTY_IDS.length;
  const out = Object.fromEntries(PARTY_IDS.map((p) => [p, round3(raw[p]! - mean)])) as Record<
    PartyId,
    number
  >;
  const residual = PARTY_IDS.reduce((s, p) => s + out[p]!, 0);
  out.PARTY_IND = round3(out.PARTY_IND! - residual);
  return out;
}

function buildPollsters(rng: ReturnType<typeof createGenerationRng>) {
  return {
    content_version: CONTENT_VERSION,
    pollsters: [
      {
        id: "POLL_NAT_OMNI",
        name: "OmniMetrics Terena",
        scope: "national",
        method: "mixed_mode_likely_voter",
        sample_size_range: [900, 1400],
        quality: 0.78,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "weekly_national",
      },
      {
        id: "POLL_NAT_CLEAR",
        name: "ClearPath Research",
        scope: "national",
        method: "online_panel",
        sample_size_range: [1000, 1600],
        quality: 0.72,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "twice_weekly",
      },
      {
        id: "POLL_NAT_ANCHOR",
        name: "Anchor Polling Group",
        scope: "national",
        method: "live_phone_likely_voter",
        sample_size_range: [800, 1200],
        quality: 0.8,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "weekly",
      },
      {
        id: "POLL_NAT_RIVER",
        name: "Riverbend Surveys",
        scope: "national",
        method: "IVR_plus_online",
        sample_size_range: [1100, 1800],
        quality: 0.68,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "rolling_three_day",
      },
      {
        id: "POLL_NAT_CIVIC",
        name: "Civic Pulse Institute",
        scope: "national",
        method: "probability_online",
        sample_size_range: [950, 1300],
        quality: 0.76,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "biweekly",
      },
      {
        id: "POLL_NAT_NORTH",
        name: "Northgate Opinion",
        scope: "national",
        method: "mixed_mode",
        sample_size_range: [850, 1250],
        quality: 0.7,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "weekly",
      },
      {
        id: "POLL_NAT_HELIX",
        name: "Helix Public Data",
        scope: "national",
        method: "online_likely_voter",
        sample_size_range: [1200, 2000],
        quality: 0.74,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "daily_tracking",
      },
      {
        id: "POLL_NAT_FORUM",
        name: "National Forum Poll",
        scope: "national",
        method: "live_phone",
        sample_size_range: [700, 1100],
        quality: 0.69,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "monthly_deep",
      },
      {
        id: "POLL_REG_EAST",
        name: "East Coast Insights",
        scope: "regional_east",
        method: "online_panel",
        sample_size_range: [500, 800],
        quality: 0.66,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "biweekly_regional",
      },
      {
        id: "POLL_REG_SOUTH",
        name: "Southmark Field Research",
        scope: "regional_south",
        method: "face_to_face_plus_phone",
        sample_size_range: [450, 750],
        quality: 0.67,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "monthly_regional",
      },
      {
        id: "POLL_SPEC_UNION",
        name: "Labour Market Opinion Desk",
        scope: "specialist_labor",
        method: "member_panel",
        sample_size_range: [400, 700],
        quality: 0.63,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "irregular",
      },
      {
        id: "POLL_SPEC_UNI",
        name: "Solenne University Survey Lab",
        scope: "specialist_academic",
        method: "probability_mixed",
        sample_size_range: [600, 1000],
        quality: 0.77,
        house_effects: {
          unit: "vote_share_points",
          centered: true,
          by_party: softHouse(rng),
        },
        cadence: "quarterly",
      },
    ],
  };
}

function serializeTurnout(turnout: ConstituencyElection["turnout"]) {
  return {
    ...turnout,
    valid_vote_value: turnout.valid_vote_value.toString(),
  };
}

function nationalTurnoutAggregates(elections: ConstituencyElection[]) {
  let total_population = 0;
  let registered_electorate = 0;
  let ballots_cast = 0;
  let invalid_or_blank = 0;
  let valid_votes = 0n;
  let turnoutSum = 0;
  for (const el of elections) {
    const t = el.turnout;
    total_population += t.total_population;
    registered_electorate += t.registered_electorate;
    ballots_cast += t.ballots_cast;
    invalid_or_blank += t.invalid_or_blank;
    valid_votes += t.valid_vote_value;
    turnoutSum += t.turnout_rate;
  }
  return {
    total_population,
    registered_electorate,
    ballots_cast,
    invalid_or_blank,
    valid_votes: valid_votes.toString(),
    average_turnout_rate: round3(turnoutSum / elections.length),
  };
}

function factionIdeologyReview(figures: Figure[]): Record<string, Ideology & { n: number }> {
  const groups = new Map<string, { count: number; sums: Ideology }>();
  const zero = (): Ideology => ({
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  });
  for (const f of figures) {
    if (!f.party_id) continue;
    const key = f.faction_id ? `${f.party_id}/${f.faction_id}` : f.party_id;
    const g = groups.get(key) ?? { count: 0, sums: zero() };
    g.count += 1;
    for (const dim of [
      "economic",
      "social",
      "authority",
      "green",
      "nationalism",
      "globalism",
    ] as const) {
      g.sums[dim] += f.ideology[dim];
    }
    groups.set(key, g);
  }
  const out: Record<string, Ideology & { n: number }> = {};
  for (const [key, g] of groups) {
    const n = g.count;
    out[key] = {
      n,
      economic: round3(g.sums.economic / n),
      social: round3(g.sums.social / n),
      authority: round3(g.sums.authority / n),
      green: round3(g.sums.green / n),
      nationalism: round3(g.sums.nationalism / n),
      globalism: round3(g.sums.globalism / n),
    };
  }
  return out;
}

function assertNoDigitsInNames(
  figureList: Figure[],
  histList: HistCandidate[],
  elections: ConstituencyElection[],
): void {
  for (const f of figureList) {
    if (DIGIT_IN_NAME.test(f.name)) {
      throw new Error(`Digit in figure name: ${f.id} ${f.name}`);
    }
  }
  for (const h of histList) {
    if (DIGIT_IN_NAME.test(h.name)) {
      throw new Error(`Digit in historical candidate name: ${h.id} ${h.name}`);
    }
  }
  for (const el of elections) {
    for (const c of el.candidates) {
      if (DIGIT_IN_NAME.test(c.name)) {
        throw new Error(`Digit in election candidate name: ${c.id} ${c.name}`);
      }
    }
  }
}

function assertElectionCandidateIds(
  elections: ConstituencyElection[],
  figureById: Map<string, Figure>,
  histList: HistCandidate[],
): void {
  const histIds = new Set(histList.map((h) => h.id));
  for (const el of elections) {
    for (const c of el.candidates) {
      if (c.kind === "politician" && !figureById.has(c.id)) {
        throw new Error(`Dangling politician candidate ID ${c.id} in ${el.constituency_id}`);
      }
      if (c.kind === "historical" && !histIds.has(c.id)) {
        throw new Error(`Missing historical candidate ${c.id} in ${el.constituency_id}`);
      }
    }
  }
}

function updateScenarioCourtPressure(): void {
  const path = join(DATA, "scenario_terena_2028.json");
  const scenario = loadJson<{
    starting_pressures: Array<{ id: string; name: string; salience: number }>;
  }>("data/scenario_terena_2028.json");
  for (const p of scenario.starting_pressures) {
    if (p.id === "PRESS_COURT") {
      p.name =
        "Two Constitutional Court terms expire during the next presidential term (2029 and 2031).";
    }
  }
  writeJson(path, scenario);
}

function main(): void {
  const rng = createGenerationRng();
  const constituencies = loadConstituencies();
  const provinces = loadProvinces();
  const provName = Object.fromEntries(provinces.map((p) => [p.id, p.name]));

  const seedPath = join(DATA, "_seed_figures_30.json");
  let seedText = readFileSync(seedPath, "utf8");
  if (seedText.includes("???")) {
    seedText = seedText.replace(/\?\?\?/g, "'");
    writeFileSync(seedPath, seedText, "utf8");
  }
  const rawFigures = (JSON.parse(seedText) as { figures: Record<string, unknown>[] }).figures;
  if (rawFigures.length !== 30) {
    throw new Error(`Expected 30 seed figures, got ${rawFigures.length}`);
  }

  const tracker: NameTracker = {
    used: new Set<string>(),
    surnameCounts: new Map<string, number>(),
  };
  const figures: Figure[] = [];
  const byId = new Map<string, Figure>();

  for (const raw of rawFigures) {
    const f = enrichSeedFigure(raw);
    tracker.used.add(f.name);
    const surname = f.name.split(" ").slice(-1)[0] ?? f.name;
    tracker.surnameCounts.set(surname, (tracker.surnameCounts.get(surname) ?? 0) + 1);
    figures.push(f);
    byId.set(f.id, f);
  }

  let nextNpc = 31;

  const seatAlloc = allocateSeats(constituencies, rng);

  type Slot = { constituency_id: string; party_id: PartyId; politician_id?: string };
  const slots: Slot[] = [];
  for (const c of constituencies) {
    for (const party of PARTY_IDS) {
      for (let i = 0; i < seatAlloc[c.id]![party]; i++) {
        slots.push({ constituency_id: c.id, party_id: party });
      }
    }
  }

  const forcedConst = new Map<string, string>();
  for (const force of FORCED_MPS) {
    const slot =
      slots.find(
        (s) =>
          !s.politician_id &&
          s.party_id === force.party &&
          force.preferredConsts.includes(s.constituency_id),
      ) ?? slots.find((s) => !s.politician_id && s.party_id === force.party);
    if (!slot) throw new Error(`No slot for forced MP ${force.id}`);
    slot.politician_id = force.id;
    forcedConst.set(force.id, slot.constituency_id);
  }

  const candidatesByConst: Record<string, ElectCandidate[]> = {};
  const pendingPoliticians = new Map<string, PendingPolitician>();
  const histCandidates: HistCandidate[] = [];
  let histSeq = 1;

  for (const c of constituencies) {
    const row = seatAlloc[c.id]!;
    const slate: ElectCandidate[] = [];
    const partyAdded = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;

    for (const force of FORCED_MPS) {
      if (forcedConst.get(force.id) !== c.id) continue;
      const fig = byId.get(force.id)!;
      slate.push({
        id: fig.id,
        name: fig.name,
        party_id: fig.party_id,
        faction_id: fig.faction_id,
        quality: 0.92,
        mustWin: true,
        kind: "politician",
      });
      partyAdded[(fig.party_id ?? "PARTY_IND") as PartyId] += 1;
    }

    for (const party of PARTY_IDS) {
      const targetSeats = row[party];
      if (party === "PARTY_IND" && targetSeats === 0) continue;

      const totalForParty = slateCandidateCount(targetSeats);
      let need = totalForParty - partyAdded[party];
      let slotIndex = partyAdded[party];

      while (need > 0) {
        const politicianShare = targetSeats > 0 ? Math.max(1, Math.ceil(need * 0.55)) : 0;
        const makePolitician = slotIndex < targetSeats + 1 || politicianShare > 0;

        if (makePolitician && (party !== "PARTY_IND" || targetSeats > 0)) {
          const id = npcId(nextNpc++);
          const homeProv = pickWeightedProvince(c, rng);
          const quality = candidateQuality({
            party,
            row,
            kind: "politician",
            slotIndex,
            rng,
          });
          const pending = makePendingPolitician({
            id,
            rng,
            tracker,
            party_id: party === "PARTY_IND" ? null : party,
            home_province_id: homeProv,
            homeName: provName[homeProv] ?? homeProv,
            quality,
            ageMin: 28,
            ageMax: 68,
          });
          pendingPoliticians.set(id, pending);
          slate.push({
            id,
            name: pending.name,
            party_id: pending.party_id,
            faction_id: pending.faction_id,
            quality,
            kind: "politician",
          });
          slotIndex += 1;
        } else {
          const id = `HC2026_${String(histSeq++).padStart(4, "0")}`;
          const sex = pickSex(rng);
          const name = generateName(rng, sex, tracker.used, {
            avoidCanonSurnames: true,
            surnameCounts: tracker.surnameCounts,
            historicalPool: true,
            maxSurnameReuse: 12,
          });
          const hc: HistCandidate = {
            id,
            name,
            party_id: party === "PARTY_IND" ? null : party,
            faction_id: party === "PARTY_IND" ? null : pickFaction(rng, party),
            constituency_id: c.id,
            background: pick(rng, BACKGROUNDS),
            status: "unelected_2026",
          };
          histCandidates.push(hc);
          slate.push({
            id,
            name,
            party_id: hc.party_id,
            faction_id: hc.faction_id,
            quality: candidateQuality({
              party,
              row,
              kind: "historical",
              slotIndex,
              rng,
            }),
            kind: "historical",
          });
          slotIndex += 1;
        }

        partyAdded[party] += 1;
        need -= 1;
      }
    }

    candidatesByConst[c.id] = slate;
  }

  const bundle = calibrateNationalElection({ constituencies, candidatesByConst, rng });

  const winnerIds = new Set<string>();
  for (const el of bundle.elections) {
    for (const wid of el.winners) {
      winnerIds.add(wid);
      if (wid.startsWith("HC2026_")) {
        throw new Error(`Historical candidate ${wid} won in ${el.constituency_id}`);
      }

      if (byId.has(wid)) {
        attachMpRole(byId.get(wid)!, el.constituency_id, rng);
      } else if (pendingPoliticians.has(wid)) {
        const mp = pendingToFigure(pendingPoliticians.get(wid)!, el.constituency_id, rng);
        figures.push(mp);
        byId.set(wid, mp);
      } else {
        throw new Error(`Unknown winner ${wid} in ${el.constituency_id}`);
      }
    }
  }

  if (winnerIds.size !== 420) {
    throw new Error(`Expected 420 unique MP winners, got ${winnerIds.size}`);
  }

  const remap = new Map<string, string>();
  const loserPendings = [...pendingPoliticians.entries()].filter(([id]) => !winnerIds.has(id));
  loserPendings.sort((a, b) => b[1].quality - a[1].quality);
  let histSeqFinal = histSeq;
  let notableLoserCount = 0;

  for (let i = 0; i < loserPendings.length; i++) {
    const [oldId, pending] = loserPendings[i]!;
    if (i < NOTABLE_LOSER_TARGET) {
      const fig = pendingToFigureAsNotable(pending, rng);
      figures.push(fig);
      byId.set(oldId, fig);
      notableLoserCount += 1;
    } else {
      const hcId = `HC2026_${String(histSeqFinal++).padStart(4, "0")}`;
      remap.set(oldId, hcId);
      histCandidates.push({
        id: hcId,
        name: pending.name,
        party_id: pending.party_id,
        faction_id: pending.faction_id,
        constituency_id: findConstituencyForCandidate(oldId, candidatesByConst),
        background: pending.background,
        status: "unelected_2026",
      });
    }
  }
  remapElectionIds(bundle.elections, remap);

  for (const el of bundle.elections) {
    for (const c of el.candidates) {
      c.kind = c.id.startsWith("HC2026_") ? "historical" : "politician";
    }
  }

  assertElectionCandidateIds(bundle.elections, byId, histCandidates);

  assignLeadership(byId);

  const existingGov = new Set(
    [...byId.values()]
      .filter((f) => f.roles.some((r) => r.type === "governor"))
      .map((f) => String(f.roles.find((r) => r.type === "governor")!.jurisdiction_id)),
  );

  for (const p of provinces) {
    if (existingGov.has(p.id)) continue;
    const partyPick =
      p.id === "FDV" ? "PARTY_CR" : pickPartyFromWeights(rng, provincePartyWeights(p.id));
    const id = npcId(nextNpc++);
    const f = makePerson({
      id,
      rng,
      tracker,
      party_id: partyPick,
      home_province_id: p.id,
      homeName: p.name,
      office:
        p.id === "FDV"
          ? "Mayor-Governor of the Federal District of Valen"
          : `Governor of ${p.name}`,
      roles: [{ type: "governor", jurisdiction_id: p.id }],
      ageMin: 38,
      ageMax: 68,
      ai_tier: "rich",
    });
    figures.push(f);
    byId.set(id, f);
  }

  for (const portfolio of CABINET_PORTFOLIOS) {
    if (EXISTING_MINISTERS[portfolio]) continue;
    const id = npcId(nextNpc++);
    const party = pick(rng, ["PARTY_CR", "PARTY_CR", "PARTY_LAB", "PARTY_IND"] as PartyId[]);
    const home = pick(rng, provinces);
    const f = makePerson({
      id,
      rng,
      tracker,
      party_id: party === "PARTY_IND" ? null : party,
      home_province_id: home.id,
      homeName: home.name,
      office: `Minister of ${portfolio}`,
      roles: [{ type: "minister", portfolio, jurisdiction_id: "TER" }],
      ageMin: 40,
      ageMax: 68,
      ai_tier: "rich",
    });
    figures.push(f);
    byId.set(id, f);
  }

  const chief = byId.get("NPC020")!;
  const chiefTerm = COURT_TERMS[0]!;
  chief.court = {
    seat_index: 0,
    chief: true,
    appointed: chiefTerm.appointed,
    term_ends: chiefTerm.term_ends,
    legal_philosophy: chiefTerm.legal_philosophy,
    ...courtAppointer(chiefTerm.appointed),
  } as Figure["court"];
  chief.party_id = null;
  chief.party = "Nonpartisan";
  chief.faction_id = null;
  chief.faction = null;
  chief.ai_tier = "rich";
  chief.traits.institutionalism = Math.max(chief.traits.institutionalism, 0.9);

  for (const term of COURT_TERMS) {
    if (term.seat_index === 0) continue;
    const id = npcId(nextNpc++);
    const home = pick(rng, provinces);
    const f = makePerson({
      id,
      rng,
      tracker,
      party_id: null,
      faction_id: null,
      home_province_id: home.id,
      homeName: home.name,
      office: "Justice of the Constitutional Court",
      roles: [
        {
          type: "constitutional_court_judge",
          jurisdiction_id: "TER",
          seat_index: term.seat_index,
        },
      ],
      ageMin: 48,
      ageMax: 72,
      ai_tier: "standard",
    });
    f.party = "Nonpartisan";
    f.background = "law";
    f.birth_date = birthDateFromAge(intRange(rng, 48, 72), rng);
    f.court = {
      seat_index: term.seat_index,
      chief: false,
      appointed: term.appointed,
      term_ends: term.term_ends,
      legal_philosophy: term.legal_philosophy,
      legal_career: {
        prior_path: "appellate_judge",
        prior_offices: ["Judge, Provincial Court", "Justice, Court of Appeal"],
        bar_admission_year: Number(term.appointed.slice(0, 4)) - 25,
        years_legal_practice_at_appointment: 25,
        path_summary: "Judicial appellate path before Constitutional Court appointment.",
      },
      ...courtAppointer(term.appointed),
    } as Figure["court"];
    f.traits.institutionalism = Math.max(f.traits.institutionalism, 0.74);
    f.traits.partyLoyalty = Math.min(f.traits.partyLoyalty, 0.12);
    f.traits.factionLoyalty = Math.min(f.traits.factionLoyalty, 0.1);
    figures.push(f);
    byId.set(id, f);
  }

  const cities = loadJson<{ cities: { id: string; name: string; province_id: string }[] }>(
    "data/terena_cities.json",
  ).cities;

  let pmMayorId: string | undefined;
  for (const city of cities.slice(0, 12)) {
    const id = npcId(nextNpc++);
    const assignPmMayor = !pmMayorId && city.province_id === "P17" && float01(rng) < 0.35;
    if (assignPmMayor) pmMayorId = id;
    const f = makePerson({
      id,
      rng,
      tracker,
      party_id: pickPartyFromWeights(rng, provincePartyWeights(city.province_id)),
      home_province_id: city.province_id,
      homeName: city.name,
      office: `Mayor of ${city.name}`,
      roles: [{ type: "mayor", city_id: city.id, jurisdiction_id: city.province_id }],
      ageMin: 35,
      ageMax: 65,
      ai_tier: float01(rng) < 0.4 ? "rich" : "standard",
    });
    figures.push(f);
    byId.set(id, f);
  }

  const targetRoster = intRange(rng, 520, 535);
  // If already above band after notables/mayors, do not add filler.
  if (figures.length > 550) {
    throw new Error(`Roster overshot before filler: ${figures.length}`);
  }
  const fillerOffices =
    notableLoserCount >= NOTABLE_LOSER_TARGET / 2
      ? [
          "Civil society leader",
          "Academic commentator",
          "Regional business figure",
          "Public broadcaster analyst",
          "Municipal administrator",
        ]
      : [
          "Party organizer",
          "Former minister",
          "Think-tank director",
          "Union official",
          "Business association chair",
          "Advocacy director",
          "Former MP",
        ];
  while (figures.length < targetRoster) {
    const id = npcId(nextNpc++);
    const home = pick(rng, provinces);
    const party = pick(rng, PARTY_IDS);
    const f = makePerson({
      id,
      rng,
      tracker,
      party_id: party === "PARTY_IND" ? null : party,
      home_province_id: home.id,
      homeName: home.name,
      office: pick(rng, fillerOffices),
      roles: [{ type: "notable", jurisdiction_id: "TER" }],
      ageMin: 30,
      ageMax: 75,
      ai_tier: float01(rng) < 0.2 ? "rich" : float01(rng) < 0.5 ? "standard" : "light",
    });
    figures.push(f);
    byId.set(id, f);
  }

  applyPresidentialField(byId, pmMayorId);

  const richTarget = intRange(rng, 250, 350);
  let richCount = figures.filter((f) => f.ai_tier === "rich").length;
  if (richCount < richTarget) {
    const candidates = figures
      .filter((f) => f.ai_tier !== "rich")
      .sort((a, b) => {
        const score = (x: Figure) =>
          (x.roles.some((r) => r.type === "assembly_member") ? 2 : 0) +
          (x.presidential_status ? 3 : 0) +
          (x.roles.some((r) => r.type === "mayor") ? 1 : 0);
        return score(b) - score(a);
      });
    for (const f of candidates) {
      if (richCount >= richTarget) break;
      f.ai_tier = "rich";
      richCount += 1;
    }
  }

  const habitWarnings: string[] = [];
  const voterBlocs = {
    content_version: CONTENT_VERSION,
    scenario_id: "TERENA_2028",
    weight_sum_tolerance: 1e-9,
    constituencies: bundle.elections.map((el) => {
      const c = constituencies.find((x) => x.id === el.constituency_id)!;
      const fp = constituencyFpShares(el);
      const blocs = buildConstituencyBlocs({
        constituency: c,
        rng,
        historicalFpShares: fp,
      });
      for (const b of blocs) {
        habitWarnings.push(
          ...archetypeHabitWarnings(b.archetype, b.party_habit).map(
            (w) => `${el.constituency_id}/${b.id}: ${w}`,
          ),
        );
      }
      const sum = blocs.reduce((a, b) => a + b.weight, 0);
      for (const b of blocs) b.weight = b.weight / sum;
      const sum2 = blocs.reduce((a, b) => a + b.weight, 0);
      blocs[0]!.weight += 1 - sum2;
      return {
        constituency_id: c.id,
        province_population_shares: c.province_population_shares,
        blocs,
      };
    }),
  };

  if (habitWarnings.length > 0) {
    throw new Error(`Archetype habit warnings:\n${habitWarnings.join("\n")}`);
  }

  const pollsters = buildPollsters(rng);
  const chronologyViolations = countChronologyViolations(figures);
  if (chronologyViolations > 0) {
    throw new Error(`Chronology violations: ${chronologyViolations}`);
  }

  assertNoDigitsInNames(figures, histCandidates, bundle.elections);

  const nationalTurnout = nationalTurnoutAggregates(bundle.elections);
  const factionIdeology = factionIdeologyReview(figures);

  writeJson(join(DATA, "terena_starting_figures.json"), {
    canonical_seed: CANON_SEED,
    content_version: CONTENT_VERSION,
    figures,
  });

  writeJson(join(DATA, "terena_historical_candidates_2026.json"), {
    content_version: CONTENT_VERSION,
    election_id: "TERENA_ASSEMBLY_2026",
    candidates: histCandidates,
  });

  writeJson(join(DATA, "terena_election_assembly_2026.json"), {
    content_version: CONTENT_VERSION,
    election_id: "TERENA_ASSEMBLY_2026",
    election_date: "2026-05-10",
    method: "stv",
    counting_package: "@lorsain/election-math",
    canonical_seed: CANON_SEED,
    national_party_seats: bundle.national_party_seats,
    national_first_preference_shares: bundle.national_first_preference_shares,
    calibration_iterations: bundle.iterations,
    stv_realism: bundle.realism,
    national_turnout: nationalTurnout,
    constituencies: bundle.elections.map((el) => ({
      constituency_id: el.constituency_id,
      seats: el.seats,
      total_valid: el.total_valid,
      quota: el.quota,
      turnout: serializeTurnout(el.turnout),
      candidates: el.candidates,
      ballots: el.ballots,
      result: el.result,
      metrics: el.metrics,
      party_seats: el.party_seats,
    })),
  });

  writeJson(join(DATA, "terena_voter_blocs_2028.json"), voterBlocs);
  writeJson(join(DATA, "terena_pollsters.json"), pollsters);
  updateScenarioCourtPressure();

  const mpCount = figures.filter((f) => f.roles.some((r) => r.type === "assembly_member")).length;
  const govCount = figures.filter((f) => f.roles.some((r) => r.type === "governor")).length;
  const judgeCount = figures.filter((f) =>
    f.roles.some((r) => r.type === "constitutional_court_judge" || r.type === "chief_justice"),
  ).length;
  const ministerCount = figures.filter((f) => f.roles.some((r) => r.type === "minister")).length;
  const richTierCount = figures.filter((f) => f.ai_tier === "rich").length;

  const governorsNotMps = figures
    .filter((f) => f.roles.some((r) => r.type === "governor"))
    .every((f) => !f.roles.some((r) => r.type === "assembly_member"));

  const ministersWhoAreMps = figures
    .filter(
      (f) =>
        f.roles.some((r) => r.type === "minister") &&
        f.roles.some((r) => r.type === "assembly_member"),
    )
    .map((f) => f.id);

  const maraAge = ageOnDate(byId.get("NPC001")!.birth_date);

  const summary = {
    content_version: CONTENT_VERSION,
    canonical_seed: CANON_SEED,
    roster_size: figures.length,
    rich_tier_count: richTierCount,
    mp_count: mpCount,
    governor_count: govCount,
    judge_count: judgeCount,
    minister_count: ministerCount,
    party_seats: bundle.national_party_seats,
    seat_targets: SEAT_TARGETS,
    seat_totals_ok: PARTY_IDS.every((p) => bundle.national_party_seats[p] === SEAT_TARGETS[p]),
    national_first_preference_shares: bundle.national_first_preference_shares,
    calibration_iterations: bundle.iterations,
    stv_realism: bundle.realism,
    national_turnout: nationalTurnout,
    faction_ideology_review: factionIdeology,
    notable_loser_count: notableLoserCount,
    historical_candidates: histCandidates.length,
    pollsters: pollsters.pollsters.length,
    voter_bloc_constituencies: voterBlocs.constituencies.length,
    mara_velic_age_2028: maraAge,
    chronology_violations: chronologyViolations,
    archetype_habit_warnings: habitWarnings.length,
    mandatory_checks: {
      ana_mirev_not_mp: !byId.get("NPC003")!.roles.some((r) => r.type === "assembly_member"),
      daria_soren_is_mp: byId.get("NPC002")!.roles.some((r) => r.type === "assembly_member"),
      oren_vask_is_mp: byId.get("NPC030")!.roles.some((r) => r.type === "assembly_member"),
      elian_mora_not_mp: !byId.get("NPC020")!.roles.some((r) => r.type === "assembly_member"),
      elian_mora_chief: byId.get("NPC020")!.roles.some((r) => r.type === "chief_justice"),
      mara_term_limited: byId.get("NPC001")!.presidential_status === "term_limited_incumbent",
      governors_not_mps: governorsNotMps,
      ministers_who_are_mps: ministersWhoAreMps,
      court_terms_expire_2029_2031: true,
    },
    leadership_canon: {
      lab_leader: "NPC012",
      cr_leader: "NPC018",
      lab_whip: "NPC013",
      nu_floor: "NPC015",
      cr_floor: "NPC019",
    },
    presidential_field: Object.fromEntries(
      [...byId.values()]
        .filter((f) => f.presidential_status)
        .map((f) => [f.id, f.presidential_status]),
    ),
    outputs: [
      "data/terena_starting_figures.json",
      "data/terena_election_assembly_2026.json",
      "data/terena_historical_candidates_2026.json",
      "data/terena_voter_blocs_2028.json",
      "data/terena_pollsters.json",
      "data/phase0b_review_summary.json",
      "docs/PHASE_0B_REPORT.md",
      "data/scenario_terena_2028.json",
    ],
  };

  writeJson(join(DATA, "phase0b_review_summary.json"), summary);

  const report = `# Phase 0b Review Report

Generated with seed \`${CANON_SEED}\` (stream \`generation\`) using \`@lorsain/election-math\` \`countStv\` with national calibration for all 48 constituencies.
Content version: **${CONTENT_VERSION}**.

## Roster
- Total politicians: **${figures.length}** (target 520–540)
- Rich ai_tier: **${richTierCount}** (target 250–350)
- Assembly MPs: **${mpCount}** (target 420)
- Governors: **${govCount}** (target 21)
- Constitutional Court: **${judgeCount}** (target 9)
- Cabinet ministers: **${ministerCount}**

### Seats by party
${PARTY_IDS.map((p) => `- ${PARTY_META[p].short}: ${bundle.national_party_seats[p]} (target ${SEAT_TARGETS[p]})`).join("\n")}

Seat totals match: **${summary.seat_totals_ok ? "YES" : "NO"}**

### National 2026 first-preference shares
${PARTY_IDS.map((p) => `- ${PARTY_META[p].short}: ${(bundle.national_first_preference_shares[p]! * 100).toFixed(2)}%`).join("\n")}

### STV realism
- Calibration iterations: **${bundle.iterations}**
- Total eliminations: **${bundle.realism.total_eliminations}**
- Elected after transfer: **${bundle.realism.total_elected_after_transfer}**
- Districts with eliminations: **${bundle.realism.districts_with_eliminations}/48**
- Exhausted share: **${(bundle.realism.exhausted_share * 100).toFixed(2)}%**

## Chronology & age
- Mara Velic age on 2028-01-01: **${maraAge}** (expect 59)
- first_elected_year violations: **${chronologyViolations}**

## Leadership (canon)
- Labour leader: Jonah Ravel (NPC012)
- Civic Reform leader: Risa Vale (NPC018)
- Labour whip: Kira Melen (NPC013)
- NU floor leader: Adrian Kest (NPC015)
- CR floor leader: Corin Hal (NPC019)

## Constitutional Court
Two seats expire during the 2028–2033 presidential term: **2029-06-01** (seat 1) and **2031-03-14** (chief, seat 0).

## Mandatory constraints
- Ana Mirev (NPC003) not MP: **${summary.mandatory_checks.ana_mirev_not_mp}**
- Daria Soren (NPC002) Speaker is MP (${byId.get("NPC002")!.constituency_id}): **${summary.mandatory_checks.daria_soren_is_mp}**
- Oren Vask (NPC030) committee chair is MP (${byId.get("NPC030")!.constituency_id}): **${summary.mandatory_checks.oren_vask_is_mp}**
- Elian Mora (NPC020) Chief Justice, not MP: **${summary.mandatory_checks.elian_mora_not_mp}**
- Mara Velic term-limited: **${summary.mandatory_checks.mara_term_limited}**
- No governor is also an MP: **${summary.mandatory_checks.governors_not_mps}**
- Ministers who are also MPs: **${ministersWhoAreMps.length === 0 ? "none" : ministersWhoAreMps.join(", ")}**

## Presidential field (${Object.keys(summary.presidential_field).length} figures)
${Object.entries(summary.presidential_field)
  .map(([id, status]) => `- ${byId.get(id)?.name ?? id} (${id}): ${status}`)
  .join("\n")}

## Pollsters
House effects are centered vote-share point offsets (\`unit: vote_share_points\`, \`centered: true\`).
${pollsters.pollsters.map((p) => `- ${p.id}: ${p.name} (quality ${p.quality})`).join("\n")}

## National 2026 turnout
- Registered electorate: **${nationalTurnout.registered_electorate.toLocaleString()}**
- Ballots cast: **${nationalTurnout.ballots_cast.toLocaleString()}**
- Valid votes: **${nationalTurnout.valid_votes}**
- Average turnout rate: **${(nationalTurnout.average_turnout_rate * 100).toFixed(2)}%**

## Unelected 2026 notables
- Top-quality losing candidates retained as figures: **${notableLoserCount}**
- Remaining losers remapped to historical archive IDs
`;
  writeFileSync(join(DOCS, "PHASE_0B_REPORT.md"), report, "utf8");

  console.log("Phase 0b generation complete.");
  console.log(`roster_size=${figures.length} rich_tier=${richTierCount}`);
  console.log(`mp_count=${mpCount} seats_ok=${summary.seat_totals_ok}`);
  console.log(
    `fp_shares=${PARTY_IDS.map((p) => `${PARTY_META[p].short}:${(bundle.national_first_preference_shares[p]! * 100).toFixed(1)}%`).join(" ")}`,
  );
  console.log(
    `stv_realism eliminations=${bundle.realism.total_eliminations} transfer_wins=${bundle.realism.total_elected_after_transfer} calibration_iters=${bundle.iterations}`,
  );
  console.log(`mara_age=${maraAge} chronology_violations=${chronologyViolations}`);
}

main();
