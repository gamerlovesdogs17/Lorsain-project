/**
 * Phase 11.4 proposal-effect coverage audit.
 * Reports how many legislative proposal options have proposal-specific /
 * parameterized coverage vs direction×magnitude-only fallback.
 *
 * Coverage = runtime-true: option is in PROVISION_OPTION_EFFECTS table
 * OR parameterScaledDelta would return non-null (option AND founding
 * both have parameterValue, and the provisionId is handled).
 *
 * Run: node scripts/audit-policy-effects.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const provisionsSrc = readFileSync(join(root, "packages/sim/src/legislature/provisions.ts"), "utf8");
const policySrc = readFileSync(join(root, "packages/sim/src/economy/policy.ts"), "utf8");

// ── 1. Parse PROVISION_OPTION_EFFECTS table ──────────────────────────
/** @type {Map<string, Set<string>>} */
const specificEffects = new Map();
const tableMatch = policySrc.match(
  /const PROVISION_OPTION_EFFECTS[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
);
if (tableMatch) {
  const body = tableMatch[1];
  const provBlocks = [...body.matchAll(/PROV_[A-Z0-9_]+\s*:\s*\{/g)];
  for (let i = 0; i < provBlocks.length; i++) {
    const provId = provBlocks[i][0].match(/PROV_[A-Z0-9_]+/)[0];
    const start = provBlocks[i].index;
    const end = i + 1 < provBlocks.length ? provBlocks[i + 1].index : body.length;
    const chunk = body.slice(start, end);
    const optionIds = [...chunk.matchAll(/^\s*([a-z0-9_]+)\s*:/gm)].map((m) => m[1]);
    specificEffects.set(provId, new Set(optionIds));
  }
}

// ── 2. Parse parameterScaledDelta handled provisionIds ───────────────
const paramHandled = new Set();
const paramFnMatch = policySrc.match(
  /function parameterScaledDelta\b[\s\S]*?\nfunction\s/,
);
if (paramFnMatch) {
  const fnBody = paramFnMatch[0];
  for (const m of fnBody.matchAll(/"(PROV_[A-Z0-9_]+)"/g)) {
    paramHandled.add(m[1]);
  }
}
// The generic fallback at the end of parameterScaledDelta handles any provision
// whose option AND founding both have parameterValue, so treat all as handled
// when both conditions hold.
const hasGenericParamFallback = /\/\/ Generic fallback/.test(policySrc);

// ── 3. Parse provisions: collect options + founding parameterValues ───
const starts = [...provisionsSrc.matchAll(/variableProvision\(\s*"(PROV_[^"]+)"/g)];

/** @type {Map<string, number|null>} provisionId → founding parameterValue */
const foundingParamValues = new Map();

/** @type {Array<{provisionId:string,optionId:string,founding:boolean,parameterValue:boolean,parameterValueNum:number|null,specific:boolean,runtimeTrue:boolean,issueId:string}>} */
const options = [];

for (let i = 0; i < starts.length; i++) {
  const provisionId = starts[i][1];
  const start = starts[i].index ?? 0;
  const end = i + 1 < starts.length ? (starts[i + 1].index ?? provisionsSrc.length) : provisionsSrc.length;
  const body = provisionsSrc.slice(start, end);

  // Extract issueId
  const issueMatch = body.match(/variableProvision\(\s*"[^"]+"\s*,\s*"([^"]+)"/);
  const issueId = issueMatch ? issueMatch[1] : "UNKNOWN";

  // Find founding parameterValue for this provision
  const optionStarts = [...body.matchAll(/\boption\(\s*"([^"]+)"/g)];
  let foundingPV = null;
  for (let j = 0; j < optionStarts.length; j++) {
    const optStart = optionStarts[j].index ?? 0;
    const optEnd =
      j + 1 < optionStarts.length ? (optionStarts[j + 1].index ?? body.length) : body.length;
    const optBody = body.slice(optStart, optEnd);
    if (/founding:\s*true/.test(optBody)) {
      const pvMatch = optBody.match(/parameterValue\s*:\s*([\d.]+)/);
      if (pvMatch) foundingPV = Number(pvMatch[1]);
    }
  }
  foundingParamValues.set(provisionId, foundingPV);

  // Now collect all options
  for (let j = 0; j < optionStarts.length; j++) {
    const optionId = optionStarts[j][1];
    const optStart = optionStarts[j].index ?? 0;
    const optEnd =
      j + 1 < optionStarts.length ? (optionStarts[j + 1].index ?? body.length) : body.length;
    const optBody = body.slice(optStart, optEnd);
    const founding = /founding:\s*true/.test(optBody);
    const pvMatch = optBody.match(/parameterValue\s*:\s*([\d.]+)/);
    const hasParamValue = pvMatch != null;
    const paramValueNum = pvMatch ? Number(pvMatch[1]) : null;

    const specific = specificEffects.get(provisionId)?.has(optionId) === true;

    // Runtime-true: in the effects table OR parameterScaledDelta returns non-null
    let paramScaledWorks = false;
    if (hasParamValue && foundingPV != null && paramValueNum != null && paramValueNum !== foundingPV) {
      paramScaledWorks = paramHandled.has(provisionId) || hasGenericParamFallback;
    }
    const runtimeTrue = specific || paramScaledWorks;

    options.push({
      provisionId,
      optionId,
      founding,
      parameterValue: hasParamValue,
      parameterValueNum: paramValueNum,
      specific,
      runtimeTrue,
      issueId,
    });
  }
}

const proposals = options.filter((o) => !o.founding);
const withSpecific = proposals.filter((o) => o.specific);
const withParamScaled = proposals.filter((o) => o.runtimeTrue && !o.specific);
const withRuntimeCoverage = proposals.filter((o) => o.runtimeTrue);
const directionMagnitudeOnly = proposals.filter((o) => !o.runtimeTrue);

// ── 4. Per-issue and per-family summary ──────────────────────────────
/** @type {Record<string, {total:number,covered:number,provisions:string[]}>} */
const byIssue = {};
for (const o of proposals) {
  if (!byIssue[o.issueId]) byIssue[o.issueId] = { total: 0, covered: 0, provisions: [] };
  byIssue[o.issueId].total += 1;
  if (o.runtimeTrue) byIssue[o.issueId].covered += 1;
  if (!byIssue[o.issueId].provisions.includes(o.provisionId)) {
    byIssue[o.issueId].provisions.push(o.provisionId);
  }
}

// Option count distribution
const provisionCounts = {};
for (const prov of starts) {
  const provId = prov[1];
  const provProposals = proposals.filter((o) => o.provisionId === provId);
  provisionCounts[provId] = provProposals.length;
}
const countDistribution = {};
for (const count of Object.values(provisionCounts)) {
  countDistribution[count] = (countDistribution[count] || 0) + 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  totalOptions: options.length,
  foundingBaselines: options.filter((o) => o.founding).length,
  proposalOptions: proposals.length,
  withProposalSpecificIndexDelta: withSpecific.length,
  withParameterScaledDelta: withParamScaled.length,
  withRuntimeCoverage: withRuntimeCoverage.length,
  stillDirectionMagnitudeOnly: directionMagnitudeOnly.length,
  coverageShare:
    proposals.length === 0
      ? 0
      : Number((withRuntimeCoverage.length / proposals.length).toFixed(4)),
  byIssue,
  optionCountDistribution: countDistribution,
  sampleDirectionMagnitudeOnly: directionMagnitudeOnly.slice(0, 25).map((o) => ({
    provisionId: o.provisionId,
    optionId: o.optionId,
  })),
};

const out = join(root, "docs/qa/phase11_4/policy-effects-audit.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
