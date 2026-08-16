import { compareIsoDate, isIsoDate, type IsoDate } from "./calendar.js";
import { padId } from "./scheduler.js";
import type {
  CommandError,
  ExpirationPolicy,
  HoldingKind,
  KernelOffice,
  KernelWorld,
  OfficeTerm,
  OfficeTermStatus,
  PoliticianRuntime,
  SimState,
} from "./types.js";

export function officeById(world: KernelWorld, officeId: string): KernelOffice | undefined {
  return world.offices[officeId];
}

/** Occupying terms count toward capacity and holder constraints; ended terms do not. */
export function isOccupyingStatus(status: OfficeTermStatus): boolean {
  return status === "active" || status === "suspended";
}

export function occupyingTerms(state: SimState, officeId: string): OfficeTerm[] {
  return Object.values(state.officeTerms).filter(
    (t) => t.officeId === officeId && isOccupyingStatus(t.status),
  );
}

export function activeTermsForPolitician(state: SimState, politicianId: string): OfficeTerm[] {
  return Object.values(state.officeTerms).filter(
    (t) => t.holderId === politicianId && isOccupyingStatus(t.status),
  );
}

export function currentHolderIds(state: SimState, officeId: string, kind?: HoldingKind): string[] {
  return occupyingTerms(state, officeId)
    .filter((t) => (kind ? t.holdingKind === kind : true) && t.status === "active")
    .map((t) => t.holderId);
}

export function occupiedCount(state: SimState, officeId: string): number {
  return occupyingTerms(state, officeId).length;
}

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function officesAreIncompatible(a: KernelOffice, b: KernelOffice): boolean {
  if (a.incompatibleWithKinds.includes(b.kind) && !a.mayCoexistWithKinds.includes(b.kind)) {
    return true;
  }
  if (b.incompatibleWithKinds.includes(a.kind) && !b.mayCoexistWithKinds.includes(a.kind)) {
    return true;
  }
  return false;
}

export type OfficeTermLike = Omit<OfficeTerm, "id"> & { id?: string };

export function validateTermDateCoherence(term: OfficeTermLike): CommandError | null {
  if (term.startKnown) {
    if (term.startDate == null || !isIsoDate(term.startDate)) {
      return reject(
        "INVALID_TERM_DATES",
        `Term for ${term.officeId} has startKnown but no startDate`,
      );
    }
  } else if (term.startDate != null) {
    return reject(
      "INVALID_TERM_DATES",
      `Preexisting term for ${term.officeId} must not invent a startDate`,
    );
  }
  if (term.endDate != null && !isIsoDate(term.endDate)) {
    return reject("INVALID_TERM_DATES", `Term for ${term.officeId} has invalid endDate`);
  }
  if (term.endedDate != null && !isIsoDate(term.endedDate)) {
    return reject("INVALID_TERM_DATES", `Term for ${term.officeId} has invalid endedDate`);
  }
  if (term.startKnown && term.startDate) {
    if (term.endDate != null && compareIsoDate(term.endDate, term.startDate) < 0) {
      return reject("INVALID_TERM_DATES", `Term for ${term.officeId} endDate is before startDate`);
    }
    if (term.endedDate != null && compareIsoDate(term.endedDate, term.startDate) < 0) {
      return reject(
        "INVALID_TERM_DATES",
        `Term for ${term.officeId} endedDate is before startDate`,
      );
    }
  }
  if (term.status === "ended") {
    if (term.endedDate == null || term.endedReason == null) {
      return reject("INVALID_TERM_DATES", `Ended term for ${term.officeId} missing ended metadata`);
    }
  } else if (term.endedDate != null || term.endedReason != null) {
    return reject(
      "INVALID_TERM_DATES",
      `Active/suspended term for ${term.officeId} cannot have ended metadata`,
    );
  }
  return null;
}

export function validateHolderEligibility(
  office: KernelOffice,
  holder: PoliticianRuntime,
  holdingKind: HoldingKind,
): CommandError | null {
  if (!holder.alive) return reject("DEAD", `${holder.id} is not alive`);
  if (holder.retired) return reject("RETIRED", `${holder.id} is retired`);
  if (office.noPartyMembershipWhileServing && holder.partyId != null) {
    return reject("PARTY_MEMBERSHIP", `${holder.id} cannot hold ${office.id} while in a party`);
  }
  if (holdingKind === "acting" && !office.actingAllowed) {
    return reject("ACTING_NOT_ALLOWED", `${office.id} does not allow acting holders`);
  }
  return null;
}

export function validateHolderKindRequirements(
  office: KernelOffice,
  holderId: string,
  occupyingOfHolder: OfficeTermLike[],
  offices: Record<string, KernelOffice>,
): CommandError | null {
  if (office.requiresHolderKinds.length === 0) return null;
  const heldKinds = new Set(
    occupyingOfHolder.map((t) => offices[t.officeId]?.kind).filter((k): k is string => Boolean(k)),
  );
  for (const need of office.requiresHolderKinds) {
    if (!heldKinds.has(need)) {
      return reject("REQUIREMENT", `${holderId} must hold ${need} to hold ${office.id}`);
    }
  }
  return null;
}

export function validateSubstantiveIncompatibilities(
  office: KernelOffice,
  holderId: string,
  occupyingSubstantiveOfHolder: OfficeTermLike[],
  offices: Record<string, KernelOffice>,
): CommandError | null {
  for (const t of occupyingSubstantiveOfHolder) {
    if (t.officeId === office.id) continue;
    const other = offices[t.officeId];
    if (!other) continue;
    if (officesAreIncompatible(office, other)) {
      return reject(
        "INCOMPATIBLE",
        `${holderId} cannot hold ${office.kind} with ${other.kind} (${t.officeId})`,
      );
    }
  }
  return null;
}

function expiredOccupyingTerm(
  term: OfficeTermLike,
  office: KernelOffice,
  asOfDate: IsoDate,
  domainResolutionBlocked: boolean,
  mode: "starting" | "runtime",
): CommandError | null {
  if (term.endDate == null || !isOccupyingStatus(term.status)) return null;
  if (mode === "starting") {
    if (compareIsoDate(term.endDate, asOfDate) < 0) {
      return reject(
        "EXPIRED_TERM",
        `Term for ${term.officeId} ended before scenario start ${asOfDate}`,
      );
    }
    return null;
  }
  if (compareIsoDate(asOfDate, term.endDate) < 0) return null;
  if (office.expirationPolicy === "requires_domain_resolution" && domainResolutionBlocked) {
    return null;
  }
  return reject("EXPIRED_TERM", `Occupying term for ${term.officeId} is expired as of ${asOfDate}`);
}

/**
 * Shared occupancy / holder / capacity / incompatibility / date rules for
 * KernelWorld starting terms and restored SimState office terms.
 */
export function validateOfficeTermSet(args: {
  terms: OfficeTermLike[];
  offices: Record<string, KernelOffice>;
  politician: (id: string) => PoliticianRuntime | undefined;
  asOfDate: IsoDate;
  domainResolutionBlocked: boolean;
  mode: "starting" | "runtime";
}): CommandError | null {
  const occupying: OfficeTermLike[] = [];
  for (const term of args.terms) {
    const office = args.offices[term.officeId];
    if (!office) return reject("UNKNOWN_OFFICE", `Unknown office ${term.officeId}`);
    const holder = args.politician(term.holderId);
    if (!holder) return reject("UNKNOWN_POLITICIAN", `Unknown politician ${term.holderId}`);
    const dates = validateTermDateCoherence(term);
    if (dates) return dates;
    if (args.mode === "starting" && term.status === "ended") {
      return reject("INVALID_TERM_DATES", `Starting term for ${term.officeId} must not be ended`);
    }
    if (
      term.startKnown &&
      term.startDate &&
      isOccupyingStatus(term.status) &&
      compareIsoDate(term.startDate, args.asOfDate) > 0
    ) {
      return reject(
        "INVALID_TERM_DATES",
        `Term for ${term.officeId} startDate is after ${args.asOfDate}`,
      );
    }
    if (
      term.status === "ended" &&
      term.endedDate &&
      compareIsoDate(term.endedDate, args.asOfDate) > 0
    ) {
      return reject(
        "INVALID_TERM_DATES",
        `Term for ${term.officeId} endedDate is after ${args.asOfDate}`,
      );
    }
    if (isOccupyingStatus(term.status)) {
      const elig = validateHolderEligibility(office, holder, term.holdingKind);
      if (elig) return elig;
      const expired = expiredOccupyingTerm(
        term,
        office,
        args.asOfDate,
        args.domainResolutionBlocked,
        args.mode,
      );
      if (expired) return expired;
      occupying.push(term);
    }
  }

  const occupancy = new Map<string, number>();
  const duplicateKeys = new Set<string>();
  for (const term of occupying) {
    occupancy.set(term.officeId, (occupancy.get(term.officeId) ?? 0) + 1);
    const cap = args.offices[term.officeId]!.capacity;
    if ((occupancy.get(term.officeId) ?? 0) > cap) {
      return reject("CAPACITY", `${term.officeId} is at capacity ${cap}`);
    }
    if (term.holdingKind === "substantive") {
      const key = `${term.holderId}::${term.officeId}`;
      if (duplicateKeys.has(key)) {
        return reject(
          "DUPLICATE_OFFICE_HOLDER",
          `${term.holderId} occupies multiple substantive slots of ${term.officeId}`,
        );
      }
      duplicateKeys.add(key);
    }
  }

  const presidents = occupying.filter(
    (t) => t.holdingKind === "substantive" && args.offices[t.officeId]?.kind === "president",
  );
  if (presidents.length > 1) {
    return reject("TWO_PRESIDENTS", "Cannot have two substantive presidents");
  }

  const byHolder = new Map<string, OfficeTermLike[]>();
  for (const term of occupying) {
    const list = byHolder.get(term.holderId) ?? [];
    list.push(term);
    byHolder.set(term.holderId, list);
  }
  for (const [holderId, terms] of byHolder) {
    const substantive = terms.filter((t) => t.holdingKind === "substantive");
    for (const term of terms) {
      const office = args.offices[term.officeId]!;
      const req = validateHolderKindRequirements(office, holderId, terms, args.offices);
      if (req) return req;
      if (term.holdingKind === "substantive") {
        const inc = validateSubstantiveIncompatibilities(
          office,
          holderId,
          substantive,
          args.offices,
        );
        if (inc) return inc;
      }
    }
  }
  const actingErr = validateActingPresidentSuspensions(occupying, args.offices);
  if (actingErr) return actingErr;
  return null;
}

export function expirationPolicyForKind(kind: string): ExpirationPolicy {
  if (kind === "constitutional_court_justice") return "auto_vacate";
  if (kind === "president" || kind === "assembly_member") return "requires_domain_resolution";
  return "none";
}

export function shouldSuspendWhenActingPresident(office: KernelOffice): boolean {
  if (office.kind === "president" || office.kind === "assembly_member") return false;
  if (office.suspendWhenActingPresident) return true;
  return office.incompatibleWithKinds.includes("president");
}

export function validateActingPresidentSuspensions(
  occupying: OfficeTermLike[],
  offices: Record<string, KernelOffice>,
): CommandError | null {
  const actingHolders = new Set<string>();
  for (const term of occupying) {
    const office = offices[term.officeId];
    if (office?.kind === "president" && term.holdingKind === "acting" && term.status === "active") {
      actingHolders.add(term.holderId);
    }
  }
  if (actingHolders.size === 0) return null;
  for (const term of occupying) {
    if (term.status !== "active" || !actingHolders.has(term.holderId)) continue;
    const office = offices[term.officeId];
    if (!office) continue;
    if (shouldSuspendWhenActingPresident(office)) {
      return reject(
        "ACTING_PRESIDENT_DUTIES_MUST_REMAIN_SUSPENDED",
        `${term.holderId} must keep ${term.officeId} suspended while acting as president`,
      );
    }
  }
  return null;
}

export function canAssumeOffice(
  state: SimState,
  world: KernelWorld,
  officeId: string,
  holderId: string,
  holdingKind: HoldingKind,
  opts?: { ignoreOfficeCapacity?: boolean },
): CommandError | null {
  const office = world.offices[officeId];
  if (!office) return reject("UNKNOWN_OFFICE", `Unknown office ${officeId}`);
  const pol = state.politicians[holderId];
  if (!pol) return reject("UNKNOWN_POLITICIAN", `Unknown politician ${holderId}`);
  const elig = validateHolderEligibility(office, pol, holdingKind);
  if (elig) return elig;
  const occupying = occupyingTerms(state, officeId);
  if (
    holdingKind === "substantive" &&
    occupying.some((t) => t.holderId === holderId && t.holdingKind === "substantive")
  ) {
    return reject(
      "DUPLICATE_OFFICE_HOLDER",
      `${holderId} already occupies a substantive slot of ${officeId}`,
    );
  }
  if (!opts?.ignoreOfficeCapacity && occupying.length >= office.capacity) {
    return reject("CAPACITY", `${officeId} is at capacity ${office.capacity}`);
  }
  const held = activeTermsForPolitician(state, holderId);
  const req = validateHolderKindRequirements(office, holderId, held, world.offices);
  if (req) return req;
  if (holdingKind === "substantive") {
    const inc = validateSubstantiveIncompatibilities(
      office,
      holderId,
      held.filter((t) => t.holdingKind === "substantive"),
      world.offices,
    );
    if (inc) return inc;
  }
  return null;
}

export function assumeOffice(
  state: SimState,
  world: KernelWorld,
  args: {
    officeId: string;
    holderId: string;
    date: IsoDate;
    accessionReason: string;
    holdingKind: HoldingKind;
    endDate: IsoDate | null;
    startKnown: boolean;
    sourceElectionId: string | null;
  },
): { term: OfficeTerm } | { error: CommandError } {
  const err = canAssumeOffice(state, world, args.officeId, args.holderId, args.holdingKind);
  if (err) return { error: err };
  const term: OfficeTerm = {
    id: padId("TERM", state.counters.nextTermId++),
    officeId: args.officeId,
    holderId: args.holderId,
    startDate: args.startKnown ? args.date : null,
    startKnown: args.startKnown,
    endDate: args.endDate,
    accessionReason: args.accessionReason,
    status: "active",
    holdingKind: args.holdingKind,
    sourceElectionId: args.sourceElectionId,
    endedDate: null,
    endedReason: null,
  };
  state.officeTerms[term.id] = term;
  return { term };
}

export function endTerm(
  state: SimState,
  termId: string,
  date: IsoDate,
  reason: string,
): OfficeTerm | null {
  const term = state.officeTerms[termId];
  if (!term || term.status === "ended") return null;
  term.status = "ended";
  term.endedDate = date;
  term.endedReason = reason;
  return term;
}

export function vacateOffice(
  state: SimState,
  world: KernelWorld,
  officeId: string,
  date: IsoDate,
  reason: string,
): { ended: OfficeTerm[] } | { error: CommandError } {
  if (!world.offices[officeId]) {
    return { error: reject("UNKNOWN_OFFICE", `Unknown office ${officeId}`) };
  }
  const ended: OfficeTerm[] = [];
  for (const term of occupyingTerms(state, officeId)) {
    const e = endTerm(state, term.id, date, reason);
    if (e) ended.push(e);
  }
  return { ended };
}

export function suspendTerm(state: SimState, termId: string): OfficeTerm | { error: CommandError } {
  const term = state.officeTerms[termId];
  if (!term) return { error: reject("UNKNOWN_TERM", `Unknown term ${termId}`) };
  if (term.status === "ended") {
    return { error: reject("TERM_ENDED", `Ended term ${termId} cannot be suspended`) };
  }
  if (term.status !== "active") {
    return { error: reject("NOT_ACTIVE", `Term ${termId} is not active`) };
  }
  term.status = "suspended";
  return term;
}

export function canResumeTerm(
  state: SimState,
  world: KernelWorld,
  termId: string,
): CommandError | null {
  const term = state.officeTerms[termId];
  if (!term) return reject("UNKNOWN_TERM", `Unknown term ${termId}`);
  if (term.status === "ended") {
    return reject("TERM_ENDED", `Ended term ${termId} cannot be resumed`);
  }
  if (term.status !== "suspended") {
    return reject("NOT_SUSPENDED", `Term ${termId} is not suspended`);
  }
  const office = world.offices[term.officeId];
  if (!office) return reject("UNKNOWN_OFFICE", `Unknown office ${term.officeId}`);
  const holder = state.politicians[term.holderId];
  if (!holder) return reject("UNKNOWN_POLITICIAN", `Unknown politician ${term.holderId}`);
  const elig = validateHolderEligibility(office, holder, term.holdingKind);
  if (elig) return elig;
  const expired = expiredOccupyingTerm(
    term,
    office,
    state.currentDate,
    state.pendingInterrupt?.requiresResolution === true,
    "runtime",
  );
  if (expired) return expired;
  const held = activeTermsForPolitician(state, term.holderId);
  const req = validateHolderKindRequirements(office, term.holderId, held, world.offices);
  if (req) return req;
  const actingPres = occupyingTerms(state, "OFFICE_PRESIDENT").some(
    (t) => t.holderId === term.holderId && t.holdingKind === "acting" && t.status === "active",
  );
  if (actingPres && shouldSuspendWhenActingPresident(office)) {
    return reject(
      "ACTING_PRESIDENT_DUTIES_MUST_REMAIN_SUSPENDED",
      `${term.holderId} cannot resume ${term.officeId} while acting as president`,
    );
  }
  if (term.holdingKind === "substantive") {
    const inc = validateSubstantiveIncompatibilities(
      office,
      term.holderId,
      held.filter(
        (t) => t.id !== term.id && t.holdingKind === "substantive" && t.status === "active",
      ),
      world.offices,
    );
    if (inc) return inc;
  }
  return null;
}

export function resumeTerm(
  state: SimState,
  world: KernelWorld,
  termId: string,
): OfficeTerm | { error: CommandError } {
  const err = canResumeTerm(state, world, termId);
  if (err) return { error: err };
  const term = state.officeTerms[termId]!;
  term.status = "active";
  return term;
}

export function officesOfKind(world: KernelWorld, kind: string): KernelOffice[] {
  return Object.values(world.offices).filter((o) => o.kind === kind);
}
