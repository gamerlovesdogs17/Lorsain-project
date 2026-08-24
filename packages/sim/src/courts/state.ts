import { padId } from "../scheduler.js";
import { officesOfKind, occupyingTerms } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import { emptyConstitutionalRuntime, type ConstitutionalRuntime } from "./types.js";

export function courtSeatOfficeIds(world: KernelWorld): string[] {
  return officesOfKind(world, "constitutional_court_justice")
    .slice()
    .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0) || (a.id < b.id ? -1 : 1))
    .map((o) => o.id);
}

export function currentCourtJudgeId(
  world: KernelWorld,
  state: SimState,
  officeId: string,
): string | null {
  const office = world.offices[officeId];
  if (!office || office.kind !== "constitutional_court_justice") return null;
  const terms = occupyingTerms(state, officeId).filter((t) => t.status === "active");
  return terms[0]?.holderId ?? null;
}

export function deriveCourtBench(
  world: KernelWorld,
  state: SimState,
): Array<{
  officeId: string;
  title: string;
  seatIndex: number | null;
  holderId: string | null;
  termEndDate: string | null;
}> {
  const termsByOffice = new Map<string, (typeof state.officeTerms)[string]>();
  for (const term of Object.values(state.officeTerms)) {
    if (term.status === "active") termsByOffice.set(term.officeId, term);
  }
  return courtSeatOfficeIds(world).map((officeId) => {
    const office = world.offices[officeId]!;
    const term = termsByOffice.get(officeId);
    return {
      officeId,
      title: office.title,
      seatIndex: office.seatIndex,
      holderId: term?.holderId ?? null,
      termEndDate: term?.endDate ?? null,
    };
  });
}

export function currentCourtJudgeIds(world: KernelWorld, state: SimState): string[] {
  return deriveCourtBench(world, state)
    .map((s) => s.holderId)
    .filter((id): id is string => id != null)
    .sort();
}

export function isServingConstitutionalJudge(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): boolean {
  return currentCourtJudgeIds(world, state).includes(politicianId);
}

export function vacantCourtSeatIds(world: KernelWorld, state: SimState): string[] {
  return deriveCourtBench(world, state)
    .filter((s) => s.holderId == null)
    .map((s) => s.officeId);
}

export function allocateCaseId(state: SimState): string {
  return padId("CASE", state.counters.nextCaseId++);
}

export function allocateNominationId(state: SimState): string {
  return padId("CNOM", state.counters.nextCourtNominationId++);
}

export function allocateDecisionId(state: SimState): string {
  return padId("CDEC", state.counters.nextCourtDecisionId++);
}

export function allocateImpeachmentId(state: SimState): string {
  return padId("IMPEACH", state.counters.nextImpeachmentId++);
}

export function allocateRecallId(state: SimState): string {
  return padId("RECALL", state.counters.nextRecallId++);
}

export function allocateConstitutionalGroundsId(state: SimState): string {
  return padId("CGND", state.counters.nextConstitutionalGroundsId++);
}

export function ensureConstitutionalRuntime(state: SimState): ConstitutionalRuntime {
  if (!state.constitutionalRuntime) state.constitutionalRuntime = emptyConstitutionalRuntime();
  return state.constitutionalRuntime;
}

export function confirmationYesNeeded(world: KernelWorld): number {
  const seats = world.legislativeConstitution.assemblySeatCount;
  const fraction = world.courtConstitution.confirmationFraction;
  const parts = Math.round(fraction * 100);
  return Math.ceil((seats * parts) / 100);
}

export function recallReferralYesNeeded(world: KernelWorld): number {
  const seats = world.legislativeConstitution.assemblySeatCount;
  const fraction = world.courtConstitution.recallReferralFraction;
  const parts = Math.round(fraction * 100);
  return Math.ceil((seats * parts) / 100);
}

/** 2/3 of authorized seats. Do not round 0.6666667 to 67%. */
export function impeachmentYesNeeded(world: KernelWorld): number {
  return Math.ceil((world.legislativeConstitution.assemblySeatCount * 2) / 3);
}
