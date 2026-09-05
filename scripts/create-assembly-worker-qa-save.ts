import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "../packages/sim/src/engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(repoRoot, "docs/qa/phase11_3/assembly-worker-production-save.json");
const world = loadTerenaWorld();
const playerPoliticianId = "NPC146";
const simulation = createSimulation({
  world,
  playerPoliticianId,
  seed: "PHASE-11-3-ASSEMBLY-WORKER-PRODUCTION-QA",
});

const interruptCode = advanceIntegrated(simulation, 40, "ASSEMBLY_ELECTION_DUE");
if (interruptCode !== "ASSEMBLY_ELECTION_DUE") {
  throw new Error(`Expected the Assembly election interrupt, received ${interruptCode ?? "none"}.`);
}

const snapshot = simulation.getSnapshot();
if (snapshot.currentDate !== "2030-05-12") {
  throw new Error(`Expected Assembly election day, received ${snapshot.currentDate}.`);
}
if (snapshot.pendingInterrupt?.code !== "ASSEMBLY_ELECTION_DUE") {
  throw new Error("The saved simulation is not awaiting the Assembly count.");
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(simulation.serializeSave(), null, 2)}\n`, "utf8");
console.log(outputPath);
