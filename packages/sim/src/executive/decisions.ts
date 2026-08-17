import { getAgentProfile } from "../agents/profile.js";
import { canAssumeOffice } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { PolicyItem } from "../legislature/types.js";
import { currentMinisterHolderId, ministerOfficeIds } from "./state.js";

export function chooseMinisterAppointment(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  officeId: string,
  rng: RngService,
): string | null {
  const president = state.politicians[presidentId];
  if (!president) return null;
  const candidates = Object.values(state.politicians)
    .filter((p) => p.alive && !p.retired && p.id !== state.playerPoliticianId)
    .filter((p) => canAssumeOffice(state, world, officeId, p.id, "substantive") == null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (candidates.length === 0) return null;
  const scored = candidates.map((p) => {
    const profile = getAgentProfile(world, state, p.id);
    const sameParty = p.partyId && p.partyId === president.partyId ? 1 : 0;
    const admin = profile?.skills.administration ?? 0.4;
    const noise = rng.float01("legislature") * 0.15;
    return { id: p.id, score: sameParty * 0.6 + admin * 0.4 + noise };
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
  const issueId = issues[Math.floor(rng.float01("legislature") * issues.length)]!;
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
