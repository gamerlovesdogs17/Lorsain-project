import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { IsoDate } from "../calendar.js";
import {
  TERENA_WORLD_ID,
  type BilateralRelation,
  type ForeignCountryRuntime,
  type InternationalCrisis,
} from "./types.js";
import { bilateralKey, allocateCrisisId, getBilateralRelation } from "./state.js";
import { activeCrises } from "./crises.js";
import {
  crisisEscalationProfile,
  pickCyberDispute,
  pickEnergySupplyDispute,
  pickHumanitarianAccess,
  pickMaritimeResourceDispute,
  pickMigrationCorridorStrain,
  pickTechExportControls,
} from "./crisis-packages.js";

// ---------------------------------------------------------------------------
// Phase 11.4 — Crisis narrative theme assignment
// ---------------------------------------------------------------------------

/**
 * Derive a short narrative theme label for a newly emergent crisis from the
 * bilateral context. Themes are contextual (not equalized); neighbor pairs can
 * still produce trade/cyber/consular themes when those drivers dominate.
 *
 * Exported so tests can verify stability without a full sim harness.
 */
export function assignCrisisTheme(
  aRuntime: ForeignCountryRuntime,
  bRuntime: ForeignCountryRuntime,
  rel: BilateralRelation,
  aNeighborsB: boolean,
  hasSanctions: boolean,
): string {
  type Candidate = { theme: string; weight: number };
  const candidates: Candidate[] = [];
  const push = (theme: string, weight: number) => {
    if (weight > 0) candidates.push({ theme, weight });
  };

  if (hasSanctions) {
    push(
      pickTechExportControls(true, rel) ? "technology export control dispute" : "sanctions dispute",
      1.4 + Math.min(0.6, Math.abs(rel.general) / 80),
    );
  }
  if (pickCyberDispute(aRuntime, bRuntime)) {
    push("cyber and espionage dispute", 0.55 + rel.securityTension * 0.9);
  }
  if (aRuntime.posture === "mobilized" || bRuntime.posture === "mobilized") {
    if (pickMaritimeResourceDispute(aRuntime, bRuntime)) {
      push("maritime resource dispute", 1.1);
    } else if (
      aRuntime.strategicGoals.includes("maritime_access") ||
      bRuntime.strategicGoals.includes("maritime_access") ||
      aRuntime.capabilities.naval >= 0.55 ||
      bRuntime.capabilities.naval >= 0.55
    ) {
      push("military posturing", 1.0);
    } else {
      push("security standoff", 0.85);
    }
  }
  if (aNeighborsB) {
    if (pickMigrationCorridorStrain(rel, aRuntime, bRuntime, true)) {
      push("migration corridor strain", 1.15);
    }
    push("border tension", 0.55 + rel.securityTension * 0.55);
    push("detention and consular dispute", 0.22 + (1 - rel.trust) * 0.35);
  }
  if (rel.economicTies > 0.28) {
    if (pickEnergySupplyDispute(rel, aRuntime, bRuntime)) {
      push("energy supply dispute", 0.95 + rel.economicTies * 0.4);
    }
    push("trade dispute", 0.45 + rel.economicTies * 0.85);
    if (rel.economicTies > 0.5 && rel.general < 0) {
      push("treaty interpretation dispute", 0.35 + Math.min(0.4, -rel.general / 100));
    }
  }
  if (
    aRuntime.strategicGoals.includes("secure_alliance") ||
    bRuntime.strategicGoals.includes("secure_alliance")
  ) {
    if (pickHumanitarianAccess(aRuntime, bRuntime)) {
      push("humanitarian access dispute", 0.9);
    } else {
      push("alliance consultation strain", 0.7);
    }
  }
  if (rel.general < -20) {
    push("diplomatic confrontation", 0.65 + Math.min(0.5, -rel.general / 80));
    push("diplomatic expulsion dispute", 0.35 + Math.min(0.4, -rel.general / 100));
  }
  if (rel.securityTension >= 0.35 && !aNeighborsB) {
    push("security standoff", 0.7 + rel.securityTension * 0.4);
  }

  if (candidates.length === 0) return "diplomatic confrontation";

  // Deterministic pick: highest weight, then theme name for stability.
  candidates.sort((a, b) => b.weight - a.weight || a.theme.localeCompare(b.theme));
  return candidates[0]!.theme;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function pairHasActiveCrisis(
  runtime: SimState["foreignAffairsRuntime"],
  aId: string,
  bId: string,
): boolean {
  const key = bilateralKey(aId, bId);
  return activeCrises(runtime).some(
    (c) =>
      c.focalPairKey === key || (c.participantIds.includes(aId) && c.participantIds.includes(bId)),
  );
}

function emergenceProbability(
  world: KernelWorld,
  state: SimState,
  aId: string,
  bId: string,
): number {
  const rel = getBilateralRelation(state.foreignAffairsRuntime, aId, bId);
  if (!rel) return 0;
  const aRuntime = state.foreignAffairsRuntime.countries[aId];
  const bRuntime = state.foreignAffairsRuntime.countries[bId];
  const aCanon = world.worldCountries[aId];
  const bCanon = world.worldCountries[bId];
  if (!aRuntime || !bRuntime || !aCanon || !bCanon) return 0;

  let p = rel.securityTension * 0.35;
  if (aRuntime.posture !== "normal" || bRuntime.posture !== "normal") p += 0.06;
  if (aRuntime.posture === "mobilized" || bRuntime.posture === "mobilized") p += 0.08;

  const sanctionsOnPair = Object.values(state.foreignAffairsRuntime.sanctions).filter(
    (s) =>
      s.active &&
      ((s.imposerId === aId && s.targetId === bId) || (s.imposerId === bId && s.targetId === aId)),
  );
  p += Math.min(0.12, sanctionsOnPair.length * 0.04);

  if (aCanon.neighborIds.includes(bId)) p += 0.04;

  const sharedTreaties = Object.values(state.foreignAffairsRuntime.treaties).filter(
    (t) =>
      t.status === "active" &&
      t.memberIds.includes(aId) &&
      t.memberIds.includes(bId) &&
      (t.kind === "non_aggression" || t.kind === "mutual_defense"),
  );
  p -= Math.min(0.1, sharedTreaties.length * 0.05);

  if (
    aRuntime.strategicGoals.includes("regional_hegemony") ||
    bRuntime.strategicGoals.includes("regional_hegemony")
  ) {
    p += 0.03;
  }
  if (
    aRuntime.strategicGoals.includes("counter_rival") ||
    bRuntime.strategicGoals.includes("counter_rival")
  ) {
    p += 0.02;
  }

  p += (1 - aRuntime.governmentStability) * 0.04;
  p += (1 - bRuntime.governmentStability) * 0.04;
  p += aRuntime.domesticPressure * 0.03;
  p += bRuntime.domesticPressure * 0.03;

  if (rel.general < -20) p += 0.05;
  if (rel.trust < 0.3) p += 0.03;

  return clamp01(p * 0.035);
}

function relevantPairs(world: KernelWorld, _state: SimState): Array<[string, string]> {
  const pairs = new Set<string>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    pairs.add(bilateralKey(a, b));
  };
  for (const c of Object.values(world.worldCountries)) {
    if (c.relationWithTerena !== 0 || c.neighborIds.includes(TERENA_WORLD_ID)) {
      add(c.id, TERENA_WORLD_ID);
    }
    for (const n of c.neighborIds) add(c.id, n);
  }
  return [...pairs].map((key) => {
    const [a, b] = key.split("|") as [string, string];
    return [a, b] as [string, string];
  });
}

export function checkCrisisEmergence(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  date: IsoDate,
): InternationalCrisis[] {
  const emerged: InternationalCrisis[] = [];
  const pairs = relevantPairs(world, state).sort((a, b) =>
    bilateralKey(a[0], a[1]).localeCompare(bilateralKey(b[0], b[1])),
  );

  // Cap new emergences per month so the world is not flooded with parallel crises.
  const MONTHLY_EMERGENCE_CAP = 1;
  for (const [aId, bId] of pairs) {
    if (emerged.length >= MONTHLY_EMERGENCE_CAP) break;
    if (pairHasActiveCrisis(state.foreignAffairsRuntime, aId, bId)) continue;
    const prob = emergenceProbability(world, state, aId, bId);
    if (prob <= 0 || rng.float01("foreign-affairs") >= prob) continue;

    const id = allocateCrisisId(state);
    const rel = getBilateralRelation(state.foreignAffairsRuntime, aId, bId);
    const aRuntime = state.foreignAffairsRuntime.countries[aId];
    const bRuntime = state.foreignAffairsRuntime.countries[bId];
    const aCanon = world.worldCountries[aId];

    // Phase 11.4: assign a narrative theme if we have enough context.
    let narrativeTitle: string | undefined;
    if (aRuntime && bRuntime && rel && aCanon) {
      const hasSanctions = Object.values(state.foreignAffairsRuntime.sanctions).some(
        (s) =>
          s.active &&
          ((s.imposerId === aId && s.targetId === bId) ||
            (s.imposerId === bId && s.targetId === aId)),
      );
      narrativeTitle = assignCrisisTheme(
        aRuntime,
        bRuntime,
        rel,
        aCanon.neighborIds.includes(bId),
        hasSanctions,
      );
    }

    const profile = crisisEscalationProfile(narrativeTitle);
    const crisis: InternationalCrisis = {
      id,
      stage: "latent",
      participantIds: [aId, bId].sort(),
      focalPairKey: bilateralKey(aId, bId),
      startedDate: date,
      lastStageChange: date,
      intensity: clamp01(0.2 + (rel?.securityTension ?? 0.15) * 0.5),
      ...(narrativeTitle != null ? { narrativeTitle } : {}),
      metadata: {
        cause: "emergence",
        securityTension: rel?.securityTension ?? 0.15,
        emergenceProbability: prob,
        escalationPackageId: profile.packageId,
        domesticReaction: profile.domesticReaction,
      },
    };
    state.foreignAffairsRuntime.crises[id] = crisis;
    emerged.push(crisis);
  }
  return emerged;
}
