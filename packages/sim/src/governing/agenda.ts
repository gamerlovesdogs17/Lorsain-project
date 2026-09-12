import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { activeCoalition } from "../politics/coalitions.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";
import type { BillState } from "../legislature/types.js";
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

const TERMINAL_BILL_STATUSES = new Set([
  "withdrawn",
  "defeated",
  "enacted",
  "archived",
  "lapsed",
]);

function presidentPartyId(world: KernelWorld, state: SimState): string | null {
  const presidentId = currentPresidentialAuthorityId(world, state);
  if (!presidentId) return null;
  return state.politicians[presidentId]?.partyId ?? null;
}

function titleForIssue(issueId: string, source: string): string {
  const short = issueId.replace(/^ISS_/, "").toLowerCase().replaceAll("_", " ");
  return `${source}: ${short}`;
}

function billStatusOf(bill: BillState | undefined): string | null {
  return bill?.status ?? null;
}

/**
 * Resolve / refresh exact bill references for agenda items.
 * Never picks among multiple similar bills by title heuristic.
 * Auto-links only when exactly one eligible government bill matches the issue.
 */
export function syncAgendaBillReferences(state: SimState, items: GovernmentAgendaItem[]): void {
  const bills = state.legislatureRuntime.bills;
  for (const item of items) {
    if (item.billId) {
      const existing = bills[item.billId];
      if (existing) {
        item.billStatus = billStatusOf(existing);
        continue;
      }
      item.billId = null;
      item.billStatus = "missing";
    }

    const matches = Object.values(bills).filter((b) => {
      if (TERMINAL_BILL_STATUSES.has(b.status)) return false;
      return b.policyItems?.some((p) => p.issueId === item.issueId) === true;
    });
    if (matches.length === 1) {
      item.billId = matches[0]!.id;
      item.billStatus = billStatusOf(matches[0]);
    } else {
      item.billId = null;
      item.billStatus = matches.length > 1 ? "ambiguous" : null;
    }
  }
}

/** Authoritatively attach a bill to an agenda item (replaces prior reference). */
export function setAgendaItemBill(
  state: SimState,
  agendaItemId: string,
  billId: string | null,
): GovernmentAgendaItem | null {
  const runtime = ensureGoverningRuntime(state);
  const item = runtime.agenda.items.find((i) => i.id === agendaItemId);
  if (!item) return null;
  if (billId == null) {
    item.billId = null;
    item.billStatus = null;
    return item;
  }
  const bill = state.legislatureRuntime.bills[billId];
  if (!bill) {
    item.billId = null;
    item.billStatus = "missing";
    return item;
  }
  item.billId = billId;
  item.billStatus = bill.status;
  return item;
}

/**
 * Build government agenda from governing party platform, active coalition
 * agreement priorities, and live crises (foreign / budget / emergency).
 */
export function refreshGovernmentAgenda(world: KernelWorld, state: SimState): GovernmentAgenda {
  const runtime = ensureGoverningRuntime(state);
  const previousByKey = new Map(
    runtime.agenda.items.map((i) => [`${i.source}:${i.issueId}`, i] as const),
  );
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
        const prev = previousByKey.get(`platform:${issueId}`);
        items.push({
          id: prev?.id ?? `AGENDA_${seq++}`,
          title: titleForIssue(issueId, "Platform"),
          issueId,
          priority: Math.min(1, 0.4 + row.score),
          source: "platform",
          departmentId: departmentForIssue(issueId),
          status: "active",
          billId: prev?.billId ?? null,
          billStatus: prev?.billStatus ?? null,
        });
      }
    }
  }

  const coalition = activeCoalition(state);
  if (coalition) {
    for (const issue of coalition.policyPriorities.slice(0, 3)) {
      const issueId = PLATFORM_TO_ISSUE[issue] ?? "ISS_REFORM";
      if (items.some((i) => i.issueId === issueId && i.source === "coalition")) continue;
      const prev = previousByKey.get(`coalition:${issueId}`);
      items.push({
        id: prev?.id ?? `AGENDA_${seq++}`,
        title: titleForIssue(issueId, "Coalition"),
        issueId,
        priority: 0.75,
        source: "coalition",
        departmentId: departmentForIssue(issueId),
        status: "active",
        billId: prev?.billId ?? null,
        billStatus: prev?.billStatus ?? null,
      });
    }
  }

  const emergencies = Object.values(state.executiveRuntime.emergencies).filter(
    (e) => e.status === "active",
  );
  if (emergencies.length > 0) {
    const prev = previousByKey.get("crisis:ISS_EXEC");
    items.push({
      id: prev?.id ?? `AGENDA_${seq++}`,
      title: "Crisis: emergency management",
      issueId: "ISS_EXEC",
      priority: 0.95,
      source: "crisis",
      departmentId: "interior",
      status: "active",
      billId: prev?.billId ?? null,
      billStatus: prev?.billStatus ?? null,
    });
  }

  const foreignCrises = Object.values(state.foreignAffairsRuntime.crises ?? {}).filter(
    (c) => c.stage === "active" || c.stage === "incident" || c.stage === "conflict",
  );
  if (foreignCrises.length > 0) {
    const prev = previousByKey.get("crisis:ISS_DEFENSE");
    items.push({
      id: prev?.id ?? `AGENDA_${seq++}`,
      title: "Crisis: foreign affairs",
      issueId: "ISS_DEFENSE",
      priority: 0.9,
      source: "crisis",
      departmentId: "foreign",
      status: "active",
      billId: prev?.billId ?? null,
      billStatus: prev?.billStatus ?? null,
    });
  }

  if (runtime.budgetCycle.failureConsequence) {
    const prev = previousByKey.get("crisis:ISS_WELFARE");
    items.push({
      id: prev?.id ?? `AGENDA_${seq++}`,
      title: "Crisis: budget continuity",
      issueId: "ISS_WELFARE",
      priority: 0.92,
      source: "crisis",
      departmentId: "finance",
      status: "active",
      billId: prev?.billId ?? null,
      billStatus: prev?.billStatus ?? null,
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  const trimmed = items.slice(0, 8);
  syncAgendaBillReferences(state, trimmed);
  const agenda: GovernmentAgenda = {
    updatedDate: state.currentDate,
    items: trimmed,
  };
  runtime.agenda = agenda;
  return agenda;
}
