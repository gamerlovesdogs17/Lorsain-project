import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import type { KernelWorld } from "./types.js";
import {
  assemblyCaucus,
  evaluatePresidentialEligibility,
  partyMembers,
  provincialOrgId,
} from "./parties/index.js";

function expectOk(sim: Simulation, cmd: Parameters<Simulation["executeCommand"]>[0]) {
  const r = sim.executeCommand(cmd);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error?.code} ${r.error?.message}`);
  return r;
}

function presidentialNominees(world: KernelWorld, sim: Simulation, partyId: string): string[] {
  const state = sim.getSnapshot();
  const contest = Object.values(state.partyContests).find(
    (c) => c.partyId === partyId && c.type === "presidential_nomination",
  )!;
  const eligible = partyMembers(state, partyId).filter((id) => {
    if (id === state.playerPoliticianId) return false;
    return evaluatePresidentialEligibility(world, state, id, "2028-10-14").eligible;
  });
  const seeded = Object.keys(contest.entries).filter((id) => eligible.includes(id));
  const rest = eligible.filter((id) => !seeded.includes(id));
  const ordered = [...seeded, ...rest];
  if (ordered.length < 1) throw new Error(`no eligible presidential nominees for ${partyId}`);
  return ordered.slice(0, Math.min(2, ordered.length));
}

function forceResolveNomination(world: KernelWorld, sim: Simulation, partyId: string): void {
  const contest = Object.values(sim.getSnapshot().partyContests).find(
    (c) => c.partyId === partyId && c.type === "presidential_nomination",
  )!;
  const contestId = contest.id;
  const rule = world.nominationRules[world.partyDefinitions[partyId]!.nominationRuleId]!;
  const ids = presidentialNominees(world, sim, partyId);
  for (const id of ids) {
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: id });
  }
  if (rule.method === "weighted_ranked_choice" || rule.method === "transferable_convention") {
    for (const id of ids) {
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: id,
        evidence: { memberNominationRequirementSatisfied: true },
      });
    }
  }
  if (rule.method === "weighted_provincial_delegates") {
    for (const id of ids) {
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: id,
        evidence: { provincialSupportRequirementSatisfied: true },
      });
    }
  }
  if (rule.method === "closed_member_rcv") {
    const caucus = assemblyCaucus(world, sim.getSnapshot(), partyId);
    const needed = Math.ceil((rule.assemblyCaucusEndorsementFraction ?? 0.15) * caucus.length);
    const pool = caucus.filter((id) => !ids.includes(id));
    let i = 0;
    for (const targetId of ids) {
      for (let n = 0; n < needed; n++) {
        const endorserId = pool[i++];
        if (!endorserId) throw new Error(`NU caucus exhausted for ${partyId}`);
        expectOk(sim, {
          type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
          contestId,
          endorserId,
          targetId,
          endorserType: "politician",
        });
      }
    }
  }
  if (rule.method === "direct_member_rcv") {
    const targetId = ids[0]!;
    for (const provinceId of world.provinceIds.slice(0, 4)) {
      expectOk(sim, {
        type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: provincialOrgId(partyId, provinceId),
        targetId,
        endorserType: "provincial_organization",
      });
    }
  }
  expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
  expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
}

describe("Phase 11.4 save/restore electoralMethod", () => {
  it("round-trips assembly.electoralMethod after presidential resolve", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P4-FULL-2028" });
    for (const partyId of Object.keys(sim.getSnapshot().partyStates).sort()) {
      forceResolveNomination(world, sim, partyId);
    }
    expectOk(sim, {
      type: "FINALIZE_ELECTION_FIELD",
      electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
    });
    for (let i = 0; i < 14; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok).toBe(true);
      if (r.ok && r.interrupt) {
        if (r.interrupt.code === "PRESIDENTIAL_ELECTION_DUE") break;
        if (!r.interrupt.requiresResolution) {
          expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
          expectOk(sim, { type: "RESUME_TURN" });
        }
      }
    }
    expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    const live = sim.getSnapshot();
    const asm = Object.values(live.elections).find((e) => e.type === "assembly" && e.assembly);
    expect(asm?.assembly?.electoralMethod).toBeTruthy();
    const afterElectionHash = sim.hashState();
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(restored.hashState()).toBe(afterElectionHash);
    const restoredAsm = restored.getSnapshot().elections[asm!.id];
    expect(restoredAsm?.assembly?.electoralMethod).toBe(asm!.assembly!.electoralMethod);
  }, 180_000);
});
