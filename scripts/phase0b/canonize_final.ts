/**
 * Phase 0b final canonization — surgical profile/metadata fixes only.
 * Does NOT regenerate elections, voter blocs, turnout, pollsters, or seat totals.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, rel), "utf8")) as T;
}

function writeJson(rel: string, value: unknown): void {
  writeFileSync(resolve(ROOT, rel), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha16(rel: string): string {
  return createHash("sha256")
    .update(readFileSync(resolve(ROOT, rel)))
    .digest("hex")
    .slice(0, 16);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function hash01(id: string, salt: string): number {
  const h = createHash("sha256").update(`${id}|${salt}`).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

function unaffiliatedLoyalty(id: string): { partyLoyalty: number; factionLoyalty: number } {
  return {
    partyLoyalty: round3(0.02 + hash01(id, "partyLoyalty") * 0.18),
    factionLoyalty: round3(0.02 + hash01(id, "factionLoyalty") * 0.13),
  };
}

function courtLoyalty(id: string): {
  partyLoyalty: number;
  factionLoyalty: number;
  institutionalism: number;
} {
  return {
    partyLoyalty: round3(0.02 + hash01(id, "courtParty") * 0.1),
    factionLoyalty: round3(0.02 + hash01(id, "courtFaction") * 0.08),
    institutionalism: round3(0.74 + hash01(id, "courtInst") * 0.16),
  };
}

type Role = { type: string; faction_id?: string; [k: string]: unknown };
type Figure = {
  id: string;
  name: string;
  party_id?: string | null;
  faction_id?: string | null;
  party?: string | null;
  faction?: string | null;
  background?: string;
  traits?: Record<string, number>;
  roles: Role[];
  court?: Record<string, unknown>;
  [k: string]: unknown;
};

const AUTHORED = new Set(
  Array.from({ length: 30 }, (_, i) => `NPC${String(i + 1).padStart(3, "0")}`),
);

const COURT_CAREERS: Record<
  string,
  {
    prior_path: string;
    prior_offices: string[];
    bar_admission_year: number;
    years_legal_practice_at_appointment: number;
    path_summary: string;
  }
> = {
  NPC991: {
    prior_path: "appellate_judge",
    prior_offices: ["Judge, Southmark Provincial Court", "Justice, Southmark Court of Appeal"],
    bar_admission_year: 1989,
    years_legal_practice_at_appointment: 28,
    path_summary: "Long appellate service before Constitutional Court appointment.",
  },
  NPC992: {
    prior_path: "private_counsel_then_judge",
    prior_offices: ["Partner, Valen public-commercial chambers", "Judge, Capital Circuit Court"],
    bar_admission_year: 1992,
    years_legal_practice_at_appointment: 26,
    path_summary: "Senior private counsel, then circuit judge, then Constitutional Court.",
  },
  NPC993: {
    prior_path: "public_defender_then_judge",
    prior_offices: [
      "Senior public defender, Aurel District",
      "Constitutional rights litigator",
      "Judge, Aurel District Court",
    ],
    bar_admission_year: 1995,
    years_legal_practice_at_appointment: 24,
    path_summary: "Public-defender and rights litigation path into the judiciary.",
  },
  NPC994: {
    prior_path: "legal_academic",
    prior_offices: [
      "Professor of Constitutional Law, University of Valen",
      "Counsel to the Assembly Constitutional Affairs Committee",
    ],
    bar_admission_year: 1987,
    years_legal_practice_at_appointment: 30,
    path_summary: "Constitutional scholar with advisory public-law service.",
  },
  NPC995: {
    prior_path: "prosecutor_then_judge",
    prior_offices: ["Crown prosecutor, Northmark", "Judge, Northmark Provincial Court"],
    bar_admission_year: 1991,
    years_legal_practice_at_appointment: 27,
    path_summary: "Prosecutorial career followed by provincial judicial service.",
  },
  NPC996: {
    prior_path: "justice_ministry_official",
    prior_offices: ["Director of Legal Policy, Ministry of Justice", "Deputy Solicitor-General"],
    bar_admission_year: 1990,
    years_legal_practice_at_appointment: 29,
    path_summary: "Senior justice-ministry legal official before judicial appointment.",
  },
  NPC997: {
    prior_path: "lower_court_judge",
    prior_offices: [
      "Magistrate, Harbour Circuit",
      "Judge, Harbour Provincial Court",
      "Justice, Harbour Court of Appeal",
    ],
    bar_admission_year: 1988,
    years_legal_practice_at_appointment: 31,
    path_summary: "Career judiciary from magistrates’ bench through appellate service.",
  },
  NPC998: {
    prior_path: "constitutional_lawyer",
    prior_offices: [
      "Public-law advocate before the Constitutional Court",
      "Counsel, Office of the Parliamentary Counsel",
    ],
    bar_admission_year: 1994,
    years_legal_practice_at_appointment: 25,
    path_summary: "Constitutional and public-law practice before elevation to the Court.",
  },
};

/** Deliberate faction chairs for previously missing caucuses (existing MPs only). */
const NEW_FACTION_CHAIRS: Record<string, string> = {
  FAC_LAB_SD: "NPC002", // Daria Soren — Assembly Speaker, Social Democratic Caucus
  FAC_GRN_MAIN: "NPC006", // Mila Orsen — Green party leader
  FAC_GRN_ECO: "NPC926", // Haris Northam — senior Eco-Social MP by skill profile
  FAC_RL_AUTO: "NPC007", // Sera Talin — Rural League party leader
  FAC_RL_COOP: "NPC315", // Halina Wex — senior Cooperative Wing MP
  FAC_PM_NAT: "NPC008", // Viktor Drazen — People’s Movement party leader
  FAC_PM_ECON: "NPC804", // Petar Simic — senior Economic Nationalists MP
};

const LEGAL_PATHS = new Set(Object.values(COURT_CAREERS).map((c) => c.prior_path));

function main(): void {
  const before = {
    elec: sha16("data/terena_election_assembly_2026.json"),
    blocs: sha16("data/terena_voter_blocs_2028.json"),
    poll: sha16("data/terena_pollsters.json"),
    hist: sha16("data/terena_historical_candidates_2026.json"),
  };

  const figuresFile = loadJson<{
    figures: Figure[];
    content_version?: string;
    canonical_seed?: string;
  }>("data/terena_starting_figures.json");
  const byId = new Map(figuresFile.figures.map((f) => [f.id, f]));

  // 1) Independent membership semantics
  for (const f of figuresFile.figures) {
    if (f.party_id === "PARTY_IND") {
      f.party_id = null;
      f.faction_id = null;
      f.faction = null;
      if (!f.party || f.party === "Independents") f.party = "Independent";
    }
  }

  // 2) Independent / unaffiliated loyalty (preserve authored NPC001–030)
  for (const f of figuresFile.figures) {
    if (AUTHORED.has(f.id)) continue;
    if (!f.traits) continue;
    if (f.party_id == null) {
      const loy = unaffiliatedLoyalty(f.id);
      f.traits.partyLoyalty = loy.partyLoyalty;
      f.traits.factionLoyalty = loy.factionLoyalty;
    } else if (f.faction_id == null) {
      f.traits.factionLoyalty = unaffiliatedLoyalty(f.id).factionLoyalty;
    }
  }

  // 3) Court legal careers + nonpartisan traits (preserve NPC020 authored profile)
  for (const [id, career] of Object.entries(COURT_CAREERS)) {
    const f = byId.get(id);
    if (!f?.court) throw new Error(`Missing court figure ${id}`);
    f.background = "law";
    f.party_id = null;
    f.faction_id = null;
    f.party = "Nonpartisan";
    f.faction = null;
    const loy = courtLoyalty(id);
    f.traits = {
      ...f.traits!,
      partyLoyalty: loy.partyLoyalty,
      factionLoyalty: loy.factionLoyalty,
      institutionalism: Math.max(f.traits!.institutionalism ?? 0, loy.institutionalism),
    };
    f.court = {
      ...f.court,
      legal_career: career,
    };
  }

  const mora = byId.get("NPC020");
  if (!mora?.court) throw new Error("NPC020 missing");
  // Schema-normalizing career metadata only; preserve authored traits/philosophy/terms.
  if (!(mora.court as { legal_career?: unknown }).legal_career) {
    mora.court = {
      ...mora.court,
      legal_career: {
        prior_path: "appellate_judge",
        prior_offices: [
          "Judge, Valen Circuit Court",
          "Justice, Valen Court of Appeal",
          "Chief Justice of the Constitutional Court",
        ],
        bar_admission_year: 1985,
        years_legal_practice_at_appointment: 34,
        path_summary:
          "Authored institutionalist appellate career culminating in the Chief Justiceship.",
      },
    };
  }

  // 4) Complete faction chairs
  for (const [factionId, figureId] of Object.entries(NEW_FACTION_CHAIRS)) {
    const f = byId.get(figureId);
    if (!f) throw new Error(`Faction chair candidate missing: ${figureId}`);
    if (f.faction_id !== factionId) {
      throw new Error(`${figureId} faction_id ${f.faction_id} != ${factionId}`);
    }
    const hasChair = (f.roles ?? []).some(
      (r) => r.type === "faction_chair" && (r.faction_id ?? f.faction_id) === factionId,
    );
    if (!hasChair) {
      f.roles = [{ type: "faction_chair", faction_id: factionId }, ...(f.roles ?? [])];
    }
  }

  writeJson("data/terena_starting_figures.json", figuresFile);

  const after = {
    elec: sha16("data/terena_election_assembly_2026.json"),
    blocs: sha16("data/terena_voter_blocs_2028.json"),
    poll: sha16("data/terena_pollsters.json"),
    hist: sha16("data/terena_historical_candidates_2026.json"),
  };
  for (const k of Object.keys(before) as (keyof typeof before)[]) {
    if (before[k] !== after[k]) {
      throw new Error(`Unexpected drift in ${k}: ${before[k]} -> ${after[k]}`);
    }
  }

  // Sanity report
  const partyInd = figuresFile.figures.filter((f) => f.party_id === "PARTY_IND");
  const judges = figuresFile.figures.filter((f) =>
    (f.roles ?? []).some(
      (r) => r.type === "constitutional_court_judge" || r.type === "chief_justice",
    ),
  );
  const chairs = figuresFile.figures.filter((f) =>
    (f.roles ?? []).some((r) => r.type === "faction_chair"),
  );
  console.log(
    JSON.stringify(
      {
        hashes_unchanged: after,
        party_ind_figures: partyInd.length,
        judges: judges.map((j) => ({
          id: j.id,
          bg: j.background,
          path: (j.court as { legal_career?: { prior_path?: string } })?.legal_career?.prior_path,
          pl: j.traits?.partyLoyalty,
          fl: j.traits?.factionLoyalty,
          inst: j.traits?.institutionalism,
        })),
        legal_paths_known: [...LEGAL_PATHS],
        faction_chairs: chairs.map((c) => ({
          id: c.id,
          name: c.name,
          faction: c.roles.find((r) => r.type === "faction_chair")?.faction_id ?? c.faction_id,
        })),
      },
      null,
      2,
    ),
  );
}

main();
