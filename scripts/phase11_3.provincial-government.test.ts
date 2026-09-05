import { describe, expect, it } from "vitest";
import { createSimulation } from "../packages/sim/src/engine.js";
import { loadTerenaWorld } from "../packages/sim/src/integration/harness.js";
import {
  governorProposeProvincialBill,
  processProvincialAssembliesMonth,
} from "../packages/sim/src/provinces/assemblies.js";
import {
  chooseProvincialLegislativeVote,
  evaluateGovernorDisposition,
  provincialGovernmentRelation,
  provincialPolicy,
} from "../packages/sim/src/provinces/politics.js";
import type {
  ProvincialAssemblyState,
  ProvincialBill,
} from "../packages/sim/src/provinces/types.js";
import { createRngService } from "../packages/sim/src/rng.js";
import type { KernelWorld, SimState } from "../packages/sim/src/types.js";

type Scenario = {
  world: KernelWorld;
  state: SimState;
  governorId: string;
  governorPartyId: string;
  oppositionPartyId: string;
  assembly: ProvincialAssemblyState;
  bill: ProvincialBill;
};

function controlledScenario(governorSeatShare: number, oppositionBill: boolean): Scenario {
  const world = loadTerenaWorld();
  const governorTerm = world.startingTerms.find(
    (term) => world.offices[term.officeId]?.kind === "governor",
  )!;
  const provinceId = world.offices[governorTerm.officeId]!.provinceId!;
  const governorId = governorTerm.holderId;
  const state = createSimulation({
    world,
    playerPoliticianId: "NPC146",
    seed: `P113-PROVINCIAL-${governorSeatShare}-${oppositionBill}`,
  }).serializeSave().simulation;
  const governorPartyId = state.politicians[governorId]!.partyId!;
  const policy = provincialPolicy("local_administration");
  const governorLean = world.partyPublicIdeology[governorPartyId]?.[policy.axis] ?? 0;
  const oppositionPartyId = Object.keys(world.partyDefinitions)
    .filter(
      (partyId) => partyId !== governorPartyId && partyId !== world.independentAggregatePartyId,
    )
    .sort((a, b) => {
      const leanA = world.partyPublicIdeology[a]?.[policy.axis] ?? 0;
      const leanB = world.partyPublicIdeology[b]?.[policy.axis] ?? 0;
      return governorLean * leanA - governorLean * leanB || a.localeCompare(b);
    })[0]!;
  const assembly = state.provincialRuntime.assemblies[provinceId]!;
  const governorSeats = Math.max(
    1,
    Math.min(assembly.seatCount - 1, Math.round(assembly.seatCount * governorSeatShare)),
  );
  assembly.partySeats = {
    [governorPartyId]: governorSeats,
    [oppositionPartyId]: assembly.seatCount - governorSeats,
  };
  assembly.memberIds.forEach((memberId, index) => {
    state.provincialRuntime.legislators[memberId]!.partyId =
      index < governorSeats ? governorPartyId : oppositionPartyId;
  });
  state.partyStates[governorPartyId]!.cohesion = 0.92;
  state.partyStates[oppositionPartyId]!.cohesion = 0.92;

  const proposed = governorProposeProvincialBill(
    world,
    state,
    governorId,
    provinceId,
    "local_administration",
    "CMD-PROVINCIAL-CONTROL",
  );
  if ("error" in proposed) throw new Error(proposed.error.message);
  const bill = proposed.bill;
  const governorDirection: -1 | 1 = governorLean < -0.08 ? -1 : 1;
  bill.policyDirection = oppositionBill ? (governorDirection === 1 ? -1 : 1) : governorDirection;
  const oppositionSponsor = assembly.memberIds.find(
    (memberId) => state.provincialRuntime.legislators[memberId]?.partyId === oppositionPartyId,
  )!;
  bill.sponsorId = oppositionBill ? oppositionSponsor : governorId;
  bill.agendaSource = oppositionBill ? "legislative_agenda" : "governor_priority";
  bill.partyPositions = {
    [governorPartyId]: {
      partyId: governorPartyId,
      stance: oppositionBill ? "oppose" : "support",
      setById: null,
      strength: 0.88,
    },
    [oppositionPartyId]: {
      partyId: oppositionPartyId,
      stance: oppositionBill ? "support" : "oppose",
      setById: null,
      strength: 0.88,
    },
  };
  return {
    world,
    state,
    governorId,
    governorPartyId,
    oppositionPartyId,
    assembly,
    bill,
  };
}

function tally(scenario: Scenario, kind: "bill" | "veto_override") {
  const choices = scenario.assembly.memberIds.map((memberId) =>
    chooseProvincialLegislativeVote(scenario.world, scenario.state, scenario.bill, memberId, kind),
  );
  return {
    yes: choices.filter((choice) => choice === "yes").length,
    no: choices.filter((choice) => choice === "no").length,
    abstain: choices.filter((choice) => choice === "abstain").length,
  };
}

describe("Phase 11.3 controlled provincial government", () => {
  it("distinguishes friendly, divided, and hostile passage and disposition behavior", () => {
    const friendly = controlledScenario(0.6, false);
    const divided = controlledScenario(0.35, false);
    const hostile = controlledScenario(0.15, false);

    expect(
      provincialGovernmentRelation(friendly.world, friendly.state, friendly.bill.provinceId),
    ).toBe("friendly");
    expect(
      provincialGovernmentRelation(divided.world, divided.state, divided.bill.provinceId),
    ).toBe("divided");
    expect(
      provincialGovernmentRelation(hostile.world, hostile.state, hostile.bill.provinceId),
    ).toBe("hostile");

    const friendlyVote = tally(friendly, "bill");
    const dividedVote = tally(divided, "bill");
    const hostileVote = tally(hostile, "bill");
    expect(friendlyVote.yes).toBeGreaterThan(dividedVote.yes);
    expect(dividedVote.yes).toBeGreaterThan(hostileVote.yes);
    expect(friendlyVote.yes).toBeGreaterThan(friendly.assembly.seatCount / 2);
    expect(hostileVote.no).toBeGreaterThan(hostile.assembly.seatCount / 2);
    expect(
      evaluateGovernorDisposition(
        friendly.world,
        friendly.state,
        friendly.governorId,
        friendly.bill,
      ).decision,
    ).toBe("sign");

    const hostileOppositionBill = controlledScenario(0.15, true);
    expect(
      evaluateGovernorDisposition(
        hostileOppositionBill.world,
        hostileOppositionBill.state,
        hostileOppositionBill.governorId,
        hostileOppositionBill.bill,
      ).decision,
    ).toBe("veto");
    expect(tally(hostileOppositionBill, "bill").yes).toBeGreaterThan(
      hostileOppositionBill.assembly.seatCount / 2,
    );
  });

  it("allows a hostile supermajority to override while a friendly chamber sustains the veto", () => {
    for (const [share, expected] of [
      [0.15, "override_passed"],
      [0.6, "override_failed"],
    ] as const) {
      const scenario = controlledScenario(share, true);
      scenario.bill.status = "vetoed";
      scenario.bill.governorDispositionDate = "2027-12-01";
      scenario.state.currentDate = "2028-01-01";
      processProvincialAssembliesMonth(
        scenario.world,
        scenario.state,
        createRngService(`P113-OVERRIDE-${share}`),
        `CMD-OVERRIDE-${share}`,
      );
      expect(scenario.bill.status).toBe(expected);
      const vote = Object.values(scenario.state.provincialRuntime.votes).find(
        (candidate) =>
          candidate.subjectKind === "veto_override" && candidate.subjectId === scenario.bill.id,
      )!;
      expect(vote.passed).toBe(expected === "override_passed");
      expect(vote.yes + vote.no + vote.abstain).toBe(scenario.assembly.seatCount);
      expect(new Set(Object.values(vote.partyIdsAtVote ?? {}))).toEqual(
        new Set([scenario.governorPartyId, scenario.oppositionPartyId]),
      );
    }
  });
});
