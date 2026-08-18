import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import { emptyOrganizationRuntime, type OrganizationRuntime } from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseOrganizationRuntime(raw: unknown): OrganizationRuntime | string {
  if (raw == null) return emptyOrganizationRuntime();
  if (!isRecord(raw)) return "organizationRuntime must be an object";
  const runtime = emptyOrganizationRuntime();
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "organizationRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  if (typeof raw.meetingsThisMonth === "number") runtime.meetingsThisMonth = raw.meetingsThisMonth;
  if (isRecord(raw.actors)) {
    for (const [id, rec] of Object.entries(raw.actors)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const positions: Record<string, number> = {};
      if (isRecord(rec.publicPositions)) {
        for (const [k, v] of Object.entries(rec.publicPositions)) {
          if (typeof v === "number") positions[k] = v;
        }
      }
      const relationships: Record<string, { affinity: number }> = {};
      if (isRecord(rec.relationships)) {
        for (const [pid, edge] of Object.entries(rec.relationships)) {
          if (isRecord(edge) && typeof edge.affinity === "number") {
            relationships[pid] = { affinity: edge.affinity };
          }
        }
      }
      runtime.actors[id] = {
        id,
        influence: typeof rec.influence === "number" ? rec.influence : 0.5,
        resources: typeof rec.resources === "number" ? rec.resources : 0.4,
        publicPositions: positions,
        relationships,
        billPressure: Array.isArray(rec.billPressure)
          ? rec.billPressure
              .filter((p): p is Record<string, unknown> => isRecord(p) && typeof p.billId === "string")
              .map((p) => ({
                billId: p.billId as string,
                stance: p.stance === "oppose" || p.stance === "watch" ? p.stance : "support",
                strength: typeof p.strength === "number" ? p.strength : 0.3,
              }))
          : [],
        endorsements: Array.isArray(rec.endorsements)
          ? rec.endorsements
              .filter((e): e is Record<string, unknown> => isRecord(e) && typeof e.politicianId === "string")
              .map((e) => ({
                politicianId: e.politicianId as string,
                campaignId: typeof e.campaignId === "string" ? e.campaignId : null,
                date: typeof e.date === "string" && isIsoDate(e.date) ? e.date : "2000-01-01",
                public: true as const,
              }))
          : [],
        cooldownUntil:
          typeof rec.cooldownUntil === "string" && isIsoDate(rec.cooldownUntil)
            ? rec.cooldownUntil
            : null,
        lastActionMonth:
          typeof rec.lastActionMonth === "string" && isIsoDate(rec.lastActionMonth)
            ? rec.lastActionMonth
            : null,
        recentActions: Array.isArray(rec.recentActions)
          ? rec.recentActions
              .filter((a): a is Record<string, unknown> => isRecord(a))
              .map((a) => ({
                date: typeof a.date === "string" ? a.date : "2000-01-01",
                kind: typeof a.kind === "string" ? a.kind : "note",
                summary: typeof a.summary === "string" ? a.summary : "",
              }))
          : [],
      };
    }
  }
  return runtime;
}

export function organizationCounterError(
  runtime: OrganizationRuntime,
  counters: { nextOrgActionId: number },
): string | null {
  void runtime;
  if (!Number.isInteger(counters.nextOrgActionId) || counters.nextOrgActionId < 1) {
    return "counters.nextOrgActionId";
  }
  const max = parseCanonicalAllocatedId("OACT", "OACT000001");
  void max;
  return null;
}
