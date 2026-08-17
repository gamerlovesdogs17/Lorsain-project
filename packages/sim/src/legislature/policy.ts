import type { CommitteeId } from "./types.js";
import type { KernelWorld } from "../types.js";

/** Functional committee scaffolding until richer canonical committee content exists. */
export const COMMITTEE_NAMES: Record<CommitteeId, string> = {
  COMMITTEE_ECONOMIC: "Economic Affairs",
  COMMITTEE_SOCIAL_ECONOMIC: "Social Economy",
  COMMITTEE_SOCIAL: "Social Policy",
  COMMITTEE_INSTITUTIONAL: "Institutional Affairs",
  COMMITTEE_FOREIGN: "Foreign Affairs",
};

export const LEGISLATURE = {
  maxIntrosPerMonth: 2,
  maxActiveBills: 10,
  committeeSizeMax: 21,
  committeeSizeMin: 5,
  /** Ordinary committee/floor: simple majority of yes+no; tie fails. Not constitutional canon. */
  ordinaryTieFails: true,
  maxAmendmentsPerBill: 2,
} as const;

export type LegislativeConstitution = {
  assemblySeatCount: number;
  assemblyAbsoluteMajority: number;
};

export function legislativeConstitutionFromSeats(seats: number): LegislativeConstitution {
  const n = Math.max(0, Math.floor(seats));
  return {
    assemblySeatCount: n,
    assemblyAbsoluteMajority: n === 0 ? 1 : Math.floor(n / 2) + 1,
  };
}

/** Authorized Assembly absolute majority from kernel constitution, not current attendance. */
export function absoluteMajorityNeeded(world: KernelWorld): number {
  return world.legislativeConstitution.assemblyAbsoluteMajority;
}

export function committeeForDimension(dimension: string): CommitteeId {
  if (dimension === "economic") return "COMMITTEE_ECONOMIC";
  if (dimension === "economic-social") return "COMMITTEE_SOCIAL_ECONOMIC";
  if (dimension === "social") return "COMMITTEE_SOCIAL";
  if (dimension === "foreign") return "COMMITTEE_FOREIGN";
  return "COMMITTEE_INSTITUTIONAL";
}
