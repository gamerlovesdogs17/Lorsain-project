/**
 * Phase 17A Government browser QA fixture.
 *
 *   docs/qa/phase17a/fixtures/government-browser-save.json
 *
 * Run:
 *   node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/create-phase17a-government-qa-save.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation, restoreSimulation } from "../packages/sim/src/engine.js";
import { deriveCabinet } from "../packages/sim/src/executive/state.js";
import {
  setAgendaItemBill,
  syncAgendaBillReferences,
} from "../packages/sim/src/governing/agenda.js";
import { updateMinisterialPerformance } from "../packages/sim/src/governing/performance.js";
import { ensureGoverningRuntime } from "../packages/sim/src/governing/state.js";
import { currentPresidentialAuthorityId } from "../packages/sim/src/legislature/state.js";
import { jsonClone } from "../packages/sim/src/hash.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";
import type { EnactedLawRecord } from "../packages/sim/src/legislature/types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const outputPath = resolve(repoRoot, "docs/qa/phase17a/fixtures/government-browser-save.json");

const world = loadTerenaWorld();
console.log("Building phase17a-government fixture …");

const bootPresidentId =
  world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
  "NPC146";

const sim = createSimulation({
  world,
  playerPoliticianId: bootPresidentId,
  seed: "PHASE-17A-GOVERNMENT-BROWSER-QA",
});

advanceIntegrated(sim, 14);

const presidentId = currentPresidentialAuthorityId(world, sim.getSnapshot()) ?? bootPresidentId;
console.log("President / QA player:", presidentId);

const save = sim.serializeSave();
const state = save.simulation;
const runtime = ensureGoverningRuntime(state);

runtime.fiscal.lastUpdated = state.currentDate;
runtime.fiscal.fiscalYear = Number(state.currentDate.slice(0, 4));

const lawPolicyTemplate =
  state.legislatureRuntime.bills.BILL000002?.policyItems ??
  state.legislatureRuntime.bills.BILL000001?.policyItems ??
  [];
const lawId = "LAW_P17A_QA_DELAY";
const enacted: EnactedLawRecord = {
  id: lawId,
  billId: "BILL_P17A_QA",
  title: "National Housing Delivery Act (QA)",
  policyItems: jsonClone(lawPolicyTemplate),
  amendmentIds: [],
  floorVoteId: null,
  repassageVoteId: null,
  presidentialDisposition: "signed",
  enactedDate: state.currentDate,
  sponsorId: presidentId,
  eventIds: [],
  operative: true,
  invalidatedByDecisionId: null,
  metadata: {},
};
state.legislatureRuntime.enactedLaws[lawId] = enacted;

runtime.implementations[lawId] = {
  lawId,
  status: "delayed",
  posture: "standard",
  progress: 0.22,
  departmentId: "interior",
  ministryOfficeId: "OFFICE_MINISTER_INTERIOR",
  enactedDate: state.currentDate,
  legalEffectiveDate: state.currentDate,
  implementationStartDate: state.currentDate,
  expectedCompletionDate: null,
  lagKind: "medium",
  monthsRequired: 18,
  monthsElapsed: 8,
  major: true,
  blockedReason: "capacity",
  metadata: {},
};

function maxAllocatedBillNum(bills: Record<string, unknown>): number {
  let max = 0;
  for (const id of Object.keys(bills)) {
    const match = /^BILL0*(\d+)$/.exec(id);
    if (!match) continue;
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

const billTemplate = state.legislatureRuntime.bills.BILL000002;
if (!billTemplate) throw new Error("BILL000002 missing from QA save");
const nextBillNum = maxAllocatedBillNum(state.legislatureRuntime.bills) + 1;
const linkedAgendaBillId = `BILL${String(nextBillNum).padStart(6, "0")}`;
state.legislatureRuntime.bills[linkedAgendaBillId] = {
  ...jsonClone(billTemplate),
  id: linkedAgendaBillId,
  title: "Housing Bill B",
  summary: "Coalition housing reform (QA)",
  status: "committee",
  sponsorId: presidentId,
  introducedDate: state.currentDate,
  stageReadyDate: state.currentDate,
  committeeVoteId: null,
  floorVoteId: null,
  repassageVoteId: null,
  presidentialDisposition: "none",
  enactedDate: null,
  enactedLawId: null,
  amendmentIds: [],
};
state.counters.nextBillId = nextBillNum + 1;

runtime.agenda = {
  updatedDate: state.currentDate,
  items: [
    {
      id: "AGENDA_H_QA",
      title: "Coalition: housing delivery",
      issueId: "ISS_HOUSING",
      priority: 0.85,
      source: "coalition",
      departmentId: "interior",
      status: "active",
      billId: null,
      billStatus: null,
    },
  ],
};
setAgendaItemBill(state, "AGENDA_H_QA", linkedAgendaBillId);
syncAgendaBillReferences(state, runtime.agenda.items);

updateMinisterialPerformance(world, state);
state.playerPoliticianId = presidentId;

const restored = restoreSimulation(save, world);
const cab = deriveCabinet(world, restored.getSnapshot()).filter((m) => m.holderId);
const ministryChoices: Record<string, "full_request"> = {};
for (const seat of cab) ministryChoices[seat.officeId] = "full_request";

const budgetResult = restored.executeCommand({
  type: "PROPOSE_BUDGET",
  fiscalStance: "consolidation",
  ministryChoices,
});
if (!budgetResult.ok) {
  throw new Error(
    `PROPOSE_BUDGET failed: ${budgetResult.error.code}: ${budgetResult.error.message}`,
  );
}

const finalSave = restored.serializeSave();
finalSave.simulation.playerPoliticianId = presidentId;
finalSave.simulation.legislatureRuntime.bills[linkedAgendaBillId] =
  state.legislatureRuntime.bills[linkedAgendaBillId]!;
setAgendaItemBill(finalSave.simulation, "AGENDA_H_QA", linkedAgendaBillId);
syncAgendaBillReferences(
  finalSave.simulation,
  ensureGoverningRuntime(finalSave.simulation).agenda.items,
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(finalSave, null, 2)}\n`, "utf8");
console.log("Wrote", outputPath);
