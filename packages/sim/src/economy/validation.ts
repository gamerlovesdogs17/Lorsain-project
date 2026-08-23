import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import {
  emptyEconomyRuntime,
  type EconomyRuntime,
  type NationalEconomyIndices,
  type RegionalEconomyIndices,
} from "./types.js";
import { clampFiscal, clampIndex } from "./policy.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function parseNational(raw: unknown): NationalEconomyIndices {
  const rec = isRecord(raw) ? raw : {};
  const num = (k: string, fallback: number) =>
    typeof rec[k] === "number" ? clampIndex(rec[k] as number) : fallback;
  return {
    outputIndex: num("outputIndex", 100),
    employmentIndex: num("employmentIndex", 100),
    priceIndex: num("priceIndex", 100),
    realWageIndex: num("realWageIndex", 100),
    housingIndex: num("housingIndex", 100),
    confidenceIndex: num("confidenceIndex", 100),
    fiscalPressure: typeof rec.fiscalPressure === "number" ? clampFiscal(rec.fiscalPressure) : 0.35,
  };
}

export function parseEconomyRuntime(raw: unknown): EconomyRuntime | string {
  if (raw == null) return emptyEconomyRuntime();
  if (!isRecord(raw)) return "economyRuntime must be an object";
  const runtime = emptyEconomyRuntime();
  runtime.national = parseNational(raw.national);
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "economyRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  if (Array.isArray(raw.history)) {
    for (const row of raw.history) {
      if (!isRecord(row) || typeof row.date !== "string" || !isIsoDate(row.date)) continue;
      runtime.history.push({ date: row.date, ...parseNational(row) });
    }
  }
  if (isRecord(raw.provinceHistory)) {
    for (const [id, rows] of Object.entries(raw.provinceHistory)) {
      if (!Array.isArray(rows)) continue;
      runtime.provinceHistory[id] = rows.flatMap((row) => {
        if (!isRecord(row) || typeof row.date !== "string" || !isIsoDate(row.date)) return [];
        return [{
          date: row.date,
          conditionsIndex: typeof row.conditionsIndex === "number" ? clampIndex(row.conditionsIndex) : 100,
          employmentIndex: typeof row.employmentIndex === "number" ? clampIndex(row.employmentIndex) : 100,
          housingIndex: typeof row.housingIndex === "number" ? clampIndex(row.housingIndex) : 100,
        }];
      });
    }
  }
  if (isRecord(raw.sectorHistory)) {
    for (const [id, rows] of Object.entries(raw.sectorHistory)) {
      if (!Array.isArray(rows)) continue;
      runtime.sectorHistory[id] = rows.flatMap((row) => {
        if (!isRecord(row) || typeof row.date !== "string" || !isIsoDate(row.date)) return [];
        return [{
          date: row.date,
          conditionsIndex: typeof row.conditionsIndex === "number" ? clampIndex(row.conditionsIndex) : 100,
        }];
      });
    }
  }
  if (isRecord(raw.provinces)) {
    for (const [id, rec] of Object.entries(raw.provinces)) {
      if (!isRecord(rec)) continue;
      const region: RegionalEconomyIndices = {
        conditionsIndex: typeof rec.conditionsIndex === "number" ? clampIndex(rec.conditionsIndex) : 100,
        employmentIndex: typeof rec.employmentIndex === "number" ? clampIndex(rec.employmentIndex) : 100,
        housingIndex: typeof rec.housingIndex === "number" ? clampIndex(rec.housingIndex) : 100,
      };
      runtime.provinces[id] = region;
    }
  }
  if (isRecord(raw.sectors)) {
    for (const [id, rec] of Object.entries(raw.sectors)) {
      if (!isRecord(rec)) continue;
      runtime.sectors[id] = {
        conditionsIndex: typeof rec.conditionsIndex === "number" ? clampIndex(rec.conditionsIndex) : 100,
      };
    }
  }
  if (Array.isArray(raw.laggedEffects)) {
    for (const rec of raw.laggedEffects) {
      if (!isRecord(rec) || typeof rec.id !== "string") continue;
      if (parseCanonicalAllocatedId("ECOFX", rec.id) == null) continue;
      runtime.laggedEffects.push({
        id: rec.id,
        sourceId: typeof rec.sourceId === "string" ? rec.sourceId : "",
        remainingMonths: isInt(rec.remainingMonths) ? rec.remainingMonths : 1,
        totalMonths: isInt(rec.totalMonths) ? rec.totalMonths : 1,
        lagKind: rec.lagKind === "medium" || rec.lagKind === "longer" ? rec.lagKind : "short",
        policyItems: Array.isArray(rec.policyItems)
          ? rec.policyItems
              .filter((i): i is Record<string, unknown> => isRecord(i))
              .map((i) => ({
                issueId: typeof i.issueId === "string" ? i.issueId : "",
                direction: typeof i.direction === "number" ? i.direction : 0,
                magnitude: typeof i.magnitude === "number" ? i.magnitude : 0,
                fiscalImpact: typeof i.fiscalImpact === "number" ? i.fiscalImpact : null,
              }))
          : [],
        metadata: isRecord(rec.metadata) ? (rec.metadata as EconomyRuntime["laggedEffects"][0]["metadata"]) : {},
      });
    }
  }
  if (Array.isArray(raw.shocks)) {
    for (const rec of raw.shocks) {
      if (!isRecord(rec) || typeof rec.id !== "string") continue;
      runtime.shocks.push({
        id: rec.id,
        date: typeof rec.date === "string" && isIsoDate(rec.date) ? rec.date : "2000-01-01",
        kind: typeof rec.kind === "string" ? rec.kind : "routine",
        magnitude: typeof rec.magnitude === "number" ? rec.magnitude : 0,
        remainingMonths: isInt(rec.remainingMonths) ? rec.remainingMonths : 1,
        metadata: isRecord(rec.metadata) ? (rec.metadata as EconomyRuntime["shocks"][0]["metadata"]) : {},
      });
    }
  }
  if (isRecord(raw.appliedPolicySources)) {
    for (const [k, v] of Object.entries(raw.appliedPolicySources)) {
      if (typeof v === "string") runtime.appliedPolicySources[k] = v;
    }
  }
  if (isRecord(raw.cycle)) {
    const cycleRaw = raw.cycle;
    const finite = (key: string, fallback: number) =>
      typeof cycleRaw[key] === "number" && Number.isFinite(cycleRaw[key])
        ? (cycleRaw[key] as number)
        : fallback;
    runtime.cycle = {
      phase: finite("phase", 0.35),
      outputMomentum: Math.max(-1, Math.min(1, finite("outputMomentum", 0))),
      inflationMomentum: Math.max(-1, Math.min(1, finite("inflationMomentum", 0))),
      housingMomentum: Math.max(-1, Math.min(1, finite("housingMomentum", 0))),
      monthsElapsed: Math.max(0, Math.trunc(finite("monthsElapsed", runtime.history.length - 1))),
    };
  }
  const fallbackDate = runtime.lastMonthProcessed ?? runtime.history.at(-1)?.date;
  if (fallbackDate) {
    for (const [id, province] of Object.entries(runtime.provinces)) {
      if (!runtime.provinceHistory[id]?.length) {
        runtime.provinceHistory[id] = [{ date: fallbackDate, ...province }];
      }
    }
    for (const [id, sector] of Object.entries(runtime.sectors)) {
      if (!runtime.sectorHistory[id]?.length) {
        runtime.sectorHistory[id] = [{ date: fallbackDate, ...sector }];
      }
    }
  }
  return runtime;
}

export function economyCounterError(
  runtime: EconomyRuntime,
  counters: { nextLaggedEffectId: number; nextEconomicShockId: number },
): string | null {
  const maxFx = runtime.laggedEffects.reduce((m, e) => {
    const n = parseCanonicalAllocatedId("ECOFX", e.id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextLaggedEffectId <= maxFx) return "counters.nextLaggedEffectId";
  const maxSh = runtime.shocks.reduce((m, e) => {
    const n = parseCanonicalAllocatedId("ECOS", e.id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextEconomicShockId <= maxSh) return "counters.nextEconomicShockId";
  return null;
}
