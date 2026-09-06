import { getAgentProfile } from "../agents/profile.js";
import { canAssumeOffice } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { PolicyItem } from "../legislature/types.js";
import { currentMinisterHolderId, ministerOfficeIds } from "./state.js";
import { isWillingCabinet } from "../politics/careers.js";
import { activeCoalition } from "../politics/coalitions.js";
import { partyPlatformIssueForBillItem } from "../parties/platforms.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";

export function chooseMinisterAppointment(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  officeId: string,
  rng: RngService,
): string | null {
  const president = state.politicians[presidentId];
  if (!president) return null;
  const servingMinisters = new Set(
    Object.values(state.officeTerms)
      .filter(
        (term) =>
          (term.status === "active" || term.status === "suspended") &&
          term.holdingKind === "substantive" &&
          world.offices[term.officeId]?.kind === "minister",
      )
      .map((term) => term.holderId),
  );
  const candidates = Object.values(state.politicians)
    .filter((p) => p.alive && !p.retired && p.id !== state.playerPoliticianId)
    .filter((p) => !servingMinisters.has(p.id))
    .filter((p) => canAssumeOffice(state, world, officeId, p.id, "substantive") == null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (candidates.length === 0) return null;

  const coalition = activeCoalition(state);
  const coalitionSeats = coalition
    ? Object.fromEntries(
        coalition.partyIds.map((partyId) => [
          partyId,
          Object.values(state.officeTerms).filter(
            (term) =>
              (term.status === "active" || term.status === "suspended") &&
              world.offices[term.officeId]?.kind === "minister" &&
              state.politicians[term.holderId]?.partyId === partyId,
          ).length,
        ]),
      )
    : {};

  const scored = candidates.map((p) => {
    const profile = getAgentProfile(world, state, p.id);
    const sameParty = p.partyId && p.partyId === president.partyId ? 1 : 0;
    const admin = profile?.skills.administration ?? 0.4;
    const willing = isWillingCabinet(state, p.id) ? 0.35 : 0;
    let coalitionFit = 0;
    if (coalition && p.partyId && coalition.partyIds.includes(p.partyId)) {
      const share = coalition.cabinetShares[p.partyId] ?? 0;
      const held = coalitionSeats[p.partyId] ?? 0;
      const totalMinisters = Math.max(1, ministerOfficeIds(world).length);
      const currentShare = held / totalMinisters;
      coalitionFit = 0.25 + Math.max(0, share - currentShare) * 0.5;
    } else if (coalition && p.partyId && !coalition.partyIds.includes(p.partyId)) {
      coalitionFit = -0.15;
    }
    const noise = rng.float01("legislature") * 0.12;
    return {
      id: p.id,
      score: sameParty * 0.45 + admin * 0.3 + willing + coalitionFit + noise,
    };
  });
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return scored[0]?.id ?? null;
}

export function chooseRegulationIssue(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  rng: RngService,
): { ministryOfficeId: string; item: PolicyItem } | null {
  if (rng.float01("legislature") > 0.12) return null;
  const profile = getAgentProfile(world, state, presidentId);
  if (!profile) return null;
  const ministries = ministerOfficeIds(world).filter(
    (id) => currentMinisterHolderId(world, state, id) != null,
  );
  if (ministries.length === 0) return null;
  const officeId = ministries[Math.floor(rng.float01("legislature") * ministries.length)]!;
  const issues = world.issueIds.slice().sort();
  if (issues.length === 0) return null;

  const presidentPol = state.politicians[presidentId];
  const coalition = activeCoalition(state);
  const demand =
    (presidentPol?.partyId
      ? state.legislatureRuntime.caucusLeadership[presidentPol.partyId]?.platformDemand
      : null) ??
    coalition?.policyPriorities[0] ??
    null;
  let issueId = issues[Math.floor(rng.float01("legislature") * issues.length)]!;
  if (demand && (PARTY_PLATFORM_ISSUES as readonly string[]).includes(demand)) {
    const mapped = issues.find((id) => {
      const platform = partyPlatformIssueForBillItem(id, null);
      return platform === (demand as PartyPlatformIssue);
    });
    if (mapped && rng.float01("legislature") < 0.55) issueId = mapped;
  }

  const axis = world.issueDimensions[issueId] ?? "institutional";
  const lean =
    axis === "economic" || axis === "economic-social"
      ? profile.ideology.economic
      : axis === "social"
        ? profile.ideology.social
        : profile.ideology.authority;
  return {
    ministryOfficeId: officeId,
    item: {
      issueId,
      direction: lean >= 0 ? 1 : -1,
      magnitude: Math.min(0.35, Math.abs(lean) * 0.4 + 0.1),
      fiscalImpact: null,
    },
  };
}
