import { CAMPAIGN_SITUATIONS } from "../campaigns/situations.js";
import { readContentCooldownRegistry } from "../content/cooldown.js";
import { EXECUTIVE_SITUATIONS } from "../governing/situations.js";
import { ensureGoverningRuntime } from "../governing/state.js";
import { ensureHistory15Runtime } from "../history15/state.js";
import { ARTICLE_STRUCTURES, articleStructureFor, headlineFor } from "../media/index.js";
import type { MediaStory } from "../media/types.js";
import { headlineFingerprint, structuralHeadlineKey } from "../media/types.js";
import { ensurePoliticsRuntime } from "../politics/state.js";
import { SCANDAL_TYPES } from "../politics/scandals.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";

export const RUNTIME_BALANCE_REPORT_SCHEMA = "phase17c-runtime-balance/v1";

export type CountRow = { key: string; count: number; share?: number };

export type DiagnosticFlag = {
  code: string;
  severity: "info" | "watch" | "note";
  message: string;
  detail?: Record<string, unknown>;
};

export type RuntimeBalanceRunMeta = {
  seed: string;
  monthsAdvanced: number;
  startingDate: string;
  endingDate: string;
  elapsedMs?: number;
  /** Phase 17C matrix identity — used to prevent aggregate contamination. */
  runId?: string;
  matrix?: string;
  years?: number;
  commitSha?: string;
};

export type TemplateCatalogStats = {
  catalog: string;
  catalogSize: number;
  firedUnique: number;
  neverFired: string[];
  possiblyNeverEligible: string[];
  topRepeats: CountRow[];
};

export type RuntimeBalanceReport = {
  schema: typeof RUNTIME_BALANCE_REPORT_SCHEMA;
  generatedAt: string;
  meta: RuntimeBalanceRunMeta;
  history: {
    totalEvents: number;
    publicEvents: number;
    byType: CountRow[];
    byCategory: CountRow[];
  };
  newsComposition: {
    fromMediaStories: Record<string, number>;
    shares: CountRow[];
    headlineFamilies: CountRow[];
    categories: CountRow[];
    articleStructures: CountRow[];
    repetition: {
      totalStories: number;
      uniqueExact: number;
      uniqueStructural: number;
      exactDuplicateExtras: number;
      structuralDuplicateExtras: number;
      cooldownWindowDupes: number;
    };
  };
  templates: TemplateCatalogStats[];
  actorConcentration: {
    scandalTargets: CountRow[];
    cabinetEventActors: CountRow[];
  };
  partyConcentration: CountRow[];
  provinceConcentration: CountRow[];
  government: {
    governmentTerms: number;
    closedGovernmentTerms: number;
    averageTermMonths: number | null;
    coalitionFormed: number;
    coalitionBroken: number;
    cabinetReshuffles: number;
  };
  scandals: {
    totalRecords: number;
    openAtEnd: number;
    byType: CountRow[];
    byOutcome: CountRow[];
    byStage: CountRow[];
    historyEventTypes: CountRow[];
  };
  courts: {
    courtDecisionsInHistory: number;
    courtDecisionRecords: number;
    dispositions: CountRow[];
    doctrineMentions: CountRow[];
    caseTypes: CountRow[];
    precedentTreatments: CountRow[];
  };
  foreign: {
    crisesTotal: number;
    crisesActiveAtEnd: number;
    crisisThemes: CountRow[];
    treatiesTotal: number;
    historyTreatyEvents: CountRow[];
    historyCrisisEvents: CountRow[];
  };
  diagnosticFlags: DiagnosticFlag[];
};

function countByKey(items: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}

function toRows(map: Map<string, number>, total?: number, limit = 32): CountRow[] {
  return [...map.entries()]
    .map(([key, count]) => {
      const row: CountRow = { key, count };
      if (total != null && total > 0) {
        row.share = Math.round((count / total) * 1000) / 1000;
      }
      return row;
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function eventCategoryBucket(type: string): string {
  const t = type.toUpperCase();
  if (
    t.includes("SCANDAL") ||
    t === "POLITICAL_SCANDAL_ALLEGATION" ||
    t === "POLITICAL_SCANDAL_STAGE" ||
    t === "POLITICAL_SCANDAL_RESOLVED"
  ) {
    return "scandal";
  }
  if (
    t.startsWith("LAW_") ||
    t.startsWith("BILL_") ||
    t.startsWith("AMENDMENT_") ||
    t === "REGULATION_ENACTED"
  ) {
    return "legislation";
  }
  if (
    t.startsWith("LAW_IMPLEMENTATION") ||
    t === "LAW_FULLY_IMPLEMENTED" ||
    t.includes("IMPLEMENTATION")
  ) {
    return "implementation";
  }
  if (
    t.startsWith("GOVERNMENT_") ||
    t.startsWith("CABINET_") ||
    t.startsWith("BUDGET_") ||
    t.startsWith("MINISTRY_") ||
    t.includes("CONFIDENCE") ||
    t.includes("EMERGENCY")
  ) {
    return "government";
  }
  if (
    t.includes("ELECTION") ||
    t.startsWith("CAMPAIGN_") ||
    t.includes("DEBATE") ||
    t.includes("NOMINATION")
  ) {
    return "elections";
  }
  if (
    t.includes("COURT") ||
    t.includes("JUDGE") ||
    t.includes("IMPEACHMENT") ||
    t.includes("INVALIDATED") ||
    t.includes("CONSTITUTIONAL")
  ) {
    return "court";
  }
  if (t.startsWith("PROVINCIAL_") || t.startsWith("GOVERNOR_") || t.includes("PROVINCE")) {
    return "province";
  }
  if (
    t.startsWith("FOREIGN_") ||
    t.startsWith("TREATY_") ||
    t.includes("SANCTION") ||
    t.includes("DIPLOMATIC")
  ) {
    return "foreign";
  }
  if (
    t.startsWith("ECONOMIC_") ||
    t.includes("TRADE_") ||
    t.includes("FISCAL") ||
    t.includes("INFLATION") ||
    t.includes("RECESSION")
  ) {
    return "economy";
  }
  return "other";
}

function headlineFamily(story: Pick<MediaStory, "category" | "factEventType">): string {
  const type = String(story.factEventType ?? "UNKNOWN");
  const stem = type.toLowerCase().split("_").filter(Boolean).slice(0, 2).join("_");
  return `${story.category ?? "politics"}:${stem}`;
}

function tallyHeadlines(
  headlines: string[],
): RuntimeBalanceReport["newsComposition"]["repetition"] {
  const exact = new Map<string, number>();
  const structural = new Map<string, number>();
  for (const item of headlines) {
    const n = headlineFingerprint(item);
    const s = structuralHeadlineKey(item);
    exact.set(n, (exact.get(n) ?? 0) + 1);
    structural.set(s, (structural.get(s) ?? 0) + 1);
  }
  const exactDupes = [...exact.values()].filter((c) => c > 1).reduce((a, b) => a + (b - 1), 0);
  const structuralDupes = [...structural.values()]
    .filter((c) => c > 1)
    .reduce((a, b) => a + (b - 1), 0);
  return {
    totalStories: headlines.length,
    uniqueExact: exact.size,
    uniqueStructural: structural.size,
    exactDuplicateExtras: exactDupes,
    structuralDuplicateExtras: structuralDupes,
    cooldownWindowDupes: cooldownWindowDupes(headlines, 8),
  };
}

function cooldownWindowDupes(items: string[], windowSize: number): number {
  let hits = 0;
  const recent: string[] = [];
  for (const item of items) {
    const key = headlineFingerprint(item);
    if (recent.includes(key)) hits += 1;
    recent.push(key);
    if (recent.length > windowSize) recent.shift();
  }
  return hits;
}

function politicianParty(state: SimState, politicianId: string): string | null {
  return state.politicians[politicianId]?.partyId ?? null;
}

function payloadString(ev: SimEvent, field: string): string | null {
  const v = ev.payload?.[field];
  return typeof v === "string" ? v : null;
}

function collectTemplateStats(
  catalogName: string,
  catalogIds: readonly string[],
  firedCounts: Map<string, number>,
  cooldownRegistry: Record<string, string>,
): TemplateCatalogStats {
  const fired = new Set(firedCounts.keys());
  const neverFired = catalogIds.filter((id) => !fired.has(id));
  const possiblyNeverEligible = neverFired.filter((id) => !(id in cooldownRegistry));
  return {
    catalog: catalogName,
    catalogSize: catalogIds.length,
    firedUnique: fired.size,
    neverFired: neverFired.slice(0, 48),
    possiblyNeverEligible: possiblyNeverEligible.slice(0, 48),
    topRepeats: toRows(firedCounts, undefined, 16),
  };
}

function monthsBetween(start: string, end: string): number {
  const sy = Number(start.slice(0, 4));
  const sm = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  return Math.max(0, (ey - sy) * 12 + (em - sm));
}

function computeDiagnosticFlags(
  report: Omit<RuntimeBalanceReport, "diagnosticFlags">,
): DiagnosticFlag[] {
  const flags: DiagnosticFlag[] = [];
  const years = Math.max(1, report.meta.monthsAdvanced / 12);

  const lawFamily = report.newsComposition.headlineFamilies.find(
    (r) => r.key.includes("law_enacted") || r.key.includes("bill_signed"),
  );
  const mediaTotal = report.newsComposition.repetition.totalStories;
  if (mediaTotal > 0 && lawFamily && (lawFamily.count ?? 0) / mediaTotal >= 0.35) {
    flags.push({
      code: "NEWS_LEGISLATION_DOMINANCE",
      severity: "watch",
      message: "Legislation-related headline families exceed 35% of media stories.",
      detail: { family: lawFamily.key, share: lawFamily.share ?? lawFamily.count / mediaTotal },
    });
  }

  const scandalHist = report.scandals.historyEventTypes.reduce((s, r) => s + r.count, 0);
  if (scandalHist / years > 8) {
    flags.push({
      code: "SCANDAL_SPAM",
      severity: "watch",
      message: "Scandal-tagged history events exceed ~8 per simulated year.",
      detail: { perYear: Math.round((scandalHist / years) * 10) / 10 },
    });
  }
  if (scandalHist / years < 0.5 && report.meta.monthsAdvanced >= 60) {
    flags.push({
      code: "SCANDAL_DROUGHT",
      severity: "info",
      message: "Very few scandal history events over a multi-year run.",
      detail: { total: scandalHist, years },
    });
  }

  const execTemplate = report.templates.find((t) => t.catalog === "EXECUTIVE_SITUATIONS");
  if (execTemplate && execTemplate.topRepeats.length > 0) {
    const top = execTemplate.topRepeats[0]!;
    const execTotal = execTemplate.topRepeats.reduce((s, r) => s + r.count, 0);
    if (execTotal >= 5 && top.count / execTotal >= 0.4) {
      flags.push({
        code: "EXECUTIVE_SITUATION_CLUSTER",
        severity: "note",
        message: "One executive situation template accounts for a large share of fires.",
        detail: { situationId: top.key, share: top.count / execTotal },
      });
    }
  }

  if (report.newsComposition.repetition.cooldownWindowDupes >= 12) {
    flags.push({
      code: "MEDIA_RECENT_DUPLICATE_PRESSURE",
      severity: "watch",
      message: "Recent-window (8) exact headline duplicates are elevated.",
      detail: { cooldownWindowDupes: report.newsComposition.repetition.cooldownWindowDupes },
    });
  }

  if (report.government.averageTermMonths != null) {
    if (report.government.averageTermMonths >= 96) {
      flags.push({
        code: "GOVERNMENT_VERY_STABLE",
        severity: "info",
        message: "Average closed government term exceeds 8 years.",
        detail: { averageTermMonths: report.government.averageTermMonths },
      });
    } else if (
      report.government.averageTermMonths < 12 &&
      report.government.closedGovernmentTerms >= 2
    ) {
      flags.push({
        code: "GOVERNMENT_HIGH_CHURN",
        severity: "info",
        message: "Average closed government term under 12 months.",
        detail: { averageTermMonths: report.government.averageTermMonths },
      });
    }
  }

  const coalitionEvents = report.government.coalitionFormed + report.government.coalitionBroken;
  if (coalitionEvents >= 6) {
    flags.push({
      code: "COALITION_CHURN",
      severity: "note",
      message: "Multiple coalition form/break events detected.",
      detail: {
        formed: report.government.coalitionFormed,
        broken: report.government.coalitionBroken,
      },
    });
  }

  const provShare =
    report.newsComposition.shares.find((s) => s.key === "province")?.share ??
    (report.provinceConcentration.length === 0 ? 0 : undefined);
  if (mediaTotal > 80 && (provShare ?? 0) < 0.03) {
    flags.push({
      code: "PROVINCE_MEDIA_NEGLECT",
      severity: "info",
      message: "Province-tagged news composition share below 3%.",
      detail: { provinceShare: provShare ?? 0 },
    });
  }

  const topScandal = report.actorConcentration.scandalTargets[0];
  const scandalTargets = report.actorConcentration.scandalTargets.reduce((s, r) => s + r.count, 0);
  if (topScandal && scandalTargets >= 4 && topScandal.count / scandalTargets >= 0.5) {
    flags.push({
      code: "ACTOR_SCANDAL_CONCENTRATION",
      severity: "note",
      message: "A single politician received half or more of scandal targets.",
      detail: { politicianId: topScandal.key, share: topScandal.count / scandalTargets },
    });
  }

  const topHist = report.history.byType[0];
  if (
    topHist &&
    report.history.totalEvents > 0 &&
    topHist.count / report.history.totalEvents >= 0.25
  ) {
    flags.push({
      code: "HISTORY_TYPE_DOMINANCE",
      severity: "note",
      message: "One history event type exceeds 25% of all events.",
      detail: { type: topHist.key, share: topHist.count / report.history.totalEvents },
    });
  }

  if (report.foreign.crisesTotal / Math.max(1, years) > 8) {
    flags.push({
      code: "FOREIGN_CRISIS_SPAM",
      severity: "watch",
      message: "Cumulative foreign crises exceed ~8 per simulated year.",
      detail: {
        crisesTotal: report.foreign.crisesTotal,
        perYear: Math.round((report.foreign.crisesTotal / Math.max(1, years)) * 10) / 10,
      },
    });
  }

  if (report.foreign.crisisThemes.length === 1 && report.foreign.crisesTotal >= 4) {
    flags.push({
      code: "FOREIGN_CRISIS_THEME_FLAT",
      severity: "info",
      message: "All recorded foreign crises share one theme label.",
      detail: { theme: report.foreign.crisisThemes[0]?.key },
    });
  }

  const topTheme = report.foreign.crisisThemes[0];
  if (
    topTheme &&
    report.foreign.crisesTotal >= 8 &&
    (topTheme.share ?? topTheme.count / report.foreign.crisesTotal) >= 0.55
  ) {
    flags.push({
      code: "FOREIGN_CRISIS_THEME_DOMINANCE",
      severity: "watch",
      message: "Dominant foreign crisis theme exceeds 55% of crises.",
      detail: {
        theme: topTheme.key,
        share: topTheme.share ?? topTheme.count / report.foreign.crisesTotal,
      },
    });
  }

  const topDoctrine = report.courts.doctrineMentions[0];
  const doctrineTotal = report.courts.doctrineMentions.reduce((s, r) => s + r.count, 0);
  if (
    topDoctrine &&
    doctrineTotal >= 8 &&
    (topDoctrine.share ?? topDoctrine.count / doctrineTotal) >= 0.55
  ) {
    flags.push({
      code: "COURT_DOCTRINE_DOMINANCE",
      severity: "watch",
      message: "One constitutional rule dominates Court decisions.",
      detail: {
        doctrine: topDoctrine.key,
        share: topDoctrine.share ?? topDoctrine.count / doctrineTotal,
      },
    });
  }

  return flags;
}

/** Scan a finished simulation snapshot and produce Phase 17C balance stats. */
export function buildRuntimeBalanceReport(
  world: KernelWorld,
  state: SimState,
  meta: RuntimeBalanceRunMeta,
): RuntimeBalanceReport {
  void world;
  const history = state.history;
  const publicHistory = history.filter((e) => e.visibility === "public");

  const typeCounts = countByKey(history.map((e) => e.type));
  const categoryCounts = countByKey(history.map((e) => eventCategoryBucket(e.type)));

  const stories = Object.values(state.mediaRuntime?.stories ?? {}) as MediaStory[];
  const storyHeadlines: string[] = [];
  const families: string[] = [];
  const categories: string[] = [];
  const structures: string[] = [];
  const compositionFromMedia: Record<string, number> = {
    legislation: 0,
    government: 0,
    elections: 0,
    scandal: 0,
    court: 0,
    province: 0,
    foreign: 0,
    implementation: 0,
    economy: 0,
    other: 0,
  };

  for (const story of stories) {
    if (typeof story.headlineKey === "string" && story.headlineKey.trim()) {
      storyHeadlines.push(story.headlineKey);
    }
    families.push(headlineFamily(story));
    categories.push(story.category ?? "politics");
    const bucket = eventCategoryBucket(story.factEventType ?? "");
    compositionFromMedia[bucket] = (compositionFromMedia[bucket] ?? 0) + 1;
    const stored = story.publicEffects?.bodyStructure;
    structures.push(
      typeof stored === "string" && (ARTICLE_STRUCTURES as readonly string[]).includes(stored)
        ? stored
        : articleStructureFor({
            ...story,
            factEventType: story.factEventType,
          }),
    );
    void headlineFor(story.factEventType ?? "UNKNOWN", story.framing ?? "restrained", {
      title: story.headlineKey,
    });
  }

  const mediaTotal = stories.length;
  const compositionShares = Object.entries(compositionFromMedia).map(([key, count]) => ({
    key,
    count,
    share: mediaTotal > 0 ? Math.round((count / mediaTotal) * 1000) / 1000 : 0,
  }));

  const execFired = new Map<string, number>();
  const campaignFired = new Map<string, number>();
  const scandalTargetCounts = new Map<string, number>();
  const cabinetActorCounts = new Map<string, number>();
  const partyCounts = new Map<string, number>();
  const provinceCounts = new Map<string, number>();

  for (const ev of history) {
    if (ev.type === "GOVERNMENT_EXECUTIVE_SITUATION") {
      const sid = payloadString(ev, "situationId") ?? ev.entityIds[0] ?? "unknown";
      execFired.set(sid, (execFired.get(sid) ?? 0) + 1);
    }
    if (
      ev.type === "CAMPAIGN_SITUATION" ||
      ev.type === "CAMPAIGN_MESSAGE" ||
      ev.type === "CAMPAIGN_ATTACK"
    ) {
      const sid = payloadString(ev, "situationId");
      if (sid) campaignFired.set(sid, (campaignFired.get(sid) ?? 0) + 1);
    }
    if (ev.type.includes("SCANDAL")) {
      for (const actorId of ev.actorIds) {
        scandalTargetCounts.set(actorId, (scandalTargetCounts.get(actorId) ?? 0) + 1);
      }
    }
    if (
      ev.type === "CABINET_RESHUFFLE" ||
      ev.type === "CABINET_APPOINTMENT" ||
      ev.type === "CABINET_DISMISSAL"
    ) {
      for (const actorId of ev.actorIds) {
        cabinetActorCounts.set(actorId, (cabinetActorCounts.get(actorId) ?? 0) + 1);
      }
    }
    for (const actorId of ev.actorIds) {
      const partyId = politicianParty(state, actorId);
      if (partyId) partyCounts.set(partyId, (partyCounts.get(partyId) ?? 0) + 1);
    }
    const prov =
      payloadString(ev, "provinceId") ??
      ev.entityIds.find((id) => id.startsWith("PRV_") || id.startsWith("PROV")) ??
      null;
    if (prov) provinceCounts.set(prov, (provinceCounts.get(prov) ?? 0) + 1);
  }

  const politics = ensurePoliticsRuntime(state);
  const scandalTypeCounts = new Map<string, number>();
  const scandalOutcomeCounts = new Map<string, number>();
  const scandalStageCounts = new Map<string, number>();
  for (const record of Object.values(politics.scandals)) {
    scandalTypeCounts.set(record.typeId, (scandalTypeCounts.get(record.typeId) ?? 0) + 1);
    if (record.outcome) {
      scandalOutcomeCounts.set(record.outcome, (scandalOutcomeCounts.get(record.outcome) ?? 0) + 1);
    }
    scandalStageCounts.set(record.stage, (scandalStageCounts.get(record.stage) ?? 0) + 1);
    scandalTargetCounts.set(
      record.targetPoliticianId,
      (scandalTargetCounts.get(record.targetPoliticianId) ?? 0) + 1,
    );
  }

  const scandalHistoryTypes = countByKey(
    history.filter((e) => e.type.includes("SCANDAL")).map((e) => e.type),
  );

  const governingMeta = ensureGoverningRuntime(state).metadata;
  const politicsCooldown = readContentCooldownRegistry(politics.metadata);
  const governingCooldown = readContentCooldownRegistry(governingMeta);
  const mergedCooldown = { ...politicsCooldown, ...governingCooldown };

  const scandalFired = new Map<string, number>();
  for (const id of Object.keys(politics.scandals)) {
    const typeId = politics.scandals[id]?.typeId;
    if (typeId) scandalFired.set(typeId, (scandalFired.get(typeId) ?? 0) + 1);
  }

  const history15 = ensureHistory15Runtime(state);
  const closedGovs = history15.governments.filter((g) => g.end != null);
  const termLengths = closedGovs.map((g) => monthsBetween(g.start, g.end!));
  const avgTerm =
    termLengths.length > 0
      ? Math.round(termLengths.reduce((a, b) => a + b, 0) / termLengths.length)
      : null;

  const courtHist = history.filter((e) => e.type === "COURT_DECISION");
  const dispositionCounts = new Map<string, number>();
  const doctrineCounts = new Map<string, number>();
  const caseTypeCounts = new Map<string, number>();
  const precedentTreatmentCounts = new Map<string, number>();
  // Authoritative decisions — do not rely on history payload alone.
  const decisionRecords = Object.values(state.constitutionalRuntime?.courtDecisions ?? {});
  for (const decision of decisionRecords) {
    dispositionCounts.set(
      decision.disposition,
      (dispositionCounts.get(decision.disposition) ?? 0) + 1,
    );
    if (decision.constitutionalRule) {
      doctrineCounts.set(
        decision.constitutionalRule,
        (doctrineCounts.get(decision.constitutionalRule) ?? 0) + 1,
      );
    }
    caseTypeCounts.set(decision.caseType, (caseTypeCounts.get(decision.caseType) ?? 0) + 1);
    for (const t of decision.precedentTreatments ?? []) {
      precedentTreatmentCounts.set(t.relation, (precedentTreatmentCounts.get(t.relation) ?? 0) + 1);
    }
  }
  // Fallback for older snapshots missing decision records.
  if (decisionRecords.length === 0) {
    for (const ev of courtHist) {
      const outcome = payloadString(ev, "outcome") ?? payloadString(ev, "disposition") ?? "unknown";
      dispositionCounts.set(outcome, (dispositionCounts.get(outcome) ?? 0) + 1);
      const doctrine = payloadString(ev, "doctrineKey") ?? payloadString(ev, "constitutionalRule");
      if (doctrine) doctrineCounts.set(doctrine, (doctrineCounts.get(doctrine) ?? 0) + 1);
    }
  }

  const foreign = state.foreignAffairsRuntime;
  const crisisThemeCounts = new Map<string, number>();
  for (const crisis of Object.values(foreign?.crises ?? {})) {
    const theme =
      crisis.narrativeTitle ??
      (typeof crisis.metadata?.theme === "string" ? crisis.metadata.theme : null) ??
      (typeof crisis.metadata?.packageId === "string" ? crisis.metadata.packageId : null) ??
      "unknown";
    crisisThemeCounts.set(theme, (crisisThemeCounts.get(theme) ?? 0) + 1);
  }

  const treatyHist = countByKey(
    history.filter((e) => e.type.startsWith("TREATY_")).map((e) => e.type),
  );
  const crisisHist = countByKey(
    history.filter((e) => e.type.startsWith("FOREIGN_")).map((e) => e.type),
  );

  const partial: Omit<RuntimeBalanceReport, "diagnosticFlags"> = {
    schema: RUNTIME_BALANCE_REPORT_SCHEMA,
    generatedAt: `${meta.endingDate}T00:00:00.000Z`,
    meta,
    history: {
      totalEvents: history.length,
      publicEvents: publicHistory.length,
      byType: toRows(typeCounts, history.length, 40),
      byCategory: toRows(categoryCounts, history.length, 16),
    },
    newsComposition: {
      fromMediaStories: compositionFromMedia,
      shares: compositionShares.sort((a, b) => b.count - a.count),
      headlineFamilies: toRows(countByKey(families), families.length, 24),
      categories: toRows(countByKey(categories as string[]), categories.length, 12),
      articleStructures: toRows(countByKey(structures), structures.length, 12),
      repetition: tallyHeadlines(storyHeadlines),
    },
    templates: [
      collectTemplateStats(
        "EXECUTIVE_SITUATIONS",
        EXECUTIVE_SITUATIONS.map((s) => s.id),
        execFired,
        governingCooldown,
      ),
      collectTemplateStats(
        "SCANDAL_TYPES",
        SCANDAL_TYPES.map((s) => s.id),
        scandalFired,
        politicsCooldown,
      ),
      collectTemplateStats(
        "CAMPAIGN_SITUATIONS",
        CAMPAIGN_SITUATIONS.map((s) => s.id),
        campaignFired,
        mergedCooldown,
      ),
    ],
    actorConcentration: {
      scandalTargets: toRows(scandalTargetCounts, undefined, 12),
      cabinetEventActors: toRows(cabinetActorCounts, undefined, 12),
    },
    partyConcentration: toRows(partyCounts, undefined, 16),
    provinceConcentration: toRows(provinceCounts, undefined, 24),
    government: {
      governmentTerms: history15.governments.length,
      closedGovernmentTerms: closedGovs.length,
      averageTermMonths: avgTerm,
      coalitionFormed: history.filter((e) => e.type === "COALITION_FORMED").length,
      coalitionBroken: history.filter((e) => e.type === "COALITION_BROKEN").length,
      cabinetReshuffles: history.filter((e) => e.type === "CABINET_RESHUFFLE").length,
    },
    scandals: {
      totalRecords: Object.keys(politics.scandals).length,
      openAtEnd: Object.values(politics.scandals).filter((s) => s.outcome == null).length,
      byType: toRows(scandalTypeCounts, undefined, 12),
      byOutcome: toRows(scandalOutcomeCounts, undefined, 12),
      byStage: toRows(scandalStageCounts, undefined, 12),
      historyEventTypes: toRows(scandalHistoryTypes, undefined, 12),
    },
    courts: {
      courtDecisionsInHistory: courtHist.length,
      courtDecisionRecords: decisionRecords.length,
      dispositions: toRows(dispositionCounts, undefined, 12),
      doctrineMentions: toRows(doctrineCounts, decisionRecords.length || undefined, 12),
      caseTypes: toRows(caseTypeCounts, decisionRecords.length || undefined, 12),
      precedentTreatments: toRows(precedentTreatmentCounts, undefined, 12),
    },
    foreign: {
      crisesTotal: Object.keys(foreign?.crises ?? {}).length,
      crisesActiveAtEnd: Object.values(foreign?.crises ?? {}).filter(
        (c) => c.stage === "active" || c.stage === "incident" || c.stage === "conflict",
      ).length,
      crisisThemes: toRows(crisisThemeCounts, undefined, 12),
      treatiesTotal: Object.keys(foreign?.treaties ?? {}).length,
      historyTreatyEvents: toRows(treatyHist, undefined, 12),
      historyCrisisEvents: toRows(crisisHist, undefined, 12),
    },
  };

  return {
    ...partial,
    diagnosticFlags: computeDiagnosticFlags(partial),
  };
}

export function formatRuntimeBalanceMarkdownSummary(aggregate: {
  generatedAt: string;
  seedCount: number;
  years: number;
  seeds: RuntimeBalanceReport[];
  flagRollup: CountRow[];
}): string {
  const lines: string[] = [
    "# Phase 17C runtime balance summary",
    "",
    `Generated: ${aggregate.generatedAt}`,
    "",
    `- Seeds: **${aggregate.seedCount}**`,
    `- Horizon: **${aggregate.years} years** each`,
    "",
    "## Diagnostic flag rollup",
    "",
  ];
  if (aggregate.flagRollup.length === 0) {
    lines.push("_No flags fired across seeds._");
  } else {
    for (const row of aggregate.flagRollup) {
      lines.push(`- \`${row.key}\`: ${row.count} seed(s)`);
    }
  }
  lines.push("", "## Per-seed highlights", "");
  for (const rep of aggregate.seeds) {
    const flags = rep.diagnosticFlags.map((f) => f.code).join(", ") || "(none)";
    const topFamily = rep.newsComposition.headlineFamilies[0];
    lines.push(
      `### ${rep.meta.seed}`,
      "",
      `- History events: ${rep.history.totalEvents}; media stories: ${rep.newsComposition.repetition.totalStories}`,
      `- Top headline family: \`${topFamily?.key ?? "n/a"}\` (${topFamily?.count ?? 0})`,
      `- Scandals: ${rep.scandals.totalRecords} records; cabinet reshuffles: ${rep.government.cabinetReshuffles}`,
      `- Flags: ${flags}`,
      "",
    );
  }
  lines.push(
    "## Machine-readable",
    "",
    "- Aggregate: `docs/qa/phase17c/runtime-balance-report.json`",
    "- Per-seed shards: `docs/qa/phase17c/seeds/*.json`",
    "",
  );
  return lines.join("\n");
}
