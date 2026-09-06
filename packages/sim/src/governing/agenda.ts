import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { activeCoalition } from "../politics/coalitions.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";
import type { KernelWorld, SimState } from "../types.js";
import { departmentForIssue } from "./departments.js";
import { ensureGoverningRuntime } from "./state.js";
import type { GovernmentAgenda, GovernmentAgendaItem } from "./types.js";

const PLATFORM_TO_ISSUE: Record<PartyPlatformIssue, string> = {
  economy: "ISS_OWNERSHIP",
  taxes: "ISS_WELFARE",
  labor: "ISS_LABOR",
  housing: "ISS_HOUSING",
  social_policy: "ISS_WELFARE",
  environment: "ISS_CLIMATE",
  institutional_reform: "ISS_REFORM",
  foreign_policy: "ISS_DEFENSE",
};

function presidentPartyId(world: KernelWorld, state: SimState): string | null {
  const presidentId = currentPresidentialAuthorityId(world, state);
  if (!presidentId) return null;
  return state.politicians[presidentId]?.partyId ?? null;
}

function titleForIssue(issueId: string, source: string): string {
  const short = issueId.replace(/^ISS_/, "").toLowerCase().replaceAll("_", " ");
  return `${source}: ${short}`;
}

/**
 * Build government agenda from governing party platform, active coalition
 * agreement priorities, and live crises (foreign / budget / emergency).
 */
export function refreshGovernmentAgenda(world: KernelWorld, state: SimState): GovernmentAgenda {
  const runtime = ensureGoverningRuntime(state);
  const items: GovernmentAgendaItem[] = [];
  let seq = 1;

  const partyId = presidentPartyId(world, state);
  if (partyId) {
    const platform = state.partyStates[partyId]?.publicPlatform;
    if (platform) {
      const ranked = PARTY_PLATFORM_ISSUES.map((issue) => ({
        issue,
        score: Math.abs(platform.positions[issue] ?? 0),
        direction: platform.positions[issue] ?? 0,
      }))
        .filter((r) => r.score >= 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      for (const row of ranked) {
        const issueId = PLATFORM_TO_ISSUE[row.issue];
        items.push({
          id: `AGENDA_${seq++}`,
          title: titleForIssue(issueId, "Platform"),
          issueId,
          priority: Math.min(1, 0.4 + row.score),
          source: "platform",
          departmentId: departmentForIssue(issueId),
          status: "active",
        });
      }
    }
  }

  const coalition = activeCoalition(state);
  if (coalition) {
    for (const issue of coalition.policyPriorities.slice(0, 3)) {
      const issueId = PLATFORM_TO_ISSUE[issue] ?? "ISS_REFORM";
      if (items.some((i) => i.issueId === issueId && i.source === "coalition")) continue;
      items.push({
        id: `AGENDA_${seq++}`,
        title: titleForIssue(issueId, "Coalition"),
        issueId,
        priority: 0.75,
        source: "coalition",
        departmentId: departmentForIssue(issueId),
        status: "active",
      });
    }
  }

  const emergencies = Object.values(state.executiveRuntime.emergencies).filter(
    (e) => e.status === "active",
  );
  if (emergencies.length > 0) {
    items.push({
      id: `AGENDA_${seq++}`,
      title: "Crisis: emergency management",
      issueId: "ISS_EXEC",
      priority: 0.95,
      source: "crisis",
      departmentId: "interior",
      status: "active",
    });
  }

  const foreignCrises = Object.values(state.foreignAffairsRuntime.crises ?? {}).filter(
    (c) => c.stage === "active" || c.stage === "incident" || c.stage === "conflict",
  );
  if (foreignCrises.length > 0) {
    items.push({
      id: `AGENDA_${seq++}`,
      title: "Crisis: foreign affairs",
      issueId: "ISS_DEFENSE",
      priority: 0.9,
      source: "crisis",
      departmentId: "foreign",
      status: "active",
    });
  }

  if (runtime.budgetCycle.failureConsequence) {
    items.push({
      id: `AGENDA_${seq++}`,
      title: "Crisis: budget continuity",
      issueId: "ISS_WELFARE",
      priority: 0.92,
      source: "crisis",
      departmentId: "finance",
      status: "active",
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  const agenda: GovernmentAgenda = {
    updatedDate: state.currentDate,
    items: items.slice(0, 8),
  };
  runtime.agenda = agenda;
  return agenda;
}
