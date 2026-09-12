import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { createConstitutionalGrounds } from "../courts/procedure.js";
import type { ImpeachmentGrounds } from "../courts/types.js";
import { currentMinisterHolderId } from "../executive/state.js";
import { ministryOfficeForDepartment } from "../governing/departments.js";
import type { DepartmentId } from "../governing/types.js";
import {
  contentCooldownEligible,
  recordContentCooldown,
  readContentCooldownRegistry,
} from "../content/cooldown.js";
import { ensurePoliticsRuntime } from "./state.js";

export type ScandalSeverityPath = "administrative" | "investigation" | "prosecutorial";

export type ScandalStage =
  "allegation" | "scrutiny" | "investigation" | "finding" | "referral" | "resolution";

export type ScandalEvidenceLabel = "weak" | "mixed" | "significant" | "strong";

export type ScandalOutcome =
  | "substantiated"
  | "partially_substantiated"
  | "unsubstantiated"
  | "exonerated"
  | "unresolved"
  | "procedurally_closed";

export type ScandalTargetResponse =
  "deny" | "cooperate" | "recuse" | "apologize" | "resign" | "blame_staff" | "fight";

export type ScandalPartyResponse =
  | "defend"
  | "demand_explanation"
  | "suspend_role"
  | "request_resignation"
  | "wait_for_investigation";

export type ScandalRecord = {
  id: string;
  typeId: string;
  targetPoliticianId: string;
  allegationDate: string;
  stage: ScandalStage;
  public: boolean;
  /** Hidden numeric evidence 0–1; UI uses evidenceLabel. */
  evidenceStrength: number;
  evidenceLabel: ScandalEvidenceLabel;
  severity: number;
  investigator: string | null;
  partyResponse: ScandalPartyResponse | null;
  governmentResponse: ScandalPartyResponse | null;
  targetResponse: ScandalTargetResponse | null;
  legalReferralId: string | null;
  outcome: ScandalOutcome | null;
  resignationPressure: number;
  historyEventIds: string[];
  cooldownTemplateId: string;
  monthsInStage: number;
  metadata: Record<string, unknown>;
};

export type ScandalTypeDefinition = {
  id: string;
  label: string;
  minMonthsBetween: number;
  weight: number;
  departmentHint: DepartmentId | null;
  grounds: ImpeachmentGrounds;
  severityPath: ScandalSeverityPath;
  investigatorDefault: string;
  initialEvidence: number;
  initialSeverity: number;
  headlines: readonly string[];
  /** Distinct stage progression weights (allegation→…→resolution). */
  stageWeights: Readonly<Record<ScandalStage, number>>;
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
    investigatorDefault: "internal_audit",
    initialEvidence: 0.28,
    initialSeverity: 0.32,
    headlines: [
      "Expense records draw internal audit attention",
      "Minor spending irregularity enters the public file",
    ],
    stageWeights: {
      allegation: 0.2,
      scrutiny: 0.35,
      investigation: 0.2,
      finding: 0.15,
      referral: 0.02,
      resolution: 0.08,
    },
  },
  {
    id: "scandal_procurement_favor",
    label: "Procurement favoritism allegation",
    minMonthsBetween: 18,
    weight: 0.22,
    departmentHint: "defense",
    grounds: "serious_public_corruption",
    severityPath: "investigation",
    investigatorDefault: "procurement_inspectorate",
    initialEvidence: 0.42,
    initialSeverity: 0.55,
    headlines: [
      "Procurement contract links trigger favoritism questions",
      "Opposition presses for an independent contract review",
    ],
    stageWeights: {
      allegation: 0.15,
      scrutiny: 0.2,
      investigation: 0.3,
      finding: 0.18,
      referral: 0.1,
      resolution: 0.07,
    },
  },
  {
    id: "scandal_undisclosed_interest",
    label: "Undisclosed financial interest",
    minMonthsBetween: 16,
    weight: 0.25,
    departmentHint: "economy",
    grounds: "serious_public_corruption",
    severityPath: "investigation",
    investigatorDefault: "ethics_office",
    initialEvidence: 0.4,
    initialSeverity: 0.52,
    headlines: [
      "Undisclosed interest allegation targets a minister",
      "Registry gap raises conflict-of-interest scrutiny",
    ],
    stageWeights: {
      allegation: 0.15,
      scrutiny: 0.25,
      investigation: 0.28,
      finding: 0.16,
      referral: 0.08,
      resolution: 0.08,
    },
  },
  {
    id: "scandal_data_misuse",
    label: "Misuse of official data",
    minMonthsBetween: 20,
    weight: 0.18,
    departmentHint: "interior",
    grounds: "grave_unlawful_exercise_of_office",
    severityPath: "investigation",
    investigatorDefault: "privacy_commissioner",
    initialEvidence: 0.38,
    initialSeverity: 0.5,
    headlines: [
      "Data access logs fuel misuse allegations",
      "Privacy advocates demand answers on official data use",
    ],
    stageWeights: {
      allegation: 0.15,
      scrutiny: 0.22,
      investigation: 0.3,
      finding: 0.18,
      referral: 0.07,
      resolution: 0.08,
    },
  },
  {
    id: "scandal_witness_interference",
    label: "Witness interference allegation",
    minMonthsBetween: 24,
    weight: 0.12,
    departmentHint: "justice",
    grounds: "serious_constitutional_abuse",
    severityPath: "prosecutorial",
    investigatorDefault: "special_counsel",
    initialEvidence: 0.55,
    initialSeverity: 0.7,
    headlines: [
      "Witness interference claim opens a high-stakes probe",
      "Justice committee summons officials over interference allegation",
    ],
    stageWeights: {
      allegation: 0.1,
      scrutiny: 0.15,
      investigation: 0.28,
      finding: 0.15,
      referral: 0.22,
      resolution: 0.1,
    },
  },
  {
    id: "scandal_campaign_overlap",
    label: "Campaign–office overlap allegation",
    minMonthsBetween: 15,
    weight: 0.2,
    departmentHint: null,
    grounds: "grave_unlawful_exercise_of_office",
    severityPath: "administrative",
    investigatorDefault: "election_watchdog",
    initialEvidence: 0.34,
    initialSeverity: 0.42,
    headlines: [
      "Campaign staff overlap raises office-boundary questions",
      "Election watchdog flags mixed campaign and official work",
    ],
    stageWeights: {
      allegation: 0.18,
      scrutiny: 0.3,
      investigation: 0.25,
      finding: 0.15,
      referral: 0.04,
      resolution: 0.08,
    },
  },
] as const;

const STAGE_ORDER: ScandalStage[] = [
  "allegation",
  "scrutiny",
  "investigation",
  "finding",
  "referral",
  "resolution",
];

export function evidenceLabelFromStrength(strength: number): ScandalEvidenceLabel {
  if (strength < 0.3) return "weak";
  if (strength < 0.5) return "mixed";
  if (strength < 0.72) return "significant";
  return "strong";
}

export function scandalTypeById(id: string): ScandalTypeDefinition | null {
  return SCANDAL_TYPES.find((t) => t.id === id) ?? null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

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

function chooseTargetResponse(
  rng: RngService,
  type: ScandalTypeDefinition,
  evidence: number,
): ScandalTargetResponse {
  const r = rng.float01("scandals");
  if (type.severityPath === "administrative") {
    if (r < 0.35) return "cooperate";
    if (r < 0.55) return "apologize";
    if (r < 0.8) return "deny";
    return "blame_staff";
  }
  if (evidence > 0.7 && r < 0.12) return "resign";
  if (r < 0.25) return "deny";
  if (r < 0.45) return "fight";
  if (r < 0.65) return "cooperate";
  if (r < 0.8) return "recuse";
  return "blame_staff";
}

function choosePartyResponse(
  rng: RngService,
  type: ScandalTypeDefinition,
  evidence: number,
  pressure: number,
): ScandalPartyResponse {
  const r = rng.float01("scandals");
  if (pressure > 0.75 && evidence > 0.6) {
    return r < 0.55 ? "request_resignation" : "suspend_role";
  }
  if (type.severityPath === "prosecutorial") {
    return r < 0.5 ? "wait_for_investigation" : "demand_explanation";
  }
  if (evidence < 0.35) return r < 0.55 ? "defend" : "wait_for_investigation";
  if (r < 0.35) return "demand_explanation";
  if (r < 0.6) return "wait_for_investigation";
  if (r < 0.8) return "defend";
  return "suspend_role";
}

function nextStage(
  current: ScandalStage,
  type: ScandalTypeDefinition,
  rng: RngService,
  evidence: number,
): ScandalStage {
  if (current === "resolution") return "resolution";
  const idx = STAGE_ORDER.indexOf(current);
  // Rare skip forward for severe paths with strong evidence.
  if (type.severityPath === "prosecutorial" && evidence > 0.65 && rng.float01("scandals") < 0.25) {
    const jump = Math.min(STAGE_ORDER.length - 1, idx + 2);
    return STAGE_ORDER[jump]!;
  }
  // Soft exit to resolution from early stages when evidence collapses.
  if (evidence < 0.22 && current !== "allegation" && rng.float01("scandals") < 0.35) {
    return "resolution";
  }
  const next = STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, idx + 1)]!;
  // Administrative paths rarely enter referral.
  if (next === "referral" && type.severityPath === "administrative" && evidence < 0.7) {
    return "resolution";
  }
  return next;
}

function resolveOutcome(
  type: ScandalTypeDefinition,
  evidence: number,
  stageReached: ScandalStage,
  rng: RngService,
): ScandalOutcome {
  if (evidence < 0.25) {
    return rng.float01("scandals") < 0.55 ? "exonerated" : "unsubstantiated";
  }
  if (evidence < 0.4) {
    return rng.float01("scandals") < 0.5 ? "unsubstantiated" : "procedurally_closed";
  }
  if (stageReached === "referral" || (type.severityPath === "prosecutorial" && evidence > 0.62)) {
    return evidence > 0.7 ? "substantiated" : "partially_substantiated";
  }
  if (evidence > 0.68) return "substantiated";
  if (evidence > 0.5) return "partially_substantiated";
  return rng.float01("scandals") < 0.4 ? "unresolved" : "procedurally_closed";
}

function evolveEvidence(record: ScandalRecord, type: ScandalTypeDefinition, rng: RngService): void {
  const r = rng.float01("scandals");
  let delta = 0;
  if (record.stage === "scrutiny") delta = r < 0.55 ? 0.06 : r < 0.8 ? -0.04 : 0.02;
  else if (record.stage === "investigation") {
    delta = r < 0.5 ? 0.1 : r < 0.75 ? 0.03 : -0.05;
    if (type.severityPath === "prosecutorial") delta += 0.04;
  } else if (record.stage === "finding" || record.stage === "referral") {
    delta = r < 0.6 ? 0.05 : -0.02;
  } else if (record.stage === "allegation") {
    delta = r < 0.4 ? 0.03 : r < 0.7 ? 0 : -0.03;
  }
  if (record.targetResponse === "cooperate") delta += 0.03;
  if (record.targetResponse === "fight" || record.targetResponse === "deny") delta -= 0.02;
  if (record.targetResponse === "apologize") delta += 0.01;
  record.evidenceStrength = clamp01(record.evidenceStrength + delta);
  record.evidenceLabel = evidenceLabelFromStrength(record.evidenceStrength);
  record.severity = clamp01(
    record.severity +
      (delta > 0 ? delta * 0.5 : delta * 0.35) +
      (type.severityPath === "prosecutorial" ? 0.01 : 0),
  );
}

function updateResignationPressure(record: ScandalRecord, type: ScandalTypeDefinition): void {
  let p = record.severity * 0.35 + record.evidenceStrength * 0.4;
  if (record.stage === "referral" || record.stage === "finding") p += 0.12;
  if (record.partyResponse === "request_resignation") p += 0.18;
  if (record.partyResponse === "suspend_role") p += 0.1;
  if (record.partyResponse === "defend") p -= 0.08;
  if (record.targetResponse === "cooperate" || record.targetResponse === "apologize") p -= 0.05;
  if (type.severityPath === "administrative") p *= 0.55;
  if (type.severityPath === "prosecutorial") p *= 1.15;
  record.resignationPressure = clamp01(p);
}

function createScandalRecord(
  state: SimState,
  type: ScandalTypeDefinition,
  targetId: string,
  rng: RngService,
): ScandalRecord {
  const evidence = clamp01(type.initialEvidence + (rng.float01("scandals") - 0.5) * 0.08);
  const id = `SCD_${type.id}_${targetId}_${state.currentDate}_${Object.keys(ensurePoliticsRuntime(state).scandals).length + 1}`;
  return {
    id,
    typeId: type.id,
    targetPoliticianId: targetId,
    allegationDate: state.currentDate,
    stage: "allegation",
    public: true,
    evidenceStrength: evidence,
    evidenceLabel: evidenceLabelFromStrength(evidence),
    severity: clamp01(type.initialSeverity + (rng.float01("scandals") - 0.5) * 0.06),
    investigator: type.investigatorDefault,
    partyResponse: null,
    governmentResponse: null,
    targetResponse: null,
    legalReferralId: null,
    outcome: null,
    resignationPressure: 0,
    historyEventIds: [],
    cooldownTemplateId: type.id,
    monthsInStage: 0,
    metadata: {
      severityPath: type.severityPath,
      label: type.label,
    },
  };
}

/** Deterministic fixture helper for tests — starts a scandal without monthly RNG spawn. */
export function openScandalFixture(
  state: SimState,
  typeId: string,
  targetPoliticianId: string,
  overrides?: Partial<Pick<ScandalRecord, "evidenceStrength" | "severity" | "stage">>,
): ScandalRecord {
  const type = scandalTypeById(typeId);
  if (!type) throw new Error(`unknown scandal type ${typeId}`);
  const runtime = ensurePoliticsRuntime(state);
  const evidence = overrides?.evidenceStrength ?? type.initialEvidence;
  const record: ScandalRecord = {
    id: `SCD_FIX_${typeId}_${targetPoliticianId}`,
    typeId,
    targetPoliticianId,
    allegationDate: state.currentDate,
    stage: overrides?.stage ?? "allegation",
    public: true,
    evidenceStrength: clamp01(evidence),
    evidenceLabel: evidenceLabelFromStrength(evidence),
    severity: clamp01(overrides?.severity ?? type.initialSeverity),
    investigator: type.investigatorDefault,
    partyResponse: null,
    governmentResponse: null,
    targetResponse: null,
    legalReferralId: null,
    outcome: null,
    resignationPressure: 0,
    historyEventIds: [],
    cooldownTemplateId: typeId,
    monthsInStage: 0,
    metadata: { fixture: true, severityPath: type.severityPath, label: type.label },
  };
  runtime.scandals[record.id] = record;
  return record;
}

function maybeCreateLegalReferral(
  state: SimState,
  record: ScandalRecord,
  type: ScandalTypeDefinition,
): void {
  if (record.legalReferralId) return;
  if (
    record.stage !== "referral" &&
    !(record.stage === "finding" && type.severityPath === "prosecutorial")
  ) {
    return;
  }
  if (record.evidenceStrength < 0.55) return;
  const sourceKind =
    type.grounds === "serious_public_corruption"
      ? ("future_corruption_investigation" as const)
      : ("future_scandal" as const);
  const grounds = createConstitutionalGrounds(state, {
    targetPoliticianId: record.targetPoliticianId,
    grounds: type.grounds,
    sourceKind,
    sourceId: record.id,
    evidenceStrength: record.evidenceStrength,
    severity: record.severity,
    public: true,
    metadata: {
      scandalTypeId: type.id,
      stage: record.stage,
      severityPath: type.severityPath,
      evidenceLabel: record.evidenceLabel,
    },
  });
  record.legalReferralId = grounds.id;
}

/**
 * Spawn at most one new allegation arc (rare). Does not immediately resolve guilt.
 */
export function processScandalAllegationsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = Number(state.currentDate.slice(5, 7));
  if (month % 3 !== 0) return [];

  const runtime = ensurePoliticsRuntime(state);
  const openCount = Object.values(runtime.scandals).filter((s) => s.outcome == null).length;
  if (openCount >= 3) return [];

  const targets = ministerTargets(world, state);
  if (targets.length === 0) return [];
  if (rng.float01("scandals") > 0.08) return [];

  const scandalType = pickScandalType(state, rng);
  if (!scandalType) return [];

  recordContentCooldown(runtime.metadata, scandalType.id, state.currentDate);

  let targetPool = targets;
  if (scandalType.departmentHint) {
    const officeId = ministryOfficeForDepartment(scandalType.departmentHint);
    const preferred = officeId ? currentMinisterHolderId(world, state, officeId) : null;
    if (preferred) targetPool = [preferred];
  }
  const targetId =
    targetPool[Math.floor(rng.float01("scandals") * targetPool.length)] ?? targets[0]!;

  // Avoid stacking identical open type on same target.
  const alreadyOpen = Object.values(runtime.scandals).some(
    (s) => s.outcome == null && s.targetPoliticianId === targetId && s.typeId === scandalType.id,
  );
  if (alreadyOpen) return [];

  const record = createScandalRecord(state, scandalType, targetId, rng);
  record.targetResponse = chooseTargetResponse(rng, scandalType, record.evidenceStrength);
  record.partyResponse = choosePartyResponse(
    rng,
    scandalType,
    record.evidenceStrength,
    record.resignationPressure,
  );
  record.governmentResponse = record.partyResponse;
  updateResignationPressure(record, scandalType);
  runtime.scandals[record.id] = record;

  const headline =
    scandalType.headlines[Math.floor(rng.float01("scandals") * scandalType.headlines.length)] ??
    scandalType.label;

  const ev = pushHistory(state, {
    date: state.currentDate,
    type: "POLITICAL_SCANDAL_ALLEGATION",
    importance: 0.45,
    visibility: "public",
    actorIds: [targetId],
    entityIds: [scandalType.id, record.id],
    payload: {
      scandalId: record.id,
      scandalTypeId: scandalType.id,
      label: scandalType.label,
      title: headline,
      stage: record.stage,
      evidenceLabel: record.evidenceLabel,
      severityPath: scandalType.severityPath,
      targetPoliticianId: targetId,
      targetResponse: record.targetResponse,
      partyResponse: record.partyResponse,
    },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  record.historyEventIds.push(ev.id);
  return [ev];
}

/**
 * Advance open scandal arcs one stage tick — evidence, responses, referral, resolution.
 */
export function processScandalLifecycleMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];

  for (const record of Object.values(runtime.scandals)) {
    if (record.outcome != null) continue;
    const type = scandalTypeById(record.typeId);
    if (!type) continue;

    record.monthsInStage += 1;
    // Stay at least one month in allegation before advancing.
    if (record.stage === "allegation" && record.monthsInStage < 1) continue;
    if (record.monthsInStage < 1) continue;

    evolveEvidence(record, type, rng);
    if (!record.targetResponse) {
      record.targetResponse = chooseTargetResponse(rng, type, record.evidenceStrength);
    }
    record.partyResponse = choosePartyResponse(
      rng,
      type,
      record.evidenceStrength,
      record.resignationPressure,
    );
    record.governmentResponse = record.partyResponse;
    updateResignationPressure(record, type);

    const prevStage = record.stage;
    const advanced = nextStage(record.stage, type, rng, record.evidenceStrength);
    if (advanced !== prevStage) {
      record.stage = advanced;
      record.monthsInStage = 0;
    }

    maybeCreateLegalReferral(state, record, type);

    if (
      record.resignationPressure > 0.82 &&
      record.evidenceStrength > 0.58 &&
      record.targetResponse !== "resign" &&
      rng.float01("scandals") < 0.2
    ) {
      record.targetResponse = "resign";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "POLITICAL_SCANDAL_RESIGNATION_PRESSURE",
          importance: 0.68,
          visibility: "public",
          actorIds: [record.targetPoliticianId],
          entityIds: [record.id],
          payload: {
            scandalId: record.id,
            scandalTypeId: type.id,
            evidenceLabel: record.evidenceLabel,
            partyResponse: record.partyResponse,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }

    if (
      record.stage === "resolution" ||
      (record.monthsInStage >= 3 && prevStage === record.stage && record.stage !== "allegation")
    ) {
      // Force resolution if stalled too long after finding/referral.
      if (
        record.stage !== "resolution" &&
        (record.stage === "finding" || record.stage === "referral")
      ) {
        record.stage = "resolution";
      }
    }

    if (record.stage === "resolution" && record.outcome == null) {
      record.outcome = resolveOutcome(type, record.evidenceStrength, prevStage, rng);
      const importance =
        record.outcome === "substantiated" || record.outcome === "partially_substantiated"
          ? 0.62
          : 0.4;
      const ev = pushHistory(state, {
        date: state.currentDate,
        type: "POLITICAL_SCANDAL_RESOLVED",
        importance,
        visibility: "public",
        actorIds: [record.targetPoliticianId],
        entityIds: [record.id, type.id],
        payload: {
          scandalId: record.id,
          scandalTypeId: type.id,
          outcome: record.outcome,
          evidenceLabel: record.evidenceLabel,
          legalReferralId: record.legalReferralId,
          targetResponse: record.targetResponse,
          partyResponse: record.partyResponse,
          // Allegation does not imply guilt — outcome is authoritative.
          guilty:
            record.outcome === "substantiated" || record.outcome === "partially_substantiated",
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      });
      record.historyEventIds.push(ev.id);
      events.push(ev);
    } else if (advanced !== prevStage) {
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "POLITICAL_SCANDAL_STAGE",
          importance: record.stage === "referral" ? 0.7 : 0.5,
          visibility: "public",
          actorIds: [record.targetPoliticianId],
          entityIds: [record.id],
          payload: {
            scandalId: record.id,
            scandalTypeId: type.id,
            stage: record.stage,
            previousStage: prevStage,
            evidenceLabel: record.evidenceLabel,
            investigator: record.investigator,
            partyResponse: record.partyResponse,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }

  void world;
  return events;
}

/** Combined monthly entry used by political agency. */
export function processScandalsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events = processScandalLifecycleMonth(world, state, rng, commandId);
  events.push(...processScandalAllegationsMonth(world, state, rng, commandId));
  return events;
}

/** Advance a fixture scandal N deterministic months (test helper). */
export function advanceScandalForTests(
  state: SimState,
  scandalId: string,
  months: number,
  rng: RngService,
  commandId = "test_scandal",
): ScandalRecord {
  const runtime = ensurePoliticsRuntime(state);
  const record = runtime.scandals[scandalId];
  if (!record) throw new Error(`missing scandal ${scandalId}`);
  for (let i = 0; i < months; i++) {
    processScandalLifecycleMonth({} as KernelWorld, state, rng, commandId);
  }
  return record;
}
