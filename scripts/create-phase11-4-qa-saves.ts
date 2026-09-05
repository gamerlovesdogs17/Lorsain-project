/**
 * Phase 11.4 browser QA fixture builder.
 *
 * Produces two deterministic save files:
 *
 *   docs/qa/phase11_4/fixtures/active-campaign-browser-save.json
 *     Player is an NPC who has an active presidential-nomination campaign with
 *     cash, action points, and map-layer organisation data.
 *
 *   docs/qa/phase11_4/fixtures/election-night-partial-browser-save.json
 *     Advance until ASSEMBLY_ELECTION_DUE, resolve it, then resume so the turn
 *     completes with currentDate == electionDate.  monthsSinceElection == 0 so
 *     electionsScreen.isFreshElectionNight returns true (not historical replay).
 *
 * Run via:
 *   pnpm --filter @lorsain/content-loader exec tsx ../../scripts/create-phase11-4-qa-saves.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "../packages/sim/src/engine.js";
import {
  advanceIntegrated,
  expectOk,
  loadTerenaWorld,
} from "../packages/sim/src/integration/harness.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// ─── shared world ─────────────────────────────────────────────────────────────
const world = loadTerenaWorld();

const presidentId = world.startingTerms.find(
  (term) =>
    world.offices[term.officeId]?.kind === "president" && term.startDate <= world.scenarioStartDate,
)?.holderId;
if (!presidentId) throw new Error("No starting president found in world.");

// ─── Fixture 1: Active Campaign ───────────────────────────────────────────────
//
// Strategy: boot the sim from the president (who is term-limited and will never
// start their own campaign), advance 3 months so NPC campaigns have had time to
// fundraise and build provincial organisation (map layers), then surgically
// patch playerPoliticianId to the NPC that owns the richest active campaign.
// That NPC already exists in the politicians record so parseSaveFile accepts it.

const activeCampaignOutputPath = resolve(
  repoRoot,
  "docs/qa/phase11_4/fixtures/active-campaign-browser-save.json",
);

console.log("Building active-campaign fixture …");

const campaignSim = createSimulation({
  world,
  playerPoliticianId: presidentId,
  seed: "PHASE-11-4-ACTIVE-CAMPAIGN-BROWSER-QA",
});

advanceIntegrated(campaignSim, 3);

const rawCampaignSave = campaignSim.serializeSave();

// Pick the active/exploring campaign with the most cash (most content to show).
const bestCampaign = Object.values(rawCampaignSave.simulation.campaignRuntime.campaigns)
  .filter((c) => c.status === "active" || c.status === "exploring")
  .sort((a, b) => {
    // prefer assembly or presidential_nomination campaigns (longest-running at this point)
    const typeScore = (t: string) =>
      t === "presidential_nomination" ? 2 : t === "assembly" ? 1 : 0;
    if (typeScore(b.type) !== typeScore(a.type)) return typeScore(b.type) - typeScore(a.type);
    return b.cashOnHand - a.cashOnHand;
  })[0];

if (!bestCampaign) {
  throw new Error(
    `No active campaign found after 3 months (date=${rawCampaignSave.simulation.currentDate}).`,
  );
}

// Ensure the politician exists in the save before patching.
if (!rawCampaignSave.simulation.politicians[bestCampaign.politicianId]) {
  throw new Error(`Politician ${bestCampaign.politicianId} not found in save politicians map.`);
}

rawCampaignSave.simulation.playerPoliticianId = bestCampaign.politicianId;

// Verify the patch: the new player must have at least one active/exploring campaign.
const playerActiveCampaigns = Object.values(
  rawCampaignSave.simulation.campaignRuntime.campaigns,
).filter(
  (c) =>
    c.politicianId === rawCampaignSave.simulation.playerPoliticianId &&
    (c.status === "active" || c.status === "exploring"),
);
if (!playerActiveCampaigns.length) {
  throw new Error(
    `Verification failed: no active campaign for patched player ${rawCampaignSave.simulation.playerPoliticianId}.`,
  );
}

mkdirSync(dirname(activeCampaignOutputPath), { recursive: true });
writeFileSync(activeCampaignOutputPath, `${JSON.stringify(rawCampaignSave, null, 2)}\n`, "utf8");

console.log(`  player           : ${rawCampaignSave.simulation.playerPoliticianId}`);
console.log(
  `  campaign         : ${bestCampaign.id} (${bestCampaign.type}) status=${bestCampaign.status}`,
);
console.log(`  cashOnHand       : $${bestCampaign.cashOnHand.toLocaleString()}`);
console.log(
  `  actionPoints     : ${bestCampaign.actionPointsRemaining}/${bestCampaign.actionPointsMax}`,
);
console.log(`  currentDate      : ${rawCampaignSave.simulation.currentDate}`);
console.log(`  → ${activeCampaignOutputPath}`);

// ─── Fixture 2: Election Night (fresh assembly) ───────────────────────────────
//
// Strategy: advance until ASSEMBLY_ELECTION_DUE (the first federal assembly
// election, typically 2030-05), resolve it via RESOLVE_ASSEMBLY_ELECTION, then
// RESUME_TURN so the turn completes.  currentDate equals the election's date
// field → monthsSinceElection == 0 → electionsScreen.isFreshElectionNight
// returns true (not historical replay mode).

const electionNightOutputPath = resolve(
  repoRoot,
  "docs/qa/phase11_4/fixtures/election-night-partial-browser-save.json",
);

console.log("\nBuilding election-night-partial fixture …");

const electionSim = createSimulation({
  world,
  playerPoliticianId: presidentId,
  seed: "PHASE-11-4-ELECTION-NIGHT-BROWSER-QA",
});

const interruptCode = advanceIntegrated(electionSim, 40, "ASSEMBLY_ELECTION_DUE");
if (interruptCode !== "ASSEMBLY_ELECTION_DUE") {
  throw new Error(
    `Expected ASSEMBLY_ELECTION_DUE interrupt within 40 turns, got ${interruptCode ?? "none"}.`,
  );
}

expectOk(electionSim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
expectOk(electionSim, { type: "RESUME_TURN" });

const electionSave = electionSim.serializeSave();
const currentDate = electionSave.simulation.currentDate;

// isFreshElectionNight logic mirrored from electionsScreen.tsx:
const monthsSince = (electionDate: string): number =>
  (Number(currentDate.slice(0, 4)) - Number(electionDate.slice(0, 4))) * 12 +
  Number(currentDate.slice(5, 7)) -
  Number(electionDate.slice(5, 7));

const isFresh = (date: string) => monthsSince(date) >= 0 && monthsSince(date) <= 1;

// Check federal elections (simulation.elections).
const federalElections = Object.values(
  ((electionSave.simulation as unknown as Record<string, unknown>).elections as Record<
    string,
    { id: string; date: string; status: string; type?: string }
  >) ?? {},
);

const freshFederal = federalElections.find((e) => e.status === "resolved" && isFresh(e.date));

if (!freshFederal) {
  const summary = federalElections
    .filter((e) => e.status === "resolved")
    .map((e) => `${e.id}@${e.date}(${monthsSince(e.date)}mo)`)
    .join(", ");
  throw new Error(
    `No fresh (≤1 month) resolved federal election at currentDate=${currentDate}. ` +
      `Resolved: [${summary}]`,
  );
}

writeFileSync(electionNightOutputPath, `${JSON.stringify(electionSave, null, 2)}\n`, "utf8");

console.log(`  currentDate      : ${currentDate}`);
console.log(
  `  freshElection    : ${freshFederal.id} type=${freshFederal.type ?? "?"} date=${freshFederal.date}`,
);
console.log(`  monthsSince      : ${monthsSince(freshFederal.date)} (≤1 → isFreshElectionNight)`);
console.log(`  → ${electionNightOutputPath}`);

console.log("\nDone. Load via qaFixture query params:");
console.log(
  "  active-campaign       → ?qaFixture=active-campaign&qaScreen=campaign&qaPlayer=" +
    rawCampaignSave.simulation.playerPoliticianId,
);
console.log(
  "  election-night-partial → ?qaFixture=election-night-partial&qaScreen=elections&qaPlayer=" +
    electionSave.simulation.playerPoliticianId,
);
