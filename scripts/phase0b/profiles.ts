import type { RngService } from "../../packages/sim/src/index.ts";
import {
  ISSUE_IDS,
  PARTY_META,
  type Ideology,
  type PartyId,
  type Skills,
  type Traits,
  clamp01,
  clampUnit,
  float01,
  round3,
} from "./shared.ts";

export function partyIdeologyCenter(party: PartyId | null): Ideology {
  switch (party) {
    case "PARTY_LAB":
      return {
        economic: 0.45,
        social: 0.35,
        authority: -0.1,
        green: 0.25,
        nationalism: -0.15,
        globalism: 0.2,
      };
    case "PARTY_NU":
      return {
        economic: -0.35,
        social: -0.25,
        authority: 0.25,
        green: -0.2,
        nationalism: 0.25,
        globalism: -0.1,
      };
    case "PARTY_CR":
      return {
        economic: -0.05,
        social: 0.45,
        authority: -0.25,
        green: 0.2,
        nationalism: -0.2,
        globalism: 0.45,
      };
    case "PARTY_GRN":
      return {
        economic: 0.35,
        social: 0.5,
        authority: -0.2,
        green: 0.75,
        nationalism: -0.25,
        globalism: 0.35,
      };
    case "PARTY_RL":
      return {
        economic: 0.1,
        social: 0.05,
        authority: -0.05,
        green: 0.15,
        nationalism: 0.15,
        globalism: -0.25,
      };
    case "PARTY_PM":
      return {
        economic: 0.2,
        social: -0.2,
        authority: 0.35,
        green: -0.15,
        nationalism: 0.55,
        globalism: -0.45,
      };
    case "PARTY_IND":
    default:
      return {
        economic: 0,
        social: 0.1,
        authority: 0,
        green: 0.05,
        nationalism: 0.05,
        globalism: 0,
      };
  }
}

/** Faction offsets relative to party center (meaningful but overlapping). */
export function factionIdeologyOffset(factionId: string | null): Ideology {
  const z = {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  switch (factionId) {
    case "FAC_LAB_SD":
      return { ...z, economic: 0.0, social: 0.05, green: 0.05 };
    case "FAC_LAB_LEFT":
      return { ...z, economic: 0.22, social: 0.1, green: 0.08, globalism: -0.05 };
    case "FAC_LAB_WORK":
      return { ...z, economic: 0.12, social: -0.08, nationalism: 0.08, globalism: -0.1 };
    case "FAC_LAB_REFORM":
      return { ...z, economic: -0.12, social: 0.12, authority: -0.08, globalism: 0.12 };
    case "FAC_NU_ONE":
      return { ...z, economic: 0.08, social: 0.05, authority: -0.05 };
    case "FAC_NU_MARKET":
      return { ...z, economic: -0.18, social: 0.08, globalism: 0.12, green: -0.05 };
    case "FAC_NU_NAT":
      return { ...z, social: -0.18, authority: 0.18, nationalism: 0.2, globalism: -0.15 };
    case "FAC_CR_LIB":
      return { ...z, social: 0.12, authority: -0.1, globalism: 0.1, green: 0.05 };
    case "FAC_CR_MOD":
      return { ...z, economic: 0.05, social: -0.08, authority: 0.05 };
    case "FAC_GRN_MAIN":
      return { ...z, green: 0.05, social: 0.05 };
    case "FAC_GRN_ECO":
      return { ...z, economic: 0.18, green: 0.08, social: 0.05 };
    case "FAC_RL_AUTO":
      return { ...z, nationalism: 0.08, globalism: -0.12, authority: -0.05 };
    case "FAC_RL_COOP":
      return { ...z, economic: 0.1, green: 0.08, nationalism: 0.05 };
    case "FAC_PM_NAT":
      return { ...z, nationalism: 0.12, authority: 0.1, social: -0.08 };
    case "FAC_PM_ECON":
      return { ...z, economic: 0.15, nationalism: 0.05, globalism: -0.12 };
    default:
      return z;
  }
}

export function sampleIdeology(
  rng: RngService,
  party: PartyId | null,
  factionId?: string | null,
): Ideology {
  const c = partyIdeologyCenter(party);
  const o = factionIdeologyOffset(factionId ?? null);
  const j = () => (float01(rng) - 0.5) * 0.4;
  return {
    economic: round3(clampUnit(c.economic + o.economic + j())),
    social: round3(clampUnit(c.social + o.social + j())),
    authority: round3(clampUnit(c.authority + o.authority + j())),
    green: round3(clampUnit(c.green + o.green + j())),
    nationalism: round3(clampUnit(c.nationalism + o.nationalism + j())),
    globalism: round3(clampUnit(c.globalism + o.globalism + j())),
  };
}

function bell(rng: RngService, mean: number, spread = 0.18): number {
  const u = (float01(rng) + float01(rng) + float01(rng)) / 3;
  return clamp01(mean + (u - 0.5) * 2 * spread);
}

export function sampleTraits(
  rng: RngService,
  role: string,
  opts?: { partyId?: string | null; factionId?: string | null },
): Traits {
  const senior = /president|leader|minister|speaker|governor|justice|chair/i.test(role);
  const unaffiliated = opts?.partyId == null || /independent|nonpartisan/i.test(role);
  const noFaction = opts?.factionId == null || unaffiliated;
  const isJudge = /justice|judge/i.test(role);
  return {
    ambition: round3(bell(rng, senior ? 0.62 : 0.48)),
    integrity: round3(bell(rng, 0.55)),
    ego: round3(bell(rng, senior ? 0.55 : 0.45)),
    riskTolerance: round3(bell(rng, 0.45)),
    sociability: round3(bell(rng, 0.55)),
    pragmatism: round3(bell(rng, 0.58)),
    institutionalism: round3(
      bell(rng, isJudge ? 0.82 : /speaker|president/i.test(role) ? 0.7 : 0.52),
    ),
    partyLoyalty: round3(bell(rng, unaffiliated || isJudge ? 0.1 : 0.58)),
    factionLoyalty: round3(bell(rng, noFaction || isJudge ? 0.08 : 0.5)),
    retirementInclination: round3(bell(rng, senior ? 0.35 : 0.4)),
  };
}

export function sampleSkills(rng: RngService, role: string, electoralQuality?: number): Skills {
  const base = {
    campaigning: 0.45,
    fundraising: 0.42,
    legislation: 0.45,
    administration: 0.45,
    media: 0.42,
    negotiation: 0.48,
  };
  if (/minister|governor|president/i.test(role)) base.administration = 0.62;
  if (/campaign|leader|whip|floor/i.test(role)) base.campaigning = 0.6;
  if (/speaker|chair|whip/i.test(role)) {
    base.legislation = 0.62;
    base.negotiation = 0.65;
  }
  if (/justice|judge/i.test(role)) {
    base.legislation = 0.55;
    base.administration = 0.5;
    base.campaigning = 0.25;
  }
  const q = electoralQuality ?? 0.5;
  const qBoost = (q - 0.5) * 0.28;
  return {
    campaigning: round3(bell(rng, clamp01(base.campaigning + qBoost))),
    fundraising: round3(bell(rng, clamp01(base.fundraising + qBoost * 0.8))),
    legislation: round3(bell(rng, base.legislation)),
    administration: round3(bell(rng, base.administration)),
    media: round3(bell(rng, clamp01(base.media + qBoost * 0.9))),
    negotiation: round3(bell(rng, base.negotiation)),
  };
}

export function sampleSalience(
  rng: RngService,
  party: PartyId | null,
  factionId?: string | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ISSUE_IDS) out[id] = round3(bell(rng, 0.4, 0.25));
  if (party === "PARTY_LAB") {
    out.ISS_LABOR = round3(bell(rng, 0.75));
    out.ISS_WELFARE = round3(bell(rng, 0.7));
  }
  if (party === "PARTY_GRN") out.ISS_CLIMATE = round3(bell(rng, 0.85));
  if (party === "PARTY_NU") {
    out.ISS_POLICING = round3(bell(rng, 0.65));
    out.ISS_IMMIGRATION = round3(bell(rng, 0.6));
  }
  if (party === "PARTY_CR") {
    out.ISS_REFORM = round3(bell(rng, 0.7));
    out.ISS_LIBERTY = round3(bell(rng, 0.65));
  }
  if (party === "PARTY_RL") out.ISS_DECENT = round3(bell(rng, 0.8));
  if (party === "PARTY_PM") {
    out.ISS_TRADE = round3(bell(rng, 0.7));
    out.ISS_VASKARA = round3(bell(rng, 0.55));
  }

  switch (factionId) {
    case "FAC_LAB_LEFT":
      out.ISS_OWNERSHIP = round3(bell(rng, 0.78));
      out.ISS_WELFARE = round3(bell(rng, 0.78));
      break;
    case "FAC_LAB_WORK":
      out.ISS_LABOR = round3(bell(rng, 0.88));
      break;
    case "FAC_LAB_REFORM":
      out.ISS_REFORM = round3(bell(rng, 0.72));
      out.ISS_HOUSING = round3(bell(rng, 0.65));
      break;
    case "FAC_NU_MARKET":
      out.ISS_TRADE = round3(bell(rng, 0.72));
      out.ISS_OWNERSHIP = round3(bell(rng, 0.55));
      break;
    case "FAC_NU_NAT":
      out.ISS_IMMIGRATION = round3(bell(rng, 0.78));
      out.ISS_DEFENSE = round3(bell(rng, 0.7));
      break;
    case "FAC_CR_LIB":
      out.ISS_LIBERTY = round3(bell(rng, 0.78));
      out.ISS_REFORM = round3(bell(rng, 0.75));
      break;
    case "FAC_GRN_ECO":
      out.ISS_OWNERSHIP = round3(bell(rng, 0.65));
      out.ISS_LABOR = round3(bell(rng, 0.6));
      break;
    case "FAC_RL_AUTO":
      out.ISS_DECENT = round3(bell(rng, 0.9));
      break;
    case "FAC_RL_COOP":
      out.ISS_DECENT = round3(bell(rng, 0.75));
      out.ISS_TRADE = round3(bell(rng, 0.55));
      break;
    case "FAC_PM_NAT":
      out.ISS_IMMIGRATION = round3(bell(rng, 0.78));
      out.ISS_POLICING = round3(bell(rng, 0.7));
      break;
    case "FAC_PM_ECON":
      out.ISS_TRADE = round3(bell(rng, 0.8));
      out.ISS_LABOR = round3(bell(rng, 0.65));
      break;
    default:
      break;
  }
  return out;
}

export function pickFaction(rng: RngService, party: PartyId | null): string | null {
  if (!party || party === "PARTY_IND") return null;
  const factions = PARTY_META[party].factions;
  if (!factions.length) return null;
  let r = float01(rng);
  for (const f of factions) {
    r -= f.share;
    if (r <= 0) return f.id;
  }
  return factions[factions.length - 1]!.id;
}

export function factionName(party: PartyId | null, factionId: string | null): string | null {
  if (!party || !factionId) return null;
  return PARTY_META[party].factions.find((f) => f.id === factionId)?.name ?? null;
}

export const BACKGROUNDS = [
  "local government",
  "law",
  "unions",
  "civil service",
  "business",
  "education",
  "medicine",
  "academia",
  "agriculture",
  "military/veteran",
  "nonprofit/advocacy",
  "journalism/media",
] as const;

/** Repair mojibake / ??? apostrophe corruption in display strings. */
export function repairDisplayText(s: string): string {
  return s
    .replace(/\uFFFD/g, "'")
    .replace(/\?\?\?/g, "'")
    .replace(/People's Movement|People.s Movement/g, () => PARTY_META.PARTY_PM.name)
    .replace(/Workers. Left/g, "Workers' Left")
    .replace(/Workers. Bloc/g, "Workers' Bloc");
}
