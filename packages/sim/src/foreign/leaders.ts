import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import { allocateForeignLeaderId } from "./state.js";
import { TERENA_WORLD_ID, type CanonicalWorldLeader } from "./types.js";

const DEMOCRATIC = /republic|monarchy|democracy|federal|parliamentary|constitutional/i;
const AUTHORITARIAN = /managed|theocracy|empire|autocracy|principality/i;

function regimeCategory(government: string): string {
  if (AUTHORITARIAN.test(government)) return "authoritarian";
  if (DEMOCRATIC.test(government)) return "democratic";
  return "mixed";
}

function leaderTitle(government: string): string {
  const g = government.toLowerCase();
  if (g.includes("monarchy") || g.includes("duchy") || g.includes("kingdom")) return "Head of Government";
  if (g.includes("president")) return "President";
  if (g.includes("federal")) return "Federal President";
  return "Head of State";
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
  const regime = regimeCategory(canonical.government);
  const annualChance = regime === "democratic" ? 0.04 : regime === "authoritarian" ? 0.025 : 0.03;
  if (rng.float01("foreign-affairs") > annualChance / 12) return null;

  const leaderId = allocateForeignLeaderId(state);
  const ordinal = parseInt(leaderId.replace(/\D/g, ""), 10) || 1;
  const leader: CanonicalWorldLeader = {
    id: leaderId,
    countryId,
    name: `${canonical.name.split(" ").slice(-1)[0] ?? "State"} Leader ${ordinal}`,
    title: leaderTitle(canonical.government),
    sinceYear: parseInt(date.slice(0, 4), 10),
    governmentForm: canonical.government,
  };
  runtime.leaderId = leaderId;
  runtime.metadata = { ...runtime.metadata, activeLeader: leader };
  return leader;
}

export function processLeadershipChanges(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  date: IsoDate,
): CanonicalWorldLeader[] {
  const changed: CanonicalWorldLeader[] = [];
  const tiers = ["superpower", "great power", "major power"];
  for (const countryId of Object.keys(state.foreignAffairsRuntime.countries).sort()) {
    if (countryId === TERENA_WORLD_ID) continue;
    const canonical = world.worldCountries[countryId];
    if (!canonical) continue;
    const isMajor = tiers.some((t) => canonical.powerTier.toLowerCase() === t);
    if (!isMajor && rng.float01("foreign-affairs") > 0.15) continue;
    const next = maybeChangeLeader(world, state, countryId, rng, date);
    if (next) changed.push(next);
  }
  return changed;
}
