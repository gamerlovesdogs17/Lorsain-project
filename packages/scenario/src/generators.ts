import type {
  ScenarioDocument,
  ScenarioPoliticianSection,
  ScenarioForeignCountrySection,
  QuickBuildInput,
  GovernmentFormId,
} from "./types.js";
import { quickBuildScenario } from "./quickBuild.js";

export type { QuickBuildInput } from "./types.js";

/** UI-friendly Quick Build wrapper (maps Studio form fields → QuickBuildInput). */
export type StudioQuickBuildForm = {
  countryName: string;
  startDate: string;
  govForm: "presidential" | "parliamentary" | "semi_presidential";
  assemblySeats: number;
  provinceCount: number;
  partyCount: number;
  electoralPresetId: string;
  scenarioName?: string;
  generationSeed?: string;
};

function mapGovForm(form: StudioQuickBuildForm["govForm"]): GovernmentFormId {
  if (form === "semi_presidential") return "semi";
  return form;
}

function mapElectoral(id: string): QuickBuildInput["electoralPreset"] {
  if (id === "fptp" || id === "closed_list_pr" || id === "mixed_member" || id === "stv") {
    return id;
  }
  return "stv";
}

export function generateQuickBuildDocument(form: StudioQuickBuildForm): ScenarioDocument {
  const seed =
    form.generationSeed ??
    `qb-${form.countryName}-${form.startDate}-${form.assemblySeats}-${form.provinceCount}-${form.partyCount}`;
  return quickBuildScenario({
    countryName: form.countryName,
    startDate: form.startDate,
    governmentForm: mapGovForm(form.govForm),
    assemblySeats: form.assemblySeats,
    provinceCount: form.provinceCount,
    partyCount: form.partyCount,
    electoralPreset: mapElectoral(form.electoralPresetId),
    generationSeed: seed,
    ...(form.scenarioName ? { name: form.scenarioName } : {}),
  });
}

export function personDisplay(p: ScenarioPoliticianSection): string {
  return p.name?.trim() || p.id;
}

export function generateForeignWorld(count = 6): ScenarioForeignCountrySection[] {
  const n = Math.max(1, Math.min(24, count));
  const names = [
    "Northern Reach",
    "Southern Compact",
    "Eastern League",
    "Western Accord",
    "Maritime Union",
    "Highland Confederation",
    "Riverlands",
    "Coastal Free Cities",
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: `FC_GEN_${String(i + 1).padStart(2, "0")}`,
    name: names[i % names.length] ?? `Neighbor ${i + 1}`,
    region: i % 2 === 0 ? "continental" : "maritime",
    relation: Number((((i * 17) % 100) / 50 - 1).toFixed(2)),
    leaderName: `Leader ${i + 1}`,
  }));
}

export function generatePoliticians(doc: ScenarioDocument, count?: number): ScenarioDocument {
  const seats =
    doc.contentSections.constitution?.assemblySeats ??
    doc.contentSections.world?.assemblySeats ??
    24;
  const target = count ?? seats;
  const parties = doc.contentSections.parties ?? [];
  const existing = [...(doc.contentSections.people?.politicians ?? [])];
  const ids = new Set(existing.map((p) => p.id));
  for (let i = 0; i < target; i++) {
    const id = `NPC_GEN_${String(i + 1).padStart(4, "0")}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const party = parties[i % Math.max(1, parties.length)];
    existing.push({
      id,
      name: `Assembly Member ${i + 1}`,
      partyId: party?.id ?? null,
      office: "assembly_member",
      background: "politics",
    });
  }
  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      people: { politicians: existing },
    },
  };
}

export function generateLeaders(doc: ScenarioDocument): ScenarioDocument {
  const parties = (doc.contentSections.parties ?? []).map((p) => ({ ...p }));
  const politicians = [...(doc.contentSections.people?.politicians ?? [])];
  const byId = new Map(politicians.map((p) => [p.id, p]));

  for (const party of parties) {
    if (party.leaderId && byId.has(party.leaderId)) continue;
    const id = `${party.id}_LDR`;
    if (!byId.has(id)) {
      const person: ScenarioPoliticianSection = {
        id,
        name: `${party.abbreviation || party.name} Leader`,
        partyId: party.id,
        office: "party_leader",
        background: "politics",
      };
      politicians.push(person);
      byId.set(id, person);
    }
    party.leaderId = id;
  }

  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      parties,
      people: { politicians },
    },
  };
}

const DEFAULT_MINISTRIES = [
  "MIN_FIN",
  "MIN_FOR",
  "MIN_INT",
  "MIN_JUS",
  "MIN_DEF",
  "MIN_HLTH",
  "MIN_EDU",
];

export function fillCabinet(doc: ScenarioDocument): ScenarioDocument {
  const politicians = [...(doc.contentSections.people?.politicians ?? [])];
  const parties = doc.contentSections.parties ?? [];
  const leadParty = parties[0]?.id ?? null;
  const used = new Set((doc.contentSections.government?.cabinet ?? []).map((c) => c.holderId));
  const pool = politicians.filter((p) => p.partyId === leadParty || leadParty == null);
  const cabinet = DEFAULT_MINISTRIES.map((ministryId) => {
    let holder = pool.find((p) => !used.has(p.id));
    if (!holder) {
      const id = `NPC_CAB_${ministryId}`;
      holder = {
        id,
        name: `Minister ${ministryId.replace("MIN_", "")}`,
        partyId: leadParty,
        office: "minister",
      };
      politicians.push(holder);
    }
    used.add(holder.id);
    holder.office = "minister";
    return { ministryId, holderId: holder.id };
  });

  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      people: { politicians },
      government: {
        ...(doc.contentSections.government ?? {}),
        cabinet,
        coalitionPartyIds:
          doc.contentSections.government?.coalitionPartyIds ?? (leadParty ? [leadParty] : []),
      },
    },
  };
}

export function generateConstituencies(doc: ScenarioDocument): ScenarioDocument {
  const seats =
    doc.contentSections.constitution?.assemblySeats ??
    doc.contentSections.world?.assemblySeats ??
    24;
  const provinces = doc.contentSections.geography?.provinces ?? [];
  if (provinces.length === 0) return doc;
  const per = Math.max(1, Math.floor(seats / provinces.length));
  let rem = seats - per * provinces.length;
  const constituencies = provinces.map((p) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    return {
      id: `CON_${p.id}`,
      name: `${p.name} District`,
      provinceId: p.id,
      seats: per + extra,
      ...(p.population != null ? { population: p.population } : {}),
    };
  });
  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      geography: {
        ...(doc.contentSections.geography ?? {}),
        provinces,
        constituencies,
      },
    },
  };
}

export { quickBuildScenario };
