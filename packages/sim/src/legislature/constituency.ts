import { addMonths, compareIsoDate } from "../calendar.js";
import type { EconomySectorId } from "../economy/types.js";
import type { KernelWorld, SimState } from "../types.js";
import type { BillState } from "./types.js";

export type PublicConstituencyPressure = {
  kind: "employment" | "housing" | "industry" | "regional" | "election";
  label: string;
  detail: string;
  level: "watch" | "important" | "urgent";
  provinceId: string | null;
};

const SECTOR_LABELS: Record<EconomySectorId, string> = {
  labor: "labor market",
  manufacturing: "manufacturing",
  agriculture: "agriculture",
  services: "services",
  housing: "housing and construction",
  trade: "trade and ports",
};

export function constituencyPrimaryProvince(
  world: KernelWorld,
  constituencyId: string,
): string | null {
  return (
    (world.constituencyProvinceShares[constituencyId] ?? [])
      .slice()
      .sort((a, b) => b.share - a.share || a.provinceId.localeCompare(b.provinceId))[0]
      ?.provinceId ?? null
  );
}

function dominantSector(world: KernelWorld, provinceId: string): EconomySectorId | null {
  const exposure = world.economyScenario?.provinces[provinceId]?.sectorExposure;
  if (!exposure) return null;
  return (
    (Object.entries(exposure) as Array<[EconomySectorId, number]>).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] ?? null
  );
}

export function publicConstituencyPressures(
  world: KernelWorld,
  state: SimState,
  constituencyId: string,
): PublicConstituencyPressure[] {
  const provinceId = constituencyPrimaryProvince(world, constituencyId);
  if (!provinceId) return [];
  const economy = state.economyRuntime.provinces[provinceId];
  const profile = world.economyScenario?.provinces[provinceId];
  const out: PublicConstituencyPressure[] = [];
  if (economy) {
    if (economy.employmentIndex < 98) {
      out.push({
        kind: "employment",
        label: "Jobs and local employment",
        detail: "A soft labor market is raising pressure for visible economic action.",
        level: economy.employmentIndex < 95 ? "urgent" : "important",
        provinceId,
      });
    } else if (economy.employmentIndex > 103) {
      out.push({
        kind: "employment",
        label: "Tight labor market",
        detail: "Employers and public services are competing for workers.",
        level: "watch",
        provinceId,
      });
    }
    if (economy.housingIndex < 99) {
      out.push({
        kind: "housing",
        label: "Housing pressure",
        detail: "Affordability and housing supply are prominent local concerns.",
        level: economy.housingIndex < 95 ? "urgent" : "important",
        provinceId,
      });
    }
  }
  const sector = dominantSector(world, provinceId);
  if (sector) {
    out.push({
      kind: "industry",
      label: "Major local industry",
      detail: `${SECTOR_LABELS[sector][0]!.toUpperCase()}${SECTOR_LABELS[sector].slice(1)} has the province's largest structural exposure.`,
      level: "watch",
      provinceId,
    });
  }
  if (profile?.character) {
    out.push({
      kind: "regional",
      label: "Regional character",
      detail: profile.character,
      level: "watch",
      provinceId,
    });
  }
  const nextElection = Object.values(state.elections)
    .filter(
      (election) =>
        election.type === "assembly" && !["resolved", "cancelled"].includes(election.status),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  if (nextElection && compareIsoDate(nextElection.date, addMonths(state.currentDate, 18)) <= 0) {
    out.push({
      kind: "election",
      label: "Assembly election approaching",
      detail: `Local representation returns to voters on ${nextElection.date}.`,
      level: "important",
      provinceId,
    });
  }
  return out.slice(0, 5);
}

/** Bounded public economic pressure that modestly affects a member's vote incentives. */
export function constituencyPressureForBill(
  world: KernelWorld,
  state: SimState,
  constituencyId: string,
  bill: BillState,
): number {
  const provinceId = constituencyPrimaryProvince(world, constituencyId);
  const economy = provinceId ? state.economyRuntime.provinces[provinceId] : null;
  if (!economy || bill.policyItems.length === 0) return 0;
  const employmentStress = Math.max(0, Math.min(1, (100 - economy.employmentIndex) / 10));
  const housingStress = Math.max(0, Math.min(1, (100 - economy.housingIndex) / 10));
  const total = bill.policyItems.reduce((sum, item) => {
    const economic = ["ISS_LABOR", "ISS_WELFARE", "ISS_OWNERSHIP", "ISS_TRADE"].includes(
      item.issueId,
    )
      ? employmentStress * item.direction * item.magnitude
      : 0;
    const housing =
      item.issueId === "ISS_HOUSING" ? housingStress * item.direction * item.magnitude : 0;
    return sum + economic + housing;
  }, 0);
  return Math.max(-0.18, Math.min(0.18, (total / bill.policyItems.length) * 0.18));
}
