/**
 * Phase 11.4 — production-generator repetition calibration.
 * Advances a multi-year simulation and samples real media / crisis outputs.
 *
 * Run:
 *   pnpm --filter @lorsain/content-loader exec tsx ../../scripts/phase11_4-repetition-audit.mjs
 * Output:
 *   docs/qa/phase11_4/repetition-audit.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "../packages/sim/src/engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";
import { headlineFor } from "../packages/sim/src/media/monthly.js";
import { assignCrisisTheme } from "../packages/sim/src/foreign/crisis-emergence.js";
import { constitutionAlternativesFor } from "../packages/sim/src/provinces/constitutionAlternatives.js";
import {
  CONSTITUTIONAL_RULE_IDS,
  PROVINCIAL_BILL_SUBJECTS,
} from "../packages/sim/src/provinces/types.js";
import { CAMPAIGN_SITUATIONS } from "../packages/sim/src/campaigns/situations.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(repoRoot, "docs/qa/phase11_4/repetition-audit.json");

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function structuralKey(text) {
  return normalize(text)
    .replace(/\b(20\d{2}|npc\d+|act|bill|province|party)\b/g, "#")
    .replace(/\b\d+\b/g, "#");
}

function tally(items) {
  const exact = new Map();
  const structural = new Map();
  for (const item of items) {
    const n = normalize(item);
    const s = structuralKey(item);
    exact.set(n, (exact.get(n) ?? 0) + 1);
    structural.set(s, (structural.get(s) ?? 0) + 1);
  }
  const exactDupes = [...exact.values()].filter((c) => c > 1).reduce((a, b) => a + (b - 1), 0);
  const structuralDupes = [...structural.values()]
    .filter((c) => c > 1)
    .reduce((a, b) => a + (b - 1), 0);
  return {
    total: items.length,
    uniqueExact: exact.size,
    uniqueStructural: structural.size,
    exactDuplicateExtras: exactDupes,
    structuralDuplicateExtras: structuralDupes,
  };
}

function cooldownDupes(items, windowSize = 8) {
  let hits = 0;
  const recent = [];
  for (const item of items) {
    const key = normalize(item);
    if (recent.includes(key)) hits += 1;
    recent.push(key);
    if (recent.length > windowSize) recent.shift();
  }
  return hits;
}

function blankRuntime(over = {}) {
  return {
    countryId: "A",
    leaderId: null,
    posture: "normal",
    capabilities: {
      economic: 0.5,
      land: 0.5,
      air: 0.5,
      naval: 0.5,
      strategic: 0.5,
      cyber: 0.5,
      logistics: 0.5,
    },
    tradeExposure: 0.3,
    strategicGoals: [],
    institutionIds: [],
    activeSanctionIds: [],
    governmentStability: 0.6,
    economicCapacity: 0.5,
    economicTrend: 0,
    domesticPressure: 0.2,
    metadata: {},
    ...over,
  };
}

function blankRelation(over = {}) {
  return {
    general: -5,
    trust: 0.4,
    securityTension: 0.1,
    economicTies: 0.2,
    lastUpdated: null,
    ...over,
  };
}

function main() {
  const world = loadTerenaWorld();
  const player =
    world.startingTerms.find((term) => world.offices[term.officeId]?.kind === "assembly_member")
      ?.holderId ?? world.startingTerms[0]?.holderId;
  if (!player) throw new Error("No player politician available");

  const sim = createSimulation({
    world,
    playerPoliticianId: player,
    seed: "P114-REPETITION-AUDIT-2030",
  });

  const months = 36;
  const storyHeadlines = [];
  const regenerated = [];
  const crisisThemes = [];
  const seenStoryIds = new Set();

  for (let i = 0; i < months; i += 1) {
    advanceIntegrated(sim, 1);
    const snap = sim.getSnapshot();
    for (const story of Object.values(snap.mediaRuntime?.stories ?? {})) {
      if (!story?.id || seenStoryIds.has(story.id)) continue;
      seenStoryIds.add(story.id);
      if (typeof story.headlineKey === "string" && story.headlineKey.trim()) {
        storyHeadlines.push(story.headlineKey);
      }
      regenerated.push(
        headlineFor(story.factEventType ?? "UNKNOWN", story.framing ?? "restrained", {
          title: story.headlineKey,
        }),
      );
    }
  }

  const postures = [
    {
      a: blankRuntime({
        posture: "mobilized",
        strategicGoals: ["maritime_access"],
        capabilities: { ...blankRuntime().capabilities, naval: 0.7 },
      }),
      b: blankRuntime({ countryId: "B" }),
      rel: blankRelation(),
      neighbors: true,
      sanctions: false,
    },
    {
      a: blankRuntime(),
      b: blankRuntime({ countryId: "B" }),
      rel: blankRelation({ economicTies: 0.55 }),
      neighbors: false,
      sanctions: true,
    },
    {
      a: blankRuntime(),
      b: blankRuntime({ countryId: "B" }),
      rel: blankRelation({ economicTies: 0.55 }),
      neighbors: false,
      sanctions: false,
    },
    {
      a: blankRuntime(),
      b: blankRuntime({ countryId: "B" }),
      rel: blankRelation({ general: -30, securityTension: 0.4 }),
      neighbors: false,
      sanctions: false,
    },
    {
      a: blankRuntime(),
      b: blankRuntime({ countryId: "B" }),
      rel: blankRelation(),
      neighbors: true,
      sanctions: false,
    },
  ];
  for (let i = 0; i < 40; i += 1) {
    const p = postures[i % postures.length];
    crisisThemes.push(assignCrisisTheme(p.a, p.b, p.rel, p.neighbors, p.sanctions));
  }

  const campaignSituationTitles = CAMPAIGN_SITUATIONS.flatMap((s) => s.titles);
  const bannedFragments = [
    "viral debate",
    "debate aftermath",
    "election-eve rally",
    "dark-money",
    "doubled volunteer",
    "diplomatic expulsion",
    "naval confrontation",
    "trade corridor closure",
  ];
  const bannedHits = [...storyHeadlines, ...campaignSituationTitles].filter((text) =>
    bannedFragments.some((frag) => normalize(text).includes(normalize(frag))),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    seed: "P114-REPETITION-AUDIT-2030",
    monthsAdvanced: months,
    mediaStories: {
      ...tally(storyHeadlines),
      cooldownWindowDupes: cooldownDupes(storyHeadlines, 8),
      sample: storyHeadlines.slice(0, 16),
    },
    regeneratedHeadlines: {
      ...tally(regenerated),
      cooldownWindowDupes: cooldownDupes(regenerated, 8),
    },
    crisisThemes: {
      ...tally(crisisThemes),
      distribution: [
        ...crisisThemes
          .reduce((map, theme) => {
            map.set(theme, (map.get(theme) ?? 0) + 1);
            return map;
          }, new Map())
          .entries(),
      ].map(([theme, count]) => ({ theme, count })),
    },
    campaignSituations: {
      templateCount: CAMPAIGN_SITUATIONS.length,
      titleCount: campaignSituationTitles.length,
      ...tally(campaignSituationTitles),
      sample: campaignSituationTitles.slice(0, 12),
    },
    provincialBillSubjects: {
      total: PROVINCIAL_BILL_SUBJECTS.length,
      ids: [...PROVINCIAL_BILL_SUBJECTS],
    },
    constitutionAlternatives: Object.fromEntries(
      CONSTITUTIONAL_RULE_IDS.map((ruleId) => [
        ruleId,
        constitutionAlternativesFor(ruleId).map((alt) => ({
          value: alt.value,
          label: alt.label,
        })),
      ]),
    ),
    narrativeTruthSpotCheck: {
      bannedFragmentHits: bannedHits.length,
      bannedHits: bannedHits.slice(0, 10),
    },
    notes: [
      "mediaStories are unique story.headlineKey values accumulated across the run.",
      "Exact duplicates are acceptable for recurring institutional beats; structural duplicates deserve review when concentrated.",
      "Crisis themes are sampled across posture fixtures, not only emergent crises.",
    ],
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("wrote", OUT);
  console.log(
    JSON.stringify(
      {
        stories: report.mediaStories.total,
        exactDupExtras: report.mediaStories.exactDuplicateExtras,
        structuralDupExtras: report.mediaStories.structuralDuplicateExtras,
        bannedHits: report.narrativeTruthSpotCheck.bannedFragmentHits,
        crisisThemes: report.crisisThemes.distribution,
      },
      null,
      2,
    ),
  );
}

main();
