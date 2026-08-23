import { describe, expect, it } from "vitest";
import { createSimulation, type Simulation } from "./engine.js";
import type { Command, KernelWorld } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { collectPlayerActionableDecisions } from "./player-decisions.js";

function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

function playerCommitteeIssue(world: KernelWorld, sim: Simulation, playerId: string) {
  const host = Object.values(sim.getSnapshot().legislatureRuntime.committees).find((c) =>
    c.memberIds.includes(playerId),
  );
  if (!host) throw new Error("player is not on a committee");
  const issueId =
    Object.entries(world.issueDimensions).find(([, dim]) => dim === host.dimension)?.[0] ??
    "ISS_TAX";
  return { host, issueId };
}

describe("player actionable decisions", () => {
  it("exposes every pending eligible vote when the player has eight of them", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P71-VOTES" });
    const { issueId } = playerCommitteeIssue(world, sim, "MP02");
    for (let i = 1; i <= 8; i++) {
      expectOk(sim, {
        type: "INTRODUCE_BILL",
        title: `Player decision bill ${i}`,
        policyItems: [{ issueId, direction: 1, magnitude: 0.4, fiscalImpact: null }],
      });
    }
    const decisions = collectPlayerActionableDecisions(world, sim.getSnapshot()).filter(
      (d) => d.kind !== "interrupt",
    );
    expect(decisions).toHaveLength(8);
    expect(new Set(decisions.map((d) => d.key)).size).toBe(8);
    expect(decisions.every((d) => d.kind === "committee_vote")).toBe(true);
  });

  it("keeps remaining votes visible after the player casts some of them", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P71-PARTIAL" });
    const { issueId } = playerCommitteeIssue(world, sim, "MP02");
    for (let i = 1; i <= 8; i++) {
      expectOk(sim, {
        type: "INTRODUCE_BILL",
        title: `Partial vote bill ${i}`,
        policyItems: [{ issueId, direction: 1, magnitude: 0.3, fiscalImpact: null }],
      });
    }
    const first = collectPlayerActionableDecisions(world, sim.getSnapshot()).filter(
      (d) => d.kind === "committee_vote",
    );
    expect(first).toHaveLength(8);
    for (const d of first.slice(0, 3)) {
      expectOk(sim, {
        type: "CAST_LEGISLATIVE_VOTE",
        billId: d.billId!,
        stage: "committee",
        choice: "yes",
      });
    }
    const remaining = collectPlayerActionableDecisions(world, sim.getSnapshot()).filter(
      (d) => d.kind === "committee_vote",
    );
    expect(remaining).toHaveLength(5);
  });
});
