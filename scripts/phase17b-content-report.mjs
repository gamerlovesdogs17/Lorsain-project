/**
 * Lightweight Phase 17B catalog inventory for Extended QA.
 *
 *   node scripts/phase17b-content-report.mjs
 */
/* eslint-disable no-undef */
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(ROOT, "packages/sim/package.json"));

async function loadSimExports() {
  const simPath = resolve(ROOT, "packages/sim/dist/index.js");
  try {
    return await import(simPath);
  } catch {
    console.warn("Build packages/sim first (npm run build -w @lorsain/sim) — using dynamic ts import fallback skipped.");
    process.exit(1);
  }
}

function countLinesMatching(fileRel, pattern) {
  const fs = require("node:fs");
  const text = fs.readFileSync(resolve(ROOT, fileRel), "utf8");
  return (text.match(pattern) ?? []).length;
}

const main = async () => {
  const sim = await loadSimExports();
  const rows = [];

  const push = (label, count) => rows.push({ label, count });

  if (sim.listPartyPriorities) push("party priorities", sim.listPartyPriorities().length);
  if (sim.CAMPAIGN_SITUATIONS) push("campaign situations", sim.CAMPAIGN_SITUATIONS.length);
  if (sim.ORG_LOBBY_CAMPAIGN_TEMPLATES)
    push("org lobby templates", sim.ORG_LOBBY_CAMPAIGN_TEMPLATES.length);
  if (sim.CAUCUS_PRESSURE_TEMPLATES)
    push("caucus pressure templates", sim.CAUCUS_PRESSURE_TEMPLATES.length);
  if (sim.EXECUTIVE_SITUATIONS) push("executive situations", sim.EXECUTIVE_SITUATIONS.length);
  if (sim.SCANDAL_TYPES) push("scandal types", sim.SCANDAL_TYPES.length);
  if (sim.LEGISLATIVE_PROVISIONS) push("provision families", sim.LEGISLATIVE_PROVISIONS.length);
  if (sim.CONSTITUTION_CHANGE_SUBJECTS)
    push("constitution subjects", sim.CONSTITUTION_CHANGE_SUBJECTS.length);

  push("judicial doctrine rule keys", countLinesMatching("packages/sim/src/courts/legalContent.ts", /^  [a-z_]+:/gm));

  console.log("Phase 17B content report\n");
  for (const row of rows.sort((a, b) => a.label.localeCompare(b.label))) {
    console.log(`  ${row.label.padEnd(28)} ${String(row.count).padStart(4)}`);
  }
  console.log("\nTip: run phase17b.content.test.ts in CI for regression guards.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
