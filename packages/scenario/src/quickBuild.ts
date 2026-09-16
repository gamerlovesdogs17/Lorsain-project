import { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";
import { createSeededRng, pick, shuffleInPlace } from "./rng.js";
import { absoluteMajorityFromPreset } from "./thresholds.js";
import type { QuickBuildInput, ScenarioDocument, ScenarioPoliticianSection } from "./types.js";

const NAME_A = ["Al", "Brin", "Cor", "Den", "El", "Fen", "Gar", "Hal", "Iris", "Jor"];
const NAME_B = ["a", "en", "or", "ia", "us", "ell", "ton", "ford", "wick", "mar"];
const PARTY_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];
const IDEOLOGIES = [
  "centre",
  "liberal",
  "conservative",
  "social-democratic",
  "green",
  "nationalist",
  "market-reform",
  "labour",
];
const FOREIGN_REGIONS = ["maritime", "continental", "polar", "tropical", "highland"];
const MINISTRIES = [
  { id: "MIN_FIN", title: "Finance" },
  { id: "MIN_FOR", title: "Foreign Affairs" },
  { id: "MIN_INT", title: "Interior" },
  { id: "MIN_JUS", title: "Justice" },
  { id: "MIN_DEF", title: "Defence" },
];

function slugCountry(countryName: string): string {
  const base = countryName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 12);
  return base || "CUSTOM";
}

function genPersonName(rng: () => number, idx: number): string {
  return `${pick(rng, NAME_A)}${pick(rng, NAME_B)} ${pick(rng, NAME_A)}${idx % 10}`;
}

function distributeSeats(total: number, buckets: number, rng: () => number): number[] {
  if (buckets <= 0) return [];
  const base = Math.floor(total / buckets);
  const rem = total - base * buckets;
  const out = Array.from({ length: buckets }, () => base);
  const order = shuffleInPlace(
    rng,
    Array.from({ length: buckets }, (_, i) => i),
  );
  for (let i = 0; i < rem; i++) {
    out[order[i % order.length]!]! += 1;
  }
  return out;
}

/**
 * Deterministic Quick Build: produces a complete v1 ScenarioDocument for mini_playable_v1.
 */
export function quickBuildScenario(input: QuickBuildInput): ScenarioDocument {
  const rng = createSeededRng(input.generationSeed);
  const assemblySeats = Math.max(1, Math.floor(input.assemblySeats));
  const provinceCount = Math.max(1, Math.floor(input.provinceCount));
  const partyCount = Math.max(2, Math.min(8, Math.floor(input.partyCount)));
  const slug = slugCountry(input.countryName);
  const year = input.startDate.slice(0, 4);
  const scenarioId = input.scenarioId ?? `${slug}_${year}`;
  const courtJudges = Math.max(3, Math.min(15, 3 + Math.floor(rng() * 6)));

  const provinces = Array.from({ length: provinceCount }, (_, i) => {
    const id = `PRV_${slug}_${String(i + 1).padStart(2, "0")}`;
    return {
      id,
      name: `${input.countryName} Province ${i + 1}`,
      population: 500_000 + Math.floor(rng() * 4_000_000),
      economy: pick(rng, ["industrial", "agrarian", "services", "mixed"]),
      urbanization: pick(rng, ["low", "medium", "high"]),
      characteristics: [pick(rng, ["coastal", "inland", "mountain", "river", "border"])],
    };
  });

  const constCount = Math.max(1, Math.min(provinceCount * 2, Math.ceil(assemblySeats / 3)));
  const seatSplit = distributeSeats(assemblySeats, constCount, rng);
  const constituencies = seatSplit.map((seats, i) => {
    const prov = provinces[i % provinces.length]!;
    return {
      id: `CON_${slug}_${String(i + 1).padStart(2, "0")}`,
      name: `${prov.name} ${i + 1}`,
      provinceId: prov.id,
      seats,
      population: Math.floor((prov.population ?? 1_000_000) / (constCount / provinceCount + 1)),
    };
  });

  const politicians: ScenarioPoliticianSection[] = [];
  let npcSeq = 1;
  const nextNpc = (): string => {
    const id = `NPC_${slug}_${String(npcSeq++).padStart(4, "0")}`;
    politicians.push({
      id,
      name: genPersonName(rng, npcSeq),
      partyId: null,
      provinceId: pick(rng, provinces).id,
      birthYear: 1955 + Math.floor(rng() * 35),
      background: pick(rng, ["lawyer", "business", "civil service", "activist", "academic"]),
      traits: [pick(rng, ["pragmatic", "charismatic", "technocratic", "populist"])],
      ideology: pick(rng, IDEOLOGIES),
    });
    return id;
  };

  const parties = Array.from({ length: partyCount }, (_, i) => {
    const id = `PARTY_${slug}_${String(i + 1).padStart(2, "0")}`;
    const leaderId = nextNpc();
    const p = politicians.find((x) => x.id === leaderId);
    if (p) p.partyId = id;
    return {
      id,
      name: `${pick(rng, NAME_A)}${pick(rng, NAME_B)} ${pick(rng, ["Party", "Front", "Union", "League", "Alliance"])}`,
      abbreviation: `${slug.slice(0, 2)}${i + 1}`,
      ideologyLabel: pick(rng, IDEOLOGIES),
      leaderId,
      color: PARTY_COLORS[i % PARTY_COLORS.length] ?? null,
      seatCount: Math.floor(assemblySeats / partyCount) + (i < assemblySeats % partyCount ? 1 : 0),
      platformSummary: `Generated platform ${i + 1} for ${input.countryName}`,
      caucuses: [
        {
          id: `${id}_MAIN`,
          name: "Main Caucus",
          leaderId,
          supportShare: 0.85,
        },
      ],
    };
  });

  for (let s = 0; s < assemblySeats; s++) {
    const id = nextNpc();
    const p = politicians.find((x) => x.id === id);
    if (p) {
      p.partyId = parties[s % partyCount]!.id;
      p.office = "assembly_member";
    }
  }

  for (let j = 0; j < courtJudges; j++) {
    const id = nextNpc();
    const p = politicians.find((x) => x.id === id);
    if (p) p.office = "constitutional_court_justice";
  }

  for (const prov of provinces) {
    const id = nextNpc();
    const p = politicians.find((x) => x.id === id);
    if (p) {
      p.provinceId = prov.id;
      p.office = "governor";
      p.partyId = parties[Math.floor(rng() * partyCount)]!.id;
    }
  }

  const presidentId = input.governmentForm === "parliamentary" ? nextNpc() : parties[0]!.leaderId;
  const headOfGovernmentId = input.governmentForm === "presidential" ? null : parties[0]!.leaderId;

  const cabinet = MINISTRIES.map((m) => {
    const holderId = nextNpc();
    const p = politicians.find((x) => x.id === holderId);
    if (p) {
      p.office = "minister";
      p.partyId = parties[0]!.id;
    }
    return { ministryId: m.id, holderId };
  });

  const coalitionPartyIds =
    partyCount >= 3 && rng() > 0.4 ? [parties[0]!.id, parties[1]!.id] : [parties[0]!.id];

  const foreignCount = 6 + Math.floor(rng() * 7);
  const foreignCountries = Array.from({ length: foreignCount }, (_, i) => ({
    id: `FC_${slug}_${String(i + 1).padStart(2, "0")}`,
    name: `${pick(rng, NAME_A)}${pick(rng, NAME_B)} ${pick(rng, ["Republic", "Kingdom", "Federation", "State"])}`,
    region: pick(rng, FOREIGN_REGIONS),
    relation: Number((rng() * 2 - 1).toFixed(2)),
    leaderName: genPersonName(rng, i),
  }));

  const relations = foreignCountries.slice(0, Math.min(4, foreignCountries.length)).map((c, i) => ({
    a: c.id,
    b: foreignCountries[(i + 1) % foreignCountries.length]!.id,
    diplomatic: Number((rng() * 2 - 1).toFixed(2)),
    trade: Number(rng().toFixed(2)),
    security: Number((rng() * 0.5).toFixed(2)),
  }));

  const organizations = [
    {
      id: `ORG_${slug}_TRADE`,
      name: `${input.countryName} Trade Council`,
      type: "business",
      issues: ["ISS_ECONOMY"],
      scope: "national",
    },
    {
      id: `ORG_${slug}_LABOUR`,
      name: "National Labour Confederation",
      type: "union",
      issues: ["ISS_GOVERNANCE"],
      scope: "national",
    },
  ];

  const absoluteMajority = absoluteMajorityFromPreset(assemblySeats, "simple_majority");

  const doc: ScenarioDocument = {
    format: SCENARIO_FORMAT,
    formatVersion: SCENARIO_FORMAT_VERSION,
    scenarioId,
    name: input.name ?? `${input.countryName} (${year})`,
    description: `Quick-built scenario for ${input.countryName}. Seed: ${input.generationSeed}`,
    startDate: input.startDate,
    author: input.author ?? "Lorsain Quick Build",
    countryName: input.countryName,
    gameVersion: "0.3.0-predev",
    contentSections: {
      overview: {
        tagline: `Generated ${input.governmentForm} republic`,
        foundingYear: Number(year) - 80 - Math.floor(rng() * 120),
      },
      constitution: {
        governmentForm: input.governmentForm,
        assemblySeats,
        assemblyAbsoluteMajority: absoluteMajority,
        assemblyAbsoluteMajorityPreset: "simple_majority",
        courtJudges,
        courtTermYears: 10,
        ministerialCensurePreset: "three_fifths",
        ministerialCensureFraction: 0.6,
        regulationReviewDays: 45,
      },
      geography: { provinces, constituencies },
      parties,
      people: { politicians },
      government: {
        presidentId,
        headOfGovernmentId,
        cabinet,
        coalitionPartyIds,
      },
      elections: {
        assemblySystem: input.electoralPreset,
        presidentialMode:
          input.governmentForm === "parliamentary" ? "assembly_selection" : "national_rcv",
        presidentialIntervalYears: 5,
        assemblyIntervalYears: 4,
        nominationRuleLabels: Object.fromEntries(
          parties.map((p) => [p.id, `${p.abbreviation} member RCV`]),
        ),
      },
      laws: {
        startingLaws: [
          {
            id: `LAW_${slug}_BUDGET`,
            title: "Interim Budget Framework",
            policyItems: ["ISS_ECONOMY"],
          },
        ],
      },
      organizations,
      foreign: {
        countries: foreignCountries,
        relations,
        treaties: [],
        crises: [],
      },
      world: {
        assemblySeats,
        courtJudges,
        jurisdictionId: slug.slice(0, 6),
      },
    },
    contentEmbed: { kind: "mini_playable_v1" },
  };

  return doc;
}
