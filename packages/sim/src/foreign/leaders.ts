import { addMonths } from "../calendar.js";
import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import { allocateForeignLeaderId } from "./state.js";
import { TERENA_WORLD_ID, type CanonicalWorldLeader } from "./types.js";

const AUTHORITARIAN = /managed|theocracy|empire|autocracy|principality|one-party|military-influenced|dominant-party/i;
const MONARCH_TITLE = /^(king|queen|emperor|empress|grand duke|grand duchess|prince|princess|duke|duchess)$/i;

const GIVEN = [
  "Mira",
  "Kael",
  "Voss",
  "Dren",
  "Soren",
  "Nadia",
  "Tomas",
  "Yara",
  "Petra",
  "Rian",
  "Alma",
  "Liora",
];
const FAMILY = [
  "Velic",
  "Joric",
  "Mirev",
  "Karsten",
  "Alvari",
  "Thorne",
  "Belin",
  "Orlov",
  "Santek",
  "Maren",
  "Halden",
  "Corvin",
];

function regimeCategory(government: string): "democratic" | "authoritarian" | "mixed" {
  if (AUTHORITARIAN.test(government)) return "authoritarian";
  if (/republic|democracy|federal|parliamentary|constitutional|commonwealth/i.test(government)) {
    return "democratic";
  }
  return "mixed";
}

function isMonarchTitle(title: string): boolean {
  return MONARCH_TITLE.test(title.trim());
}

function leadershipIntervalMonths(
  government: string,
  title: string,
  regime: ReturnType<typeof regimeCategory>,
): number {
  if (isMonarchTitle(title)) return 240 + (title.length % 36);
  if (regime === "democratic") {
    if (/federal/i.test(government)) return 60;
    if (/parliamentary/i.test(government)) return 48;
    return 48 + (/presidential/i.test(government) ? 12 : 0);
  }
  if (regime === "authoritarian") return 84;
  return 60;
}

function deterministicLeaderName(countryId: string, ordinal: number, avoidName: string | null): string {
  for (let i = 0; i < 48; i += 1) {
    const a = GIVEN[(ordinal + i) % GIVEN.length]!;
    const b = FAMILY[(ordinal + i * 3 + countryId.charCodeAt(1)!) % FAMILY.length]!;
    const name = `${a} ${b}`;
    if (!avoidName || name !== avoidName) return name;
  }
  return `Successor ${ordinal}`;
}

function countryPhaseOffsetMonths(countryId: string): number {
  // Spread review months across the calendar so democracies do not all cycle in January.
  let h = 0;
  for (let i = 0; i < countryId.length; i += 1) h = (h * 31 + countryId.charCodeAt(i)!) % 12;
  return h;
}

function isoFromYearMonth(year: number, monthIndex0: number, day = 1): IsoDate {
  const m = String(monthIndex0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}` as IsoDate;
}

export function seedCountryLeadershipOnBaseline(
  world: KernelWorld,
  runtime: SimState["foreignAffairsRuntime"]["countries"][string],
  countryId: string,
  scenarioStart: IsoDate,
): void {
  seedLeadershipSchedule(world, runtime, countryId, scenarioStart);
}

function seedLeadershipSchedule(
  world: KernelWorld,
  runtime: SimState["foreignAffairsRuntime"]["countries"][string],
  countryId: string,
  scenarioStart: IsoDate,
): void {
  const canonical = world.worldCountries[countryId];
  if (!canonical) return;
  const leader =
    (runtime.leaderId && world.worldLeaders[runtime.leaderId]) ||
    (runtime.metadata.activeLeader as CanonicalWorldLeader | undefined) ||
    null;
  const title = leader?.title ?? "Head of State";
  const regime = regimeCategory(canonical.government);
  const interval = leadershipIntervalMonths(canonical.government, title, regime);
  const sinceYear = leader?.sinceYear ?? parseInt(scenarioStart.slice(0, 4), 10) - 3;
  const phase = countryPhaseOffsetMonths(countryId);
  const sinceDate = isoFromYearMonth(sinceYear, phase, 1);
  let nextReview = addMonths(sinceDate, interval);
  while (nextReview <= scenarioStart) {
    nextReview = addMonths(nextReview, interval);
  }
  runtime.metadata.leadership = {
    sinceDate,
    nextReview,
    transitionReason: "canonical_seed",
    title,
  };
  if (!runtime.metadata.activeLeader && leader) {
    runtime.metadata.activeLeader = {
      id: leader.id,
      countryId: leader.countryId,
      name: leader.name,
      title: leader.title,
      sinceYear: leader.sinceYear,
      governmentForm: leader.governmentForm,
    };
  }
}

function readLeadershipMeta(runtime: SimState["foreignAffairsRuntime"]["countries"][string]): {
  sinceDate: IsoDate | null;
  nextReview: IsoDate | null;
  title: string | null;
} {
  const meta = runtime.metadata.leadership;
  if (!meta || typeof meta !== "object") return { sinceDate: null, nextReview: null, title: null };
  const rec = meta as { sinceDate?: string; nextReview?: string; title?: string };
  return {
    sinceDate: typeof rec.sinceDate === "string" ? (rec.sinceDate as IsoDate) : null,
    nextReview: typeof rec.nextReview === "string" ? (rec.nextReview as IsoDate) : null,
    title: typeof rec.title === "string" ? rec.title : null,
  };
}

function currentLeaderTitle(
  world: KernelWorld,
  runtime: SimState["foreignAffairsRuntime"]["countries"][string],
): string {
  const active = runtime.metadata.activeLeader;
  if (active && typeof active === "object" && typeof (active as { title?: string }).title === "string") {
    return (active as { title: string }).title;
  }
  if (runtime.leaderId && world.worldLeaders[runtime.leaderId]) {
    return world.worldLeaders[runtime.leaderId]!.title;
  }
  return "Head of State";
}

function currentLeaderName(
  world: KernelWorld,
  runtime: SimState["foreignAffairsRuntime"]["countries"][string],
): string | null {
  const active = runtime.metadata.activeLeader;
  if (active && typeof active === "object" && typeof (active as { name?: string }).name === "string") {
    return (active as { name: string }).name;
  }
  if (runtime.leaderId && world.worldLeaders[runtime.leaderId]) {
    return world.worldLeaders[runtime.leaderId]!.name;
  }
  return null;
}

export function resolveCountryLeaderId(
  world: KernelWorld,
  state: SimState,
  countryId: string,
): string | null {
  if (countryId === TERENA_WORLD_ID) {
    return currentPresidentialAuthorityId(world, state);
  }
  return state.foreignAffairsRuntime.countries[countryId]?.leaderId ?? null;
}

export function resolveCountryLeaderDisplay(
  world: KernelWorld,
  state: SimState,
  countryId: string,
): { name: string; title: string } | null {
  if (countryId === TERENA_WORLD_ID) {
    const authorityId = currentPresidentialAuthorityId(world, state);
    if (!authorityId) return null;
    return { name: authorityId, title: "President" };
  }
  const runtime = state.foreignAffairsRuntime.countries[countryId];
  if (!runtime) return null;
  const activeLeader = runtime.metadata.activeLeader;
  if (activeLeader && typeof activeLeader === "object" && activeLeader !== null) {
    const rec = activeLeader as { name?: string; title?: string };
    if (typeof rec.name === "string" && typeof rec.title === "string") {
      return { name: rec.name, title: rec.title };
    }
  }
  const leaderId = runtime.leaderId;
  if (leaderId && world.worldLeaders[leaderId]) {
    const leader = world.worldLeaders[leaderId]!;
    return { name: leader.name, title: leader.title };
  }
  return null;
}

export function maybeChangeLeader(
  world: KernelWorld,
  state: SimState,
  countryId: string,
  rng: RngService,
  date: IsoDate,
): CanonicalWorldLeader | null {
  if (countryId === TERENA_WORLD_ID) return null;
  const canonical = world.worldCountries[countryId];
  const runtime = state.foreignAffairsRuntime.countries[countryId];
  if (!canonical || !runtime) return null;

  const title = currentLeaderTitle(world, runtime);
  const regime = regimeCategory(canonical.government);
  const interval = leadershipIntervalMonths(canonical.government, title, regime);
  const { sinceDate, nextReview } = readLeadershipMeta(runtime);
  const reviewDue = nextReview != null && nextReview <= date;
  const unstable =
    runtime.governmentStability < 0.35 ||
    (runtime.domesticPressure > 0.75 && runtime.economicTrend < -0.3);
  // Monarchs almost never face early "election" turnover; instability may only rarely force succession.
  const earlyChance = isMonarchTitle(title)
    ? unstable && rng.float01("foreign-affairs") < 0.01
    : unstable && rng.float01("foreign-affairs") < 0.08;

  if (!reviewDue && !earlyChance) return null;

  const incumbentRemains =
    !earlyChance &&
    reviewDue &&
    !isMonarchTitle(title) &&
    runtime.governmentStability > 0.55 &&
    runtime.economicTrend > -0.15 &&
    rng.float01("foreign-affairs") < 0.42;

  if (incumbentRemains || (isMonarchTitle(title) && reviewDue && !earlyChance)) {
    // Monarch "review" windows advance the schedule without emitting a leadership change.
    runtime.metadata.leadership = {
      sinceDate: sinceDate ?? date,
      nextReview: addMonths(date, interval),
      transitionReason: isMonarchTitle(title) ? "dynastic_continuity" : "reconfirmed",
      title,
    };
    return null;
  }

  const previousName = currentLeaderName(world, runtime);
  const leaderId = allocateForeignLeaderId(state);
  const ordinal = parseInt(leaderId.replace(/\D/g, ""), 10) || 1;
  const nextTitle = isMonarchTitle(title) ? title : title;
  const leader: CanonicalWorldLeader = {
    id: leaderId,
    countryId,
    name: deterministicLeaderName(countryId, ordinal + date.length, previousName),
    title: nextTitle,
    sinceYear: parseInt(date.slice(0, 4), 10),
    governmentForm: canonical.government,
  };
  if (previousName && leader.name === previousName) {
    leader.name = deterministicLeaderName(countryId, ordinal + 17, previousName);
  }
  runtime.leaderId = leaderId;
  runtime.metadata = {
    ...runtime.metadata,
    activeLeader: leader,
    leadership: {
      sinceDate: date,
      nextReview: addMonths(date, interval),
      transitionReason: earlyChance
        ? isMonarchTitle(title)
          ? "succession"
          : "instability"
        : "scheduled_review",
      title: nextTitle,
    },
  };
  return leader;
}

export function processLeadershipChanges(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  date: IsoDate,
): CanonicalWorldLeader[] {
  const changed: CanonicalWorldLeader[] = [];
  for (const countryId of Object.keys(state.foreignAffairsRuntime.countries).sort()) {
    if (countryId === TERENA_WORLD_ID) continue;
    const runtime = state.foreignAffairsRuntime.countries[countryId];
    if (!runtime) continue;

    const meta = readLeadershipMeta(runtime);
    if (!meta.sinceDate || !meta.nextReview) {
      seedLeadershipSchedule(world, runtime, countryId, date);
    }

    const next = maybeChangeLeader(world, state, countryId, rng, date);
    if (next) changed.push(next);
  }
  return changed;
}
