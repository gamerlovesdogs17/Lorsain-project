import { z } from "zod";

/** Locked 0..1 scale for simulation traits/skills. */
export const TRAIT_SCALE = { min: 0, max: 1 } as const;
export const SKILL_SCALE = { min: 0, max: 1 } as const;

const unitInterval = z.number().min(0).max(1);

export const PoliticianTraitsSchema = z.object({
  ambition: unitInterval,
  integrity: unitInterval,
  ego: unitInterval,
  riskTolerance: unitInterval,
  sociability: unitInterval,
  pragmatism: unitInterval,
  institutionalism: unitInterval,
  partyLoyalty: unitInterval,
  factionLoyalty: unitInterval,
  retirementInclination: unitInterval,
});

export const PoliticianSkillsSchema = z.object({
  campaigning: unitInterval,
  fundraising: unitInterval,
  legislation: unitInterval,
  administration: unitInterval,
  media: unitInterval,
  negotiation: unitInterval,
});
