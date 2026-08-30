import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "../packages/sim/src/engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";
import { processPartyInstitutionsMonth } from "../packages/sim/src/parties/monthly.js";
import { promoteProvincialCandidate } from "../packages/sim/src/provinces/assemblies.js";
import { createRngService } from "../packages/sim/src/rng.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(repoRoot, "docs/qa/phase11_3/judicial-appointment-browser-save.json");
const leadershipOutputPath = resolve(repoRoot, "docs/qa/phase11_3/leadership-election-browser-save.json");
const formerOfficeholderOutputPath = resolve(repoRoot, "docs/qa/phase11_3/former-officeholder-browser-save.json");
const electionResultsOutputPath = resolve(repoRoot, "docs/qa/phase11_3/election-results-browser-save.json");
const world = loadTerenaWorld();
const presidentId = world.startingTerms.find(
  (term) => world.offices[term.officeId]?.kind === "president" && term.startDate <= world.scenarioStartDate,
)?.holderId;

if (!presidentId) throw new Error("The scenario does not have a starting President.");

const simulation = createSimulation({
  world,
  playerPoliticianId: presidentId,
  seed: "PHASE-11-3-JUDICIAL-BROWSER-QA",
});
const vacate = simulation.executeCommand({
  type: "DEV_VACATE_OFFICE",
  officeId: "OFFICE_COURT_SEAT_8",
  reason: "Phase 11.3 browser QA fixture",
});
if (!vacate.ok) throw new Error(`${vacate.error.code}: ${vacate.error.message}`);

const advance = simulation.executeCommand({ type: "ADVANCE_TURN" });
if (!advance.ok) throw new Error(`${advance.error.code}: ${advance.error.message}`);
if (advance.interrupt?.requiresResolution) {
  throw new Error(`Unexpected blocking interrupt: ${advance.interrupt.code}`);
}
if (advance.interrupt) {
  const acknowledge = simulation.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" });
  if (!acknowledge.ok) throw new Error(`${acknowledge.error.code}: ${acknowledge.error.message}`);
  const resume = simulation.executeCommand({ type: "RESUME_TURN" });
  if (!resume.ok) throw new Error(`${resume.error.code}: ${resume.error.message}`);
}

const awaiting = Object.values(simulation.getSnapshot().constitutionalRuntime.nominations).some(
  (nomination) => nomination.status === "awaiting_nomination",
);
if (!awaiting) throw new Error("The judicial vacancy did not open an awaiting nomination.");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(simulation.serializeSave(), null, 2)}\n`, "utf8");

const leadershipSimulation = createSimulation({
  world,
  playerPoliticianId: presidentId,
  seed: "PHASE-11-3-LEADERSHIP-BROWSER-QA",
});
advanceIntegrated(leadershipSimulation, 12);
const leadershipSave = leadershipSimulation.serializeSave();
const playerPartyId = leadershipSave.simulation.politicians[presidentId]?.partyId;
if (!playerPartyId) throw new Error("The starting President does not have a party.");
leadershipSave.simulation.partyStates[playerPartyId]!.cohesion = 0.42;
const leadershipCommandId = `CMD${String(leadershipSave.simulation.counters.nextCommandId++).padStart(6, "0")}`;
processPartyInstitutionsMonth(
  world,
  leadershipSave.simulation,
  createRngService("PHASE-11-3-LEADERSHIP-BROWSER-QA"),
  leadershipCommandId,
);
const leadershipContest = Object.values(leadershipSave.simulation.partyContests).some(
  (contest) => contest.partyId === playerPartyId && contest.type === "party_leadership" && contest.status === "open",
);
if (!leadershipContest) throw new Error("The leadership election did not open.");
const provincialMemberIds = new Set(
  Object.values(leadershipSave.simulation.provincialRuntime.assemblies).flatMap((assembly) => assembly.memberIds),
);
const provincialLegislator = Object.values(leadershipSave.simulation.provincialRuntime.legislators)
  .filter((row) => provincialMemberIds.has(row.id) && row.active && row.serviceEndDate == null && row.fullPoliticianId == null)
  .sort((a, b) => a.id.localeCompare(b.id))[0];
if (!provincialLegislator) throw new Error("No Provincial Assembly member was available for browser QA promotion.");
const provincialPlayerId = promoteProvincialCandidate(
  world,
  leadershipSave.simulation,
  provincialLegislator.id,
  "browser_qa_role_matrix",
);
if (!provincialPlayerId) throw new Error("The Provincial Assembly browser-QA politician could not be promoted.");
writeFileSync(leadershipOutputPath, `${JSON.stringify(leadershipSave, null, 2)}\n`, "utf8");

const formerOfficeholderSimulation = createSimulation({
  world,
  playerPoliticianId: presidentId,
  seed: "PHASE-11-3-FORMER-OFFICEHOLDER-BROWSER-QA",
});
advanceIntegrated(formerOfficeholderSimulation, 13);
const formerOfficeholderSave = formerOfficeholderSimulation.serializeSave();
const stillInOffice = Object.values(formerOfficeholderSave.simulation.officeTerms).some(
  (term) => term.holderId === presidentId && term.status === "active",
);
if (stillInOffice) throw new Error("The former-officeholder browser fixture did not complete the presidential transition.");
writeFileSync(formerOfficeholderOutputPath, `${JSON.stringify(formerOfficeholderSave, null, 2)}\n`, "utf8");

advanceIntegrated(formerOfficeholderSimulation, 17);
const electionResultsSave = formerOfficeholderSimulation.serializeSave();
const federalAssemblyResolved = Object.values(electionResultsSave.simulation.elections).some(
  (election) => election.type === "assembly" && election.status === "resolved",
);
const governorResolved = Object.values(electionResultsSave.simulation.provincialRuntime.elections).some(
  (election) => election.status === "resolved" || election.status === "assumed",
);
const provincialAssemblyResolved = Object.values(electionResultsSave.simulation.provincialRuntime.assemblyElections).some(
  (election) => election.status === "resolved",
);
if (!federalAssemblyResolved || !governorResolved || !provincialAssemblyResolved) {
  throw new Error(`The election-results browser fixture did not certify every required election family (${electionResultsSave.simulation.currentDate}; federal=${federalAssemblyResolved}; governor=${governorResolved}; provincial=${provincialAssemblyResolved}).`);
}
writeFileSync(electionResultsOutputPath, `${JSON.stringify(electionResultsSave, null, 2)}\n`, "utf8");

console.log(outputPath);
console.log(leadershipOutputPath);
console.log(`${formerOfficeholderOutputPath} (${provincialPlayerId} is the Provincial Assembly QA player)`);
console.log(electionResultsOutputPath);
