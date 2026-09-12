import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { createConstitutionalGrounds } from "../courts/procedure.js";
import type { ImpeachmentGrounds } from "../courts/types.js";
import { currentMinisterHolderId } from "../executive/state.js";
import { ministryOfficeForDepartment } from "../governing/departments.js";
import type { DepartmentId } from "../governing/types.js";
import { contentCooldownEligible, recordContentCooldown, readContentCooldownRegistry } from "../content/cooldown.js";
import { ensurePoliticsRuntime } from "./state.js";

export type ScandalSeverityPath = "administrative" | "investigation" | "prosecutorial";

export type ScandalTypeDefinition = {
  id: string;
  label: string;
  minMonthsBetween: number;
  /** Base monthly spawn weight when eligible targets exist. */
  weight: number;
  departmentHint: DepartmentId | null;
  grounds: ImpeachmentGrounds;
  severityPath: ScandalSeverityPath;
  /** Evidence strength registered when path reaches investigation+. */
  evidenceAtInvestigation: number;
  severityAtInvestigation: number;
  headlines: readonly string[];
};

export const SCANDAL_TYPES: readonly ScandalTypeDefinition[] = [
  {
    id: "scandal_petty_expense",
    label: "Petty expense irregularity",
    minMonthsBetween: 14,
    weight: 0.35,
    departmentHint: null,
    grounds: "grave_unlawful_exercise_of_office",
    severityPath: "administrative",
    evidenceAtInvestigation: 0.35,
    severityAtInvestigation: 0.4,
    headlines: [
      "Expense records draw internal audit attention",
      "Minor spending irregularity enters the public file",
    ],
  },
  {
    id: "scandal_procurement_favor",
    label: "Procurement favoritism allegation",
    minMonthsBetween: 18,
    weight: 0.22,
    departmentHint: "defense",
    grounds: "serious_public_corruption",
    severityPath: "investigation",
    evidenceAtInvestigation: 0.55,
    severityAtInvestigation: 0.62,
    headlines: [
      "Procurement contract links trigger favoritism questions",
      "Opposition presses for an independent contract review",
    ],
  },
  {
    id: "scandal_undisclosed_interest",
    label: "Undisclosed financial interest",
    minMonthsBetween: 16,
    weight: 0.25,
    departmentHint: "economy",
    grounds: "serious_public_corruption",
    severityPath: "investigation",
    evidenceAtInvestigation: 0.5,
    severityAtInvestigation: 0.58,
    headlines: [
      "Undisclosed interest allegation targets a minister",
      "Registry gap raises conflict-of-interest scrutiny",
    ],
  },
  {
    id: "scandal_data_misuse",
    label: "Misuse of official data",
    minMonthsBetween: 20,
    weight: 0.18,
    departmentHint: "interior",
    grounds: "grave_unlawful_exercise_of_office",
    severityPath: "investigation",
    evidenceAtInvestigation: 0.48,
    severityAtInvestigation: 0.55,
    headlines: [
      "Data access logs fuel misuse allegations",
      "Privacy advocates demand answers on official data use",
    ],
  },
  {
    id: "scandal_witness_interference",
    label: "Witness interference allegation",
    minMonthsBetween: 24,
    weight: 0.12,
    departmentHint: "justice",
    grounds: "serious_constitutional_abuse",
    severityPath: "prosecutorial",
    evidenceAtInvestigation: 0.65,
    severityAtInvestigation: 0.72,
    headlines: [
      "Witness interference claim opens a high-stakes probe",
      "Justice committee summons officials over interference allegation",
    ],
  },
  {
    id: "scandal_campaign_overlap",
    label: "Campaign–office overlap allegation",
    minMonthsBetween: 15,
    weight: 0.2,
    departmentHint: null,
    grounds: "grave_unlawful_exercise_of_office",
    severityPath: "administrative",
    evidenceAtInvestigation: 0.42,
    severityAtInvestigation: 0.48,
    headlines: [
      "Campaign staff overlap raises office-boundary questions",
      "Election watchdog flags mixed campaign and official work",
    ],
  },
] as const;

function ministerTargets(world: KernelWorld, state: SimState): string[] {
  const ids: string[] = [];
  const departments: DepartmentId[] = [
    "finance",
    "interior",
    "justice",
    "defense",
    "economy",
    "health",
    "energy",
  ];
  for (const dept of departments) {
    const officeId = ministryOfficeForDepartment(dept);
    if (!officeId) continue;
    const holder = currentMinisterHolderId(world, state, officeId);
    if (holder) ids.push(holder);
  }
  return [...new Set(ids)].sort();
}

function pickScandalType(state: SimState, rng: RngService): ScandalTypeDefinition | null {
  const registry = readContentCooldownRegistry(ensurePoliticsRuntime(state).metadata);
  const eligible = SCANDAL_TYPES.filter((t) =>
    contentCooldownEligible(registry, t.id, state.currentDate, t.minMonthsBetween),
  );
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, t) => s + t.weight, 0);
  let roll = rng.float01("scandals") * total;
  for (const t of eligible) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return eligible[eligible.length - 1] ?? null;
}

function pathStageRoll(rng: RngService, path: ScandalSeverityPath): "allegation" | "investigation" | "referral" {
  const r = rng.float01("scandals");
  if (path === "administrative") {
    return r < 0.75 ? "allegation" : "investigation";
  }
  if (path === "investigation") {
    if (r < 0.45) return "allegation";
    if (r < 0.85) return "investigation";
    return "referral";
  }
  if (r < 0.25) return "allegation";
  if (r < 0.65) return "investigation";
  return "referral";
}

/**
 * Low-frequency scandal allegations tied to impeachment grounds placeholders.
 * Uses politicsRuntime.metadata content cooldowns — not every month.
 */
export function processScandalAllegationsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = Number(state.currentDate.slice(5, 7));
  if (month % 3 !== 0) return [];

  const targets = ministerTargets(world, state);
  if (targets.length === 0) return [];

  if (rng.float01("scandals") > 0.08) return [];

  const scandalType = pickScandalType(state, rng);
  if (!scandalType) return [];

  const registry = readContentCooldownRegistry(ensurePoliticsRuntime(state).metadata);
  recordContentCooldown(ensurePoliticsRuntime(state).metadata, scandalType.id, state.currentDate);

  let targetPool = targets;
  if (scandalType.departmentHint) {
    const officeId = ministryOfficeForDepartment(scandalType.departmentHint);
    const preferred = officeId ? currentMinisterHolderId(world, state, officeId) : null;
    if (preferred) targetPool = [preferred];
  }
  const targetId = targetPool[Math.floor(rng.float01("scandals") * targetPool.length)] ?? targets[0]!;
  const stage = pathStageRoll(rng, scandalType.severityPath);
  const headline =
    scandalType.headlines[Math.floor(rng.float01("scandals") * scandalType.headlines.length)] ??
    scandalType.label;

  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "POLITICAL_SCANDAL_ALLEGATION",
      importance: stage === "referral" ? 0.72 : stage === "investigation" ? 0.58 : 0.45,
      visibility: "public",
      actorIds: [targetId],
      entityIds: [scandalType.id],
      payload: {
        scandalTypeId: scandalType.id,
        label: scandalType.label,
        title: headline,
        stage,
        severityPath: scandalType.severityPath,
        targetPoliticianId: targetId,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];

  if (stage === "investigation" || stage === "referral") {
    const sourceKind =
      scandalType.grounds === "serious_public_corruption"
        ? ("future_corruption_investigation" as const)
        : ("future_scandal" as const);
    createConstitutionalGrounds(state, {
      targetPoliticianId: targetId,
      grounds: scandalType.grounds,
      sourceKind,
      sourceId: scandalType.id,
      evidenceStrength: scandalType.evidenceAtInvestigation,
      severity:
        stage === "referral"
          ? Math.min(1, scandalType.severityAtInvestigation + 0.12)
          : scandalType.severityAtInvestigation,
      public: true,
      metadata: {
        scandalTypeId: scandalType.id,
        stage,
        severityPath: scandalType.severityPath,
      },
    });
  }

  return events;
}
