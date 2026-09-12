/**
 * Phase 17B repetition / variety report (machine-readable + console summary).
 *
 *   node scripts/phase17b-content-report.mjs
 *
 * Does not enforce balance thresholds — informational only (safe for CI invoke).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const SIM_DIST = resolve(ROOT, "packages/sim/dist");
const GENERATED_AT = new Date().toISOString().slice(0, 10);

async function importSim(subpath) {
  const abs = resolve(SIM_DIST, subpath);
  try {
    return await import(pathToFileURL(abs).href);
  } catch (err) {
    console.warn(
      `Could not import ${subpath} — run: pnpm --filter @lorsain/sim build\n  ${err.message}`,
    );
    process.exit(1);
  }
}

function readText(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/** @param {Record<string, unknown>[]} entries @param {(e: Record<string, unknown>) => string} patternKey */
function clusterAnalysis(entries, patternKey) {
  const clusters = new Map();
  for (const entry of entries) {
    const key = patternKey(entry);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(entry);
  }
  const clusterList = [...clusters.entries()]
    .map(([patternKey, members]) => ({
      patternKey,
      count: members.length,
      memberIds: members.map((m) => m.id).sort(),
    }))
    .sort((a, b) => b.count - a.count || a.patternKey.localeCompare(b.patternKey));

  const distinctPatterns = clusterList.length;
  const total = entries.length;
  const reskinFlags = clusterList
    .filter((c) => c.count >= 2)
    .map((c) => ({
      patternKey: c.patternKey,
      count: c.count,
      memberIds: c.memberIds,
      reason: "multiple catalog ids share the same mechanical pattern heuristic",
    }));

  const dominanceNotes = [];
  for (const c of clusterList) {
    const share = total > 0 ? c.count / total : 0;
    if (share >= 0.35 && c.count >= 3) {
      dominanceNotes.push({
        patternKey: c.patternKey,
        share: Math.round(share * 1000) / 1000,
        count: c.count,
        total,
        note: "OVERREPRESENTED: one mechanical pattern covers a large share of this category",
      });
    }
  }

  const titlePressure =
    total > 0 && distinctPatterns > 0 && total / distinctPatterns >= 2.5
      ? "LIKELY_RESKIN_CLUSTER: entry count materially exceeds distinct pattern count"
      : null;

  return {
    totalEntries: total,
    distinctMechanicalPatterns: distinctPatterns,
    mechanicalPatternClusters: clusterList.slice(0, 24),
    likelyReskinClusterFlags: reskinFlags.slice(0, 16),
    dominanceNotes,
    categoryNotes: titlePressure ? [titlePressure] : [],
  };
}

function countRegex(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

function parseInteractionRules(source) {
  const blocks = source.split(/\n {2}\{\n/).slice(1);
  return blocks.map((block) => {
    const id = block.match(/id: "([^"]+)"/)?.[1] ?? "unknown";
    const kind = block.match(/kind: "([^"]+)"/)?.[1] ?? "?";
    const provisionA = block.match(/provisionA: "([^"]+)"/)?.[1] ?? "?";
    const provisionB = block.match(/provisionB: "([^"]+)"/)?.[1] ?? "?";
    return { id, kind, provisionA, provisionB };
  });
}

function parseCrisisPackageIds(source) {
  const ids = [...source.matchAll(/packageId: "([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

function parseDoctrineRuleKeys(source) {
  return [...source.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
}

function headlineBranchCount(source) {
  return countRegex(source, /if \(type === "[A-Z_]+"/g);
}

function provisionPatternKey(prov) {
  const options = prov.options ?? [];
  const optionShape = options
    .map((o) => `${o.controlHint ?? "none"}:${(o.dimensionEffects ?? []).length}`)
    .sort()
    .join("|");
  const issues = [...new Set(options.map((o) => o.issueId).filter(Boolean))].sort().join(",");
  return `issues=${issues}|opts=${options.length}|shape=${optionShape.slice(0, 120)}`;
}

const main = async () => {
  const [
    { EXECUTIVE_SITUATIONS },
    { SCANDAL_TYPES },
    { CAMPAIGN_SITUATIONS },
    {
      ORG_LOBBY_CAMPAIGN_TEMPLATES,
      CAUCUS_PRESSURE_TEMPLATES,
      listPartyPriorities,
      PLATFORM_POLICY_OPTIONS,
      CAMPAIGN_STRATEGY_CATALOG,
    },
    { LEGISLATIVE_PROVISIONS },
    { CONSTITUTION_CHANGE_SUBJECTS },
  ] = await Promise.all([
    importSim("governing/situations.js"),
    importSim("politics/scandals.js"),
    importSim("campaigns/situations.js"),
    importSim("partyOrg/catalog.js"),
    importSim("legislature/provisions.js"),
    importSim("provinces/constitutionChanges.js"),
  ]);

  const interactionsSource = readText("packages/sim/src/governing/interactions.ts");
  const crisisSource = readText("packages/sim/src/foreign/crisis-packages.ts");
  const legalSource = readText("packages/sim/src/courts/legalContent.ts");
  const mediaSource = readText("packages/sim/src/media/monthly.ts");

  const interactionRules = parseInteractionRules(interactionsSource);
  const crisisPackageIds = parseCrisisPackageIds(crisisSource);
  const doctrineKeys = parseDoctrineRuleKeys(legalSource);

  const categories = {};

  const partyPriorities = listPartyPriorities();
  categories.party_priorities = clusterAnalysis(
    partyPriorities.map((p) => ({ id: p.id, ...p })),
    (p) => `issueBucket=${p.issueId ?? "none"}|weight=${p.defaultWeight ?? "?"}`,
  );

  categories.campaign_situations = clusterAnalysis(
    CAMPAIGN_SITUATIONS.map((s) => ({ id: s.id, ...s })),
    (s) =>
      `event=${s.eventType}|imp=${s.importance}|delta=${JSON.stringify(s.standingDelta ?? {})}`,
  );

  categories.executive_situations = clusterAnalysis(
    EXECUTIVE_SITUATIONS.map((s) => ({
      id: s.id,
      departmentId: s.departmentId,
      minMonthsBetween: s.minMonthsBetween,
      importance: s.importance,
      titleCount: s.titles.length,
      whenSource: s.when?.toString?.().replace(/\s+/g, " ").slice(0, 160) ?? "",
    })),
    (s) =>
      `dept=${s.departmentId}|cooldown=${s.minMonthsBetween}|imp=${s.importance}|when=${s.whenSource}`,
  );

  categories.scandal_types = clusterAnalysis(
    SCANDAL_TYPES.map((t) => ({ id: t.id, ...t })),
    (t) =>
      `path=${t.severityPath}|grounds=${t.grounds}|dept=${t.departmentHint ?? "none"}|wt=${t.weight}`,
  );

  categories.org_lobby_templates = clusterAnalysis(
    ORG_LOBBY_CAMPAIGN_TEMPLATES.map((t) => ({ id: t.id, ...t })),
    (t) =>
      `stance=${t.stance}|issues=${[...(t.issueIds ?? [])].sort().join(",")}|amend=${t.preferAmendment ?? "none"}|bonus=${t.billPressureBonus ?? 0}`,
  );

  categories.caucus_pressure_templates = clusterAnalysis(
    CAUCUS_PRESSURE_TEMPLATES.map((t) => ({ id: t.id, ...t })),
    (t) => `requiresBill=${t.requiresPriorityBill}`,
  );

  categories.legislative_provisions = clusterAnalysis(
    LEGISLATIVE_PROVISIONS.map((p) => ({ id: p.id, ...p })),
    provisionPatternKey,
  );
  categories.legislative_provisions.optionCount = LEGISLATIVE_PROVISIONS.reduce(
    (n, p) => n + (p.options?.length ?? 0),
    0,
  );

  categories.constitution_subjects = clusterAnalysis(
    CONSTITUTION_CHANGE_SUBJECTS.map((s) => ({
      id: s.id,
      articleId: s.articleId,
      altCount: s.alternatives?.length ?? 0,
    })),
    (s) => `article=${s.articleId}|alts=${s.altCount}`,
  );

  categories.policy_interaction_rules = clusterAnalysis(
    interactionRules.map((r) => ({ id: r.id, ...r })),
    (r) => `kind=${r.kind}|A=${r.provisionA}|B=${r.provisionB}`,
  );

  categories.foreign_crisis_packages = {
    totalEntries: crisisPackageIds.length,
    distinctMechanicalPatterns: crisisPackageIds.length,
    packageIds: crisisPackageIds.sort(),
    mechanicalPatternClusters: crisisPackageIds.map((id) => ({
      patternKey: id,
      count: 1,
      memberIds: [id],
    })),
    likelyReskinClusterFlags: [],
    dominanceNotes: [],
    categoryNotes: [],
  };

  categories.judicial_doctrine_labels = {
    totalEntries: doctrineKeys.length,
    distinctMechanicalPatterns: doctrineKeys.length,
    ruleKeys: doctrineKeys.sort(),
    mechanicalPatternClusters: doctrineKeys.map((k) => ({
      patternKey: k,
      count: 1,
      memberIds: [k],
    })),
    likelyReskinClusterFlags: [],
    dominanceNotes: [],
    categoryNotes: [],
  };

  categories.media_headline_branches = {
    totalEntries: headlineBranchCount(mediaSource),
    distinctMechanicalPatterns: headlineBranchCount(mediaSource),
    categoryNotes: [
      "Static count of explicit event-type branches in headlineFor (not runtime frequency).",
      "Historical probe: law_enacted headlines dominate 36-month samples — see phase17b-content-audit.md.",
    ],
    likelyReskinClusterFlags: [],
    dominanceNotes: [
      {
        patternKey: "BILL/LAW pipeline",
        share: null,
        note: "OVERREPRESENTED in play: routine bill events vs executive/scandal/foreign beats (audit).",
      },
    ],
    mechanicalPatternClusters: [],
  };

  const platformFlat = Object.entries(PLATFORM_POLICY_OPTIONS).flatMap(([issueId, opts]) =>
    (opts ?? []).map((o) => ({ ...o, issueId: o.issueId ?? issueId })),
  );
  categories.platform_policy_options = {
    totalEntries: platformFlat.length,
    distinctMechanicalPatterns: new Set(platformFlat.map((o) => o.issueId)).size,
    byIssue: Object.fromEntries(
      Object.entries(PLATFORM_POLICY_OPTIONS)
        .map(([issueId, opts]) => [issueId, opts?.length ?? 0])
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };

  const campaignStrategies = Object.values(CAMPAIGN_STRATEGY_CATALOG);
  categories.campaign_strategies = {
    totalEntries: campaignStrategies.length,
    distinctMechanicalPatterns: campaignStrategies.length,
    ids: campaignStrategies.map((s) => s.id).sort(),
  };

  const summaryRows = [
    ["party priorities", partyPriorities.length],
    ["campaign situations", CAMPAIGN_SITUATIONS.length],
    ["executive situations", EXECUTIVE_SITUATIONS.length],
    ["scandal types", SCANDAL_TYPES.length],
    ["org lobby templates", ORG_LOBBY_CAMPAIGN_TEMPLATES.length],
    ["caucus pressure templates", CAUCUS_PRESSURE_TEMPLATES.length],
    ["provision families", LEGISLATIVE_PROVISIONS.length],
    ["provision options", categories.legislative_provisions.optionCount],
    ["constitution subjects", CONSTITUTION_CHANGE_SUBJECTS.length],
    ["policy interaction rules", interactionRules.length],
    ["crisis escalation packages", crisisPackageIds.length],
    ["doctrine rule keys", doctrineKeys.length],
    ["media headline branches", categories.media_headline_branches.totalEntries],
    ["platform policy options", platformFlat.length],
    ["campaign strategies", campaignStrategies.length],
  ];

  const report = {
    schema: "phase17b-repetition-report/v1",
    generatedAt: GENERATED_AT,
    repo: "lorsain",
    phase: "17B.2",
    summaryCounts: Object.fromEntries(summaryRows),
    categories,
    exportsChecked: {
      validatePhase17bContentCatalogs: readText("packages/sim/src/content/validate17b.ts").includes(
        "validatePhase17bContentCatalogs",
      ),
    },
    ciPolicy: "informational_only — no threshold failures",
  };

  const outJson = resolve(ROOT, "docs/qa/phase17b-repetition-report.json");
  const outMd = resolve(ROOT, "docs/qa/phase17b-repetition-report.md");
  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, stableJson(report));

  const mdLines = [
    "# Phase 17B repetition / variety report",
    "",
    `**Generated:** ${GENERATED_AT}  `,
    "**Command:** `node scripts/phase17b-content-report.mjs`  ",
    "**Machine-readable:** [phase17b-repetition-report.json](./phase17b-repetition-report.json)",
    "",
    "## Summary counts",
    "",
    "| Catalog | Entries |",
    "|---------|--------:|",
    ...summaryRows.map(([label, count]) => `| ${label} | **${count}** |`),
    "",
    "## Dominance / reskin signals (per category)",
    "",
  ];

  for (const [cat, data] of Object.entries(categories)) {
    if (!data?.dominanceNotes?.length && !data?.likelyReskinClusterFlags?.length && !data?.categoryNotes?.length) {
      continue;
    }
    mdLines.push(`### ${cat}`, "");
    if (data.categoryNotes?.length) {
      for (const n of data.categoryNotes) mdLines.push(`- ${n}`);
    }
    for (const d of data.dominanceNotes ?? []) {
      mdLines.push(`- **OVERREPRESENTED:** \`${d.patternKey}\`${d.share != null ? ` (${Math.round(d.share * 100)}%)` : ""} — ${d.note ?? ""}`);
    }
    for (const f of (data.likelyReskinClusterFlags ?? []).slice(0, 5)) {
      mdLines.push(`- **LIKELY_RESKIN_CLUSTER:** \`${f.patternKey}\` ×${f.count} (${f.memberIds.join(", ")})`);
    }
    mdLines.push("");
  }

  mdLines.push("## CI", "", "This report is informational; it does not fail on balance thresholds.", "");
  writeFileSync(outMd, mdLines.join("\n"));

  console.log("Phase 17B repetition / variety report\n");
  for (const [label, count] of summaryRows.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${label.padEnd(28)} ${String(count).padStart(4)}`);
  }
  console.log(`\nWrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
  console.log("\nTip: pair with phase17b.content.test.ts for catalog regression guards.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
