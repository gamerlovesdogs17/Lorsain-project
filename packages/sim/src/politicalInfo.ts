/** Shared qualitative political-information labels and role-based access tiers. */

import { currentMinisterHolderId } from "./executive/state.js";
import { DEPARTMENT_OFFICE_IDS } from "./governing/departments.js";
import type { KernelWorld, SimState } from "./types.js";

/** How much political information the player may see for a domain. */
export type InformationAccess = "public" | "role" | "confidential" | "debug";

/** Information domains gated by office / party role. */
export type InformationDomain = "whip_votes" | "party_org" | "treasury" | "ministry" | "diplomacy";

const ACCESS_RANK: Record<InformationAccess, number> = {
  public: 0,
  role: 1,
  confidential: 2,
  debug: 3,
};

export function informationAccessAtLeast(
  access: InformationAccess,
  minimum: InformationAccess,
): boolean {
  return ACCESS_RANK[access] >= ACCESS_RANK[minimum];
}

export function canShowExactInternals(debugMode: boolean): boolean {
  return Boolean(debugMode);
}

/**
 * Role-based access for a domain. Never returns `debug` — that is only via
 * {@link resolveInformationAccess} / {@link canShowExactInternals}.
 * Privileged roles still do not unlock exact AI weights in normal play.
 */
export function playerInformationAccess(
  world: KernelWorld,
  state: SimState,
  playerId: string,
  domain: InformationDomain,
): InformationAccess {
  if (!playerId || !state.politicians[playerId]) return "public";

  switch (domain) {
    case "whip_votes":
      return isAssemblyWhipOrFloorLeader(state, playerId) ? "role" : "public";
    case "party_org":
      return isNationalPartyOfficer(state, playerId, "chair") ? "role" : "public";
    case "treasury":
      return isNationalPartyOfficer(state, playerId, "treasurer") ? "confidential" : "public";
    case "ministry":
      return holdsAnyMinistry(world, state, playerId) ? "role" : "public";
    case "diplomacy":
      return currentMinisterHolderId(world, state, DEPARTMENT_OFFICE_IDS.foreign) === playerId
        ? "role"
        : "public";
    default:
      return "public";
  }
}

/** Promote role access to `debug` when Debug Mode is on. */
export function resolveInformationAccess(
  roleAccess: InformationAccess,
  debugMode: boolean,
): InformationAccess {
  if (canShowExactInternals(debugMode)) return "debug";
  return roleAccess;
}

export function playerEffectiveInformationAccess(
  world: KernelWorld,
  state: SimState,
  playerId: string,
  domain: InformationDomain,
  debugMode: boolean,
): InformationAccess {
  return resolveInformationAccess(
    playerInformationAccess(world, state, playerId, domain),
    debugMode,
  );
}

/** Exact AI / vote-engine weights stay debug-only even for privileged roles. */
export function mayShowExactAiWeights(access: InformationAccess): boolean {
  return access === "debug";
}

/** Authorized ledger figures (e.g. party funds for the treasurer). */
export function mayShowAuthorizedExactValue(access: InformationAccess): boolean {
  return informationAccessAtLeast(access, "confidential");
}

function playerPartyId(state: SimState, playerId: string): string | null {
  return state.politicians[playerId]?.partyId ?? null;
}

function isAssemblyWhipOrFloorLeader(state: SimState, playerId: string): boolean {
  const partyId = playerPartyId(state, playerId);
  if (!partyId) return false;
  const leadership = state.legislatureRuntime.caucusLeadership[partyId];
  if (!leadership) return false;
  return leadership.whipId === playerId || leadership.floorLeaderId === playerId;
}

function isNationalPartyOfficer(
  state: SimState,
  playerId: string,
  role: "chair" | "vice_chair" | "treasurer",
): boolean {
  const partyId = playerPartyId(state, playerId);
  if (!partyId) return false;
  const officers = state.partyOrgRuntime?.officers?.[partyId];
  return officers?.[role]?.politicianId === playerId;
}

function holdsAnyMinistry(world: KernelWorld, state: SimState, playerId: string): boolean {
  for (const officeId of Object.values(DEPARTMENT_OFFICE_IDS)) {
    if (currentMinisterHolderId(world, state, officeId) === playerId) return true;
  }
  return false;
}

export function formatShareEstimate(share0to1: number, opts?: { exact?: boolean }): string {
  const share = Number.isFinite(share0to1) ? Math.max(0, Math.min(1, share0to1)) : 0;
  if (opts?.exact) return `${(share * 100).toFixed(1)}%`;
  const pct = share * 100;
  if (pct >= 55) return "a clear majority";
  if (pct >= 50) return "majority";
  if (pct >= 45) return "nearly half";
  if (pct >= 38) return "around two-fifths";
  if (pct >= 30) return "around one-third";
  if (pct >= 24) return "roughly one quarter";
  if (pct >= 18) return "20–30%";
  if (pct >= 12) return "around one-fifth";
  if (pct >= 8) return "about one-tenth";
  if (pct >= 4) return "a small share";
  return "marginal";
}

/** Party-org share text: chairs get finer bands; debug gets exact; never AI weights. */
export function formatShareForAccess(share0to1: number, access: InformationAccess): string {
  if (mayShowExactAiWeights(access)) return formatShareEstimate(share0to1, { exact: true });
  if (informationAccessAtLeast(access, "role")) {
    const share = Number.isFinite(share0to1) ? Math.max(0, Math.min(1, share0to1)) : 0;
    const rounded = Math.round(share * 20) * 5;
    return `around ${rounded}%`;
  }
  return formatShareEstimate(share0to1);
}

/** Treasurer / confidential ledger: exact when authorized; otherwise a coarse band. */
export function formatFundsForAccess(
  amount: number | string | null | undefined,
  access: InformationAccess,
): string {
  if (amount == null || amount === "") return "not published";
  if (mayShowAuthorizedExactValue(access)) return String(amount);
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "held privately";
  if (n >= 1_000_000) return "a large treasury";
  if (n >= 250_000) return "substantial reserves";
  if (n >= 50_000) return "a working balance";
  if (n > 0) return "limited funds";
  return "empty books";
}

export function formatLeadershipSecurity(level: string): string {
  return level.replace(/_/g, " ");
}

export function formatInfluenceBand(
  share0to1: number,
): "Marginal" | "Limited" | "Moderate" | "Strong" | "Dominant" {
  const share = Number.isFinite(share0to1) ? Math.max(0, Math.min(1, share0to1)) : 0;
  if (share >= 0.5) return "Dominant";
  if (share >= 0.3) return "Strong";
  if (share >= 0.15) return "Moderate";
  if (share >= 0.05) return "Limited";
  return "Marginal";
}

export function formatWhipLean(
  scoreOrCategory: number | string,
): "Likely yes" | "Lean yes" | "Unclear" | "Lean no" | "Likely no" {
  if (typeof scoreOrCategory === "string") {
    const key = scoreOrCategory.toLowerCase().replace(/\s+/g, "_");
    if (key === "likely_yes" || key === "likely yes") return "Likely yes";
    if (key === "lean_yes" || key === "lean yes") return "Lean yes";
    if (key === "lean_no" || key === "lean no") return "Lean no";
    if (key === "likely_no" || key === "likely no") return "Likely no";
    if (key === "unclear" || key === "toss_up" || key === "uncertain") return "Unclear";
  }
  const score = typeof scoreOrCategory === "number" ? scoreOrCategory : 0;
  if (score >= 0.35) return "Likely yes";
  if (score >= 0.12) return "Lean yes";
  if (score <= -0.35) return "Likely no";
  if (score <= -0.12) return "Lean no";
  return "Unclear";
}

/**
 * Chamber support outlook. Whip / floor leader get richer qualitative text;
 * exact seat counts only in debug. Never exposes raw AI weights.
 */
export function formatWhipVoteOutlook(
  estimate: { likelyYes: number; likelyNo: number; uncertain: number } | null | undefined,
  access: InformationAccess,
): string {
  if (!estimate) return "Outlook unclear";
  const total = Math.max(1, estimate.likelyYes + estimate.likelyNo + estimate.uncertain);
  const lean = (estimate.likelyYes - estimate.likelyNo) / total;
  const leanLabel = formatWhipLean(lean);
  if (access === "debug") {
    return `${leanLabel} (Yes ${estimate.likelyYes} · No ${estimate.likelyNo} · Unc ${estimate.uncertain})`;
  }
  if (!informationAccessAtLeast(access, "role")) return leanLabel;

  const uncShare = estimate.uncertain / total;
  const absLean = Math.abs(lean);
  const undecided =
    uncShare >= 0.28
      ? "many members still look undecided"
      : uncShare >= 0.15
        ? "a meaningful undecided bloc remains"
        : "most members look decided";
  const margin =
    absLean >= 0.35
      ? "the chamber lean looks clear"
      : absLean >= 0.12
        ? "the margin looks modest"
        : "the outcome looks finely balanced";
  return `${leanLabel} — ${undecided}; ${margin}`;
}

export function formatTensionBand(value: number): "Low" | "Elevated" | "Serious" | "Severe" {
  const n = Number.isFinite(value) ? value : 0;
  const normalized = n > 1 ? n / 100 : n;
  if (normalized >= 0.75) return "Severe";
  if (normalized >= 0.5) return "Serious";
  if (normalized >= 0.25) return "Elevated";
  return "Low";
}

export function formatRelationBand(
  scoreOrCategory: number | string,
): "close ally" | "friendly" | "cooperative" | "cool" | "strained" | "hostile" {
  if (typeof scoreOrCategory === "string") {
    const key = scoreOrCategory.toLowerCase().replace(/_/g, " ");
    if (
      key === "close ally" ||
      key === "friendly" ||
      key === "cooperative" ||
      key === "cool" ||
      key === "strained" ||
      key === "hostile"
    ) {
      return key;
    }
  }
  const score = typeof scoreOrCategory === "number" ? scoreOrCategory : 0;
  if (score >= 0.7) return "close ally";
  if (score >= 0.4) return "friendly";
  if (score >= 0.15) return "cooperative";
  if (score >= -0.15) return "cool";
  if (score >= -0.45) return "strained";
  return "hostile";
}

function normalizeRelationGeneral(general: number): number {
  return Math.abs(general) > 1.5 ? general / 100 : general;
}

function qualitativeLevel01(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "uneven";
  if (n >= 0.7) return "strong";
  if (n >= 0.5) return "solid";
  if (n >= 0.35) return "mixed";
  return "weak";
}

/**
 * Diplomatic relation copy. Foreign minister (`role`+) gets trust / ties / tension
 * colour; ordinary MPs get the public band only. Exact scores stay debug-gated.
 */
export function describeDiplomaticRelation(
  relation:
    | {
        general: number;
        trust?: number;
        economicTies?: number;
        securityTension?: number;
      }
    | null
    | undefined,
  access: InformationAccess,
): string {
  if (!relation) return "No recorded diplomatic picture yet.";
  const band = formatRelationBand(normalizeRelationGeneral(relation.general));
  if (access === "debug") {
    return `Relations are ${band} (general ${relation.general.toFixed(0)}; trust ${
      relation.trust?.toFixed(2) ?? "—"
    }; economic ${relation.economicTies?.toFixed(2) ?? "—"}; tension ${
      relation.securityTension?.toFixed(2) ?? "—"
    }).`;
  }
  if (!informationAccessAtLeast(access, "role")) {
    return `Relations are ${band}.`;
  }
  const trust = qualitativeLevel01(relation.trust);
  const economic = qualitativeLevel01(relation.economicTies);
  const tension = formatTensionBand(relation.securityTension ?? 0).toLowerCase();
  return `Relations are ${band}, with ${trust} trust and ${economic} economic ties; security climate looks ${tension}.`;
}

export function explainVoteQualitative(factors: { labels: string[] }): string {
  const labels = factors.labels.map((label) => label.trim()).filter(Boolean);
  if (labels.length === 0) return "Likely concerns are not yet clear from public signals.";
  if (labels.length === 1) return `Likely concerns include ${labels[0]}.`;
  if (labels.length === 2) return `Likely concerns include ${labels[0]} and ${labels[1]}.`;
  const head = labels.slice(0, -1).join(", ");
  return `Likely concerns include ${head}, and ${labels[labels.length - 1]}.`;
}
