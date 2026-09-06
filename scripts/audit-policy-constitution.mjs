import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const provisionsSrc = readFileSync(join(root, "packages/sim/src/legislature/provisions.ts"), "utf8");
const changesSrc = readFileSync(
  join(root, "packages/sim/src/provinces/constitutionChanges.ts"),
  "utf8",
);
const constitution = JSON.parse(readFileSync(join(root, "data/terena_constitution.json"), "utf8"));

const keepLabels = [...provisionsSrc.matchAll(/label:\s*"([^"]*[Kk]eep[^"]*)"/g)].map((m) => m[1]);
const foundingTrue = [...provisionsSrc.matchAll(/founding:\s*true/g)].length;
const currentTrue = [...provisionsSrc.matchAll(/current:\s*true/g)].length;
const provisionIds = [...provisionsSrc.matchAll(/variableProvision\(\s*"(PROV_[^"]+)"/g)].map(
  (m) => m[1],
);

const starts = [...provisionsSrc.matchAll(/variableProvision\(\s*"(PROV_[^"]+)"/g)];
const optionCounts = [];
let categorical = 0;
let numerical = 0;
let binary = 0;
let withParameter = 0;
for (let i = 0; i < starts.length; i++) {
  const start = starts[i].index ?? 0;
  const end = i + 1 < starts.length ? (starts[i + 1].index ?? provisionsSrc.length) : provisionsSrc.length;
  const body = provisionsSrc.slice(start, end);
  const options = [...body.matchAll(/\boption\(\s*"/g)].length;
  optionCounts.push(options);
  const isNumeric = /controlHint:\s*"(threshold|numeric|percentage|duration)"|parameterValue:/.test(
    body,
  );
  if (isNumeric) {
    numerical += 1;
    withParameter += 1;
  } else if (options === 2) binary += 1;
  else categorical += 1;
}

const proposalCounts = optionCounts.map((n) => Math.max(0, n - 1));
const distribution = {
  1: proposalCounts.filter((n) => n === 1).length,
  2: proposalCounts.filter((n) => n === 2).length,
  3: proposalCounts.filter((n) => n === 3).length,
  4: proposalCounts.filter((n) => n === 4).length,
  "5+": proposalCounts.filter((n) => n >= 5).length,
};

const subjectBlocks = [
  ...changesSrc.matchAll(
    /^\s+\{\s*\n\s+id:\s*"(art\d+_[^"]+)",\s*\n\s+articleId:\s*"(ARTICLE_[IVX]+)"/gm,
  ),
];
const subjectIds = subjectBlocks.map((m) => m[1]);
const articleCoverage = {};
for (const article of constitution.document.articles) {
  articleCoverage[article.id] = { subjects: 0, subjectIds: [] };
}
for (const match of subjectBlocks) {
  const subjectId = match[1];
  const articleId = match[2];
  if (!articleCoverage[articleId]) {
    articleCoverage[articleId] = { subjects: 0, subjectIds: [] };
  }
  articleCoverage[articleId].subjects += 1;
  articleCoverage[articleId].subjectIds.push(subjectId);
}

const articles = constitution.document.articles;
let clauses = 0;
const articleRows = [];
for (const a of articles) {
  let ac = 0;
  for (const s of a.sections) for (const _cl of s.clauses) {
    clauses += 1;
    ac += 1;
  }
  const coverage = articleCoverage[a.id] ?? { subjects: 0, subjectIds: [] };
  articleRows.push({
    id: a.id,
    title: a.title,
    clauses: ac,
    amendmentSubjects: coverage.subjects,
    subjectIds: coverage.subjectIds,
    amendable: coverage.subjects > 0,
    effect: coverage.subjects > 0 ? "structured gameplay + metrics" : "NONE",
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  legislation: {
    policySubjects: provisionIds.length,
    foundingBaselines: foundingTrue,
    obsoleteCurrentTrue: currentTrue,
    keepCurrentLabels: keepLabels.length,
    keepSample: keepLabels.slice(0, 20),
    categorical,
    numericalOrThreshold: numerical,
    binary,
    withParameters: withParameter,
    proposalOptionDistribution: distribution,
    maxProposalOptions: proposalCounts.length ? Math.max(...proposalCounts) : 0,
    minProposalOptions: proposalCounts.length ? Math.min(...proposalCounts) : 0,
  },
  constitution: {
    articles: articles.length,
    clauses,
    structuredSubjects: subjectIds.length,
    allArticlesAmendable: articleRows.every((row) => row.amendable),
    articleRows,
  },
};

const out = join(root, "docs/qa/phase11_4/policy-constitution-audit.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
