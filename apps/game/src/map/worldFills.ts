import { TERENA_WORLD_ID, bilateralKey, type KernelWorld, type SimState } from "@lorsain/sim";
import { institutionDisplayName } from "../presentation.js";
import type { WorldMapMode } from "./WorldMap.js";

const ALIGNMENT_COLORS: Record<string, string> = {
  INT_DC: "#2c5282",
  INT_CSC: "#9b2c2c",
  INT_NAF: "#276749",
  INT_WA: "#5a6578",
  INT_LTO: "#744210",
};

const POSTURE_COLORS: Record<string, string> = {
  normal: "#dde4d8",
  heightened: "#e8d9a8",
  mobilized: "#e8b48a",
  crisis_deployment: "#d48484",
};

const NEUTRAL_FILL = "#e3e8e0";
const CRISIS_FILL = "#d48454";
const SANCTION_FILL = "#c45c5c";
const MUTED_FILL = "#eceae4";

function terenaRelationGeneral(state: SimState, countryId: string): number | null {
  if (countryId === TERENA_WORLD_ID) return null;
  const key = bilateralKey(TERENA_WORLD_ID, countryId);
  const rel = state.foreignAffairsRuntime.bilateralRelations[key];
  return rel?.general ?? null;
}

function relationFill(general: number): string {
  if (general >= 50) return `hsl(210, 38%, ${72 - general / 12}%)`;
  if (general >= 15) return `hsl(195, 22%, ${78 - general / 18}%)`;
  if (general >= -15) return NEUTRAL_FILL;
  if (general >= -50) return `hsl(18, 28%, ${80 + general / 10}%)`;
  return `hsl(0, 42%, ${72 + general / 8}%)`;
}

function allianceFill(world: KernelWorld, countryId: string): string {
  const canonical = world.worldCountries[countryId];
  if (!canonical) return NEUTRAL_FILL;
  const ids = canonical.alignmentIds;
  if (ids.length === 0) return "#c8c2b8";
  for (const id of ids) {
    if (ALIGNMENT_COLORS[id]) return ALIGNMENT_COLORS[id]!;
  }
  return "#8a9a8a";
}

function activeCrisesForCountry(state: SimState, countryId: string): boolean {
  return Object.values(state.foreignAffairsRuntime.crises).some(
    (c) => c.stage !== "settled" && c.participantIds.includes(countryId),
  );
}

function sanctionedFill(state: SimState, countryId: string): string {
  const hasActive = Object.values(state.foreignAffairsRuntime.sanctions).some(
    (s) => s.active && s.targetId === countryId,
  );
  return hasActive ? SANCTION_FILL : MUTED_FILL;
}

function postureFill(state: SimState, countryId: string): string {
  const runtime = state.foreignAffairsRuntime.countries[countryId];
  if (!runtime) return NEUTRAL_FILL;
  return POSTURE_COLORS[runtime.posture] ?? NEUTRAL_FILL;
}

export function worldFillFor(
  mode: WorldMapMode,
  world: KernelWorld,
  state: SimState,
  countryId: string,
): string {
  if (countryId === TERENA_WORLD_ID) {
    return mode === "posture"
      ? postureFill(state, countryId)
      : mode === "alliance"
        ? allianceFill(world, countryId)
        : "#b8c9b0";
  }

  switch (mode) {
    case "relation": {
      const general = terenaRelationGeneral(state, countryId);
      if (general == null) return NEUTRAL_FILL;
      return relationFill(general);
    }
    case "alliance":
      return allianceFill(world, countryId);
    case "crisis":
      return activeCrisesForCountry(state, countryId) ? CRISIS_FILL : MUTED_FILL;
    case "sanctions":
      return sanctionedFill(state, countryId);
    case "posture":
      return postureFill(state, countryId);
    default:
      return NEUTRAL_FILL;
  }
}

export function worldLegendItems(
  mode: WorldMapMode,
  world: KernelWorld,
): Array<{ color: string; label: string }> {
  if (mode === "relation") {
    return [
      { color: relationFill(60), label: "Close ties with Terena" },
      { color: relationFill(0), label: "Neutral" },
      { color: relationFill(-40), label: "Strained" },
      { color: relationFill(-80), label: "Hostile" },
    ];
  }
  if (mode === "alliance") {
    const seen = new Set<string>();
    const items: Array<{ color: string; label: string }> = [
      { color: "#c8c2b8", label: "Independent / multi-aligned" },
    ];
    for (const country of Object.values(world.worldCountries)) {
      for (const id of country.alignmentIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          color: ALIGNMENT_COLORS[id] ?? "#8a9a8a",
          label: institutionDisplayName(world, id),
        });
      }
    }
    return items;
  }
  if (mode === "crisis") {
    return [
      { color: CRISIS_FILL, label: "Active international crisis" },
      { color: MUTED_FILL, label: "No active crisis" },
    ];
  }
  if (mode === "sanctions") {
    return [
      { color: SANCTION_FILL, label: "Under active sanctions" },
      { color: MUTED_FILL, label: "No sanctions" },
    ];
  }
  return [
    { color: POSTURE_COLORS.normal!, label: "Normal posture" },
    { color: POSTURE_COLORS.heightened!, label: "Heightened" },
    { color: POSTURE_COLORS.mobilized!, label: "Mobilized" },
    { color: POSTURE_COLORS.crisis_deployment!, label: "Crisis deployment" },
  ];
}
