/**
 * Purpose-built Labour presidential nomination QA fixture with published
 * candidate-specific primary polls (national + provincial).
 *
 * Output:
 *   docs/qa/institutional/fixtures/labour-primary-poll-browser-save.json
 *   docs/qa/institutional/fixtures/labour-primary-poll-meta.json
 *
 * Run:
 *   pnpm exec tsx scripts/create-labour-primary-poll-qa-save.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "../packages/sim/src/engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";
import { padId } from "../packages/sim/src/scheduler.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outSave = resolve(
  repoRoot,
  "docs/qa/institutional/fixtures/labour-primary-poll-browser-save.json",
);
const outMeta = resolve(repoRoot, "docs/qa/institutional/fixtures/labour-primary-poll-meta.json");

const world = loadTerenaWorld();
const presidentId = world.startingTerms.find(
  (term) =>
    world.offices[term.officeId]?.kind === "president" && term.startDate <= world.scenarioStartDate,
)?.holderId;
if (!presidentId) throw new Error("No starting president found.");

const sim = createSimulation({
  world,
  playerPoliticianId: presidentId,
  seed: "INSTITUTIONAL-LABOUR-PRIMARY-POLL-QA",
});

let found: {
  contestId: string;
  campaigns: Array<{ id: string; politicianId: string }>;
} | null = null;

for (let month = 0; month < 24; month++) {
  advanceIntegrated(sim, 1);
  const state = sim.getSnapshot();
  const contest = Object.values(state.partyContests).find(
    (c) =>
      c.partyId === "PARTY_LAB" &&
      c.type === "presidential_nomination" &&
      (c.status === "open" || c.status === "qualification" || c.status === "voting"),
  );
  if (!contest) continue;
  const campaigns = Object.values(state.campaignRuntime.campaigns)
    .filter(
      (c) =>
        c.type === "presidential_nomination" &&
        c.contestId === contest.id &&
        (c.status === "active" || c.status === "exploring") &&
        state.politicians[c.politicianId]?.partyId === "PARTY_LAB",
    )
    .sort((a, b) => b.cashOnHand - a.cashOnHand);
  if (campaigns.length >= 2) {
    found = {
      contestId: contest.id,
      campaigns: campaigns.slice(0, 3).map((c) => ({ id: c.id, politicianId: c.politicianId })),
    };
    break;
  }
}

if (!found) {
  throw new Error("Could not find open Labour presidential nomination with ≥2 candidates.");
}

const save = sim.serializeSave();
const date = save.simulation.currentDate as string;
const candidates = found.campaigns.map((c) => c.politicianId);
const partyId = "PARTY_LAB";

/** Shares sum to 1.0 — published primary sample. */
const shares = candidates.length >= 3 ? ([0.52, 0.36, 0.12] as const) : ([0.59, 0.41] as const);

const snapshot = candidates.map((politicianId) => ({ politicianId, partyId }));
const firstPreference = candidates.map((politicianId, i) => ({
  politicianId,
  partyId,
  share: shares[i]!,
}));

const existingPollNums = Object.keys(save.simulation.polls ?? {})
  .map((id) => {
    const m = /^POLL(\d+)$/.exec(id);
    return m ? Number(m[1]) : 0;
  })
  .filter((n) => Number.isFinite(n));
let next = Math.max(0, ...(existingPollNums.length ? existingPollNums : [0])) + 1;

function allocPollId(): string {
  const id = padId("POLL", next++);
  return id;
}

const provinceId = world.provinceIds[0];
if (!provinceId) throw new Error("No province ids in world.");

const provincePollId = allocPollId();
const nationalPollId = allocPollId(); // higher id → preferred when dates equal

const metadata = {
  contestId: found.contestId,
  purpose: "nomination",
  qaFixture: "labour-primary-poll",
};

const provinceShares =
  candidates.length >= 3
    ? [
        { politicianId: candidates[0]!, partyId, share: 0.55 },
        { politicianId: candidates[1]!, partyId, share: 0.33 },
        { politicianId: candidates[2]!, partyId, share: 0.12 },
      ]
    : [
        { politicianId: candidates[0]!, partyId, share: 0.62 },
        { politicianId: candidates[1]!, partyId, share: 0.38 },
      ];

save.simulation.polls = {
  ...(save.simulation.polls ?? {}),
  [provincePollId]: {
    id: provincePollId,
    pollsterId: "POLL_NAT_OMNI",
    electionId: null,
    geographyKind: "province",
    provinceId,
    constituencyId: null,
    fieldStart: date,
    fieldEnd: date,
    publicationDate: date,
    sampleSize: 800,
    method: "mixed_mode_likely_voter",
    candidateSnapshot: snapshot,
    firstPreference: provinceShares,
    marginOfError: 0.04,
    houseEffectApplied: { PARTY_LAB: 0 },
    metadata,
  },
  [nationalPollId]: {
    id: nationalPollId,
    pollsterId: "POLL_NAT_OMNI",
    electionId: null,
    geographyKind: "national",
    provinceId: null,
    constituencyId: null,
    fieldStart: date,
    fieldEnd: date,
    publicationDate: date,
    sampleSize: 1200,
    method: "mixed_mode_likely_voter",
    candidateSnapshot: snapshot,
    firstPreference,
    marginOfError: 0.035,
    houseEffectApplied: { PARTY_LAB: 0 },
    metadata,
  },
};

save.simulation.counters = {
  ...save.simulation.counters,
  nextPollId: Math.max(save.simulation.counters.nextPollId ?? 1, next),
};

const playerId = candidates[0]!;
save.simulation.playerPoliticianId = playerId;

mkdirSync(dirname(outSave), { recursive: true });
writeFileSync(outSave, `${JSON.stringify(save, null, 2)}\n`, "utf8");

const meta = {
  fixture: "labour-primary-poll",
  contestId: found.contestId,
  contestType: "presidential_nomination",
  partyId,
  playerPoliticianId: playerId,
  candidatePoliticianIds: candidates,
  nationalPollId,
  provincePollId,
  provinceId,
  nationalShares: firstPreference.map((row) => ({
    politicianId: row.politicianId,
    share: row.share,
    percentLabel: `${(row.share * 100).toFixed(1)}%`,
  })),
  provinceShares: provinceShares.map((row) => ({
    politicianId: row.politicianId,
    share: row.share,
    percentLabel: `${(row.share * 100).toFixed(1)}%`,
  })),
  currentDate: date,
  expectedUi: {
    primaryPolling: true,
    publishedSample: true,
    absentCopy: ["No race poll yet", "You are not running an active campaign"],
  },
};

writeFileSync(outMeta, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

console.log("Labour primary poll fixture written.");
console.log(`  contest     : ${found.contestId}`);
console.log(`  candidates  : ${candidates.join(", ")}`);
console.log(`  player      : ${playerId}`);
console.log(`  national    : ${nationalPollId}`);
console.log(`  province    : ${provincePollId} @ ${provinceId}`);
console.log(`  date        : ${date}`);
console.log(`  → ${outSave}`);
console.log(`  Load: ?qaFixture=labour-primary-poll&qaScreen=campaign&qaPlayer=${playerId}`);
