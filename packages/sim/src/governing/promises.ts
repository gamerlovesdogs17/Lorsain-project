import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";
import { activeCoalition } from "../politics/coalitions.js";
import type { KernelWorld, SimState } from "../types.js";
import { ensureGoverningRuntime } from "./state.js";
import type { PromiseRecord, PromiseStatus } from "./types.js";

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

function governingPartyId(world: KernelWorld, state: SimState): string | null {
  const presidentId = currentPresidentialAuthorityId(world, state);
  if (!presidentId) return null;
  return state.politicians[presidentId]?.partyId ?? null;
}

function promiseId(partyId: string, issueId: string, source: string): string {
  return `PROM_${partyId}_${issueId}_${source}`;
}

/** Seed/update promise records from platform + coalition when hooks exist. */
export function syncPromisesFromHooks(world: KernelWorld, state: SimState): void {
  const runtime = ensureGoverningRuntime(state);
  const partyId = governingPartyId(world, state);
  if (!partyId) return;

  const platform = state.partyStates[partyId]?.publicPlatform;
  if (platform) {
    for (const issue of PARTY_PLATFORM_ISSUES) {
      const direction = platform.positions[issue] ?? 0;
      if (Math.abs(direction) < 0.2) continue;
      const issueId = PLATFORM_TO_ISSUE[issue];
      const id = promiseId(partyId, issueId, "platform");
      if (!runtime.promises[id]) {
        runtime.promises[id] = {
          id,
          partyId,
          issueId,
          direction,
          status: "pending",
          source: "platform",
          relatedLawId: null,
          createdDate: state.currentDate,
          updatedDate: state.currentDate,
          notes: `Platform stance on ${issue}`,
        };
      }
    }
  }

  const coalition = activeCoalition(state);
  if (coalition) {
    for (const issue of coalition.policyPriorities) {
      const issueId = PLATFORM_TO_ISSUE[issue] ?? "ISS_REFORM";
      const id = promiseId(partyId, issueId, "coalition");
      if (!runtime.promises[id]) {
        runtime.promises[id] = {
          id,
          partyId,
          issueId,
          direction: 0.5,
          status: "pending",
          source: "coalition",
          relatedLawId: null,
          createdDate: state.currentDate,
          updatedDate: state.currentDate,
          notes: "Coalition agreement priority",
        };
      }
    }
  }
}

function lawMatchesPromiseDirection(
  law: { policyItems: Array<{ issueId: string; direction: number }> },
  promise: PromiseRecord,
): boolean {
  const items = law.policyItems.filter((i) => i.issueId === promise.issueId);
  if (items.length === 0) return false;
  const avg = items.reduce((s, i) => s + i.direction, 0) / items.length;
  // Same sign (or near-zero promise) counts as aligned; opposite sign is contradiction.
  if (Math.abs(promise.direction) < 0.15) return true;
  return avg * promise.direction > 0;
}

function statusFromLawHooks(
  state: SimState,
  promise: PromiseRecord,
): { status: PromiseStatus; lawId: string | null } {
  const bills = Object.values(state.legislatureRuntime.bills).filter((b) =>
    b.policyItems.some((i) => i.issueId === promise.issueId),
  );
  const introduced = bills.find((b) =>
    [
      "introduced",
      "committee",
      "committee_passed",
      "floor_scheduled",
      "floor_passed",
      "sent_to_president",
      "signed",
      "returned_by_president",
      "repassage_scheduled",
      "repassed",
    ].includes(b.status),
  );
  const laws = Object.values(state.legislatureRuntime.enactedLaws)
    .filter((l) => l.operative && l.policyItems.some((i) => i.issueId === promise.issueId))
    .sort((a, b) => b.enactedDate.localeCompare(a.enactedDate));

  const contradicting = laws.find((l) => !lawMatchesPromiseDirection(l, promise));
  if (contradicting) {
    return { status: "contradicted", lawId: contradicting.id };
  }

  const law = laws.find((l) => lawMatchesPromiseDirection(l, promise)) ?? null;
  if (law) {
    const impl = ensureGoverningRuntime(state).implementations[law.id];
    if (impl?.status === "fully_implemented" || impl?.status === "substantially_implemented") {
      return { status: "implemented", lawId: law.id };
    }
    if (impl && impl.progress >= 0.35) return { status: "partially_enacted", lawId: law.id };
    return { status: "enacted", lawId: law.id };
  }
  if (introduced) return { status: "introduced", lawId: null };

  const challenged = Object.values(state.constitutionalRuntime.courtCases).some(
    (c) =>
      c.challengedKind === "law" &&
      Object.values(state.legislatureRuntime.enactedLaws).some(
        (l) => l.id === c.challengedId && l.policyItems.some((i) => i.issueId === promise.issueId),
      ) &&
      (c.status === "filed" || c.status === "pending"),
  );
  if (challenged) return { status: "blocked", lawId: null };

  return {
    status: promise.status === "pending" ? "pending" : promise.status,
    lawId: promise.relatedLawId,
  };
}

/** Update promise statuses from bills / enacted laws / implementation when hooks exist. */
export function updatePromiseStatuses(world: KernelWorld, state: SimState): void {
  syncPromisesFromHooks(world, state);
  const runtime = ensureGoverningRuntime(state);
  for (const promise of Object.values(runtime.promises)) {
    if (promise.status === "abandoned") continue;
    const next = statusFromLawHooks(state, promise);
    if (next.status !== promise.status || next.lawId !== promise.relatedLawId) {
      promise.status = next.status;
      promise.relatedLawId = next.lawId;
      promise.updatedDate = state.currentDate;
    }
  }
}
