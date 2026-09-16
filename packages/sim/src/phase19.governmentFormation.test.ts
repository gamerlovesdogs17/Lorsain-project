import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { PARTY_PLATFORM_ISSUES } from "./parties/types.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import {
  MAX_FORMATION_ATTEMPTS,
  processCoalitionMonth,
  activeCoalition,
} from "./politics/coalitions.js";
import {
  abandonGovernmentTalks,
  activeGovernmentFormation,
  assemblySeatMath,
  confirmGovernmentAgreement,
  ensureHungFormationSession,
  fragmentAssemblySeats,
  isHungAssembly,
  listPotentialPartners,
  openGovernmentTalks,
  proposeCoalitionTerms,
  respondToCoalitionCounter,
} from "./politics/governmentFormation.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
import type { SimState } from "./types.js";

function hungFixture(seed: string): { world: ReturnType<typeof loadTerenaWorld>; state: SimState } {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  const parties = Object.keys(state.partyStates)
    .filter((id) => state.partyStates[id]?.status !== "defunct")
    .sort();
  expect(parties.length).toBeGreaterThanOrEqual(3);

  const playerParty = state.politicians[state.playerPoliticianId]?.partyId ?? parties[0]!;
  state.politicians[state.playerPoliticianId]!.partyId = playerParty;
  state.partyStates[playerParty]!.leaderId = state.playerPoliticianId;
  const org = ensurePartyOrgRuntime(state);
  org.officers[playerParty] = {
    ...(org.officers[playerParty] ?? {}),
    chair: {
      role: "chair",
      politicianId: state.playerPoliticianId,
      partyId: playerParty,
      assumedDate: state.currentDate,
    },
  };

  fragmentAssemblySeats(world, state, parties.slice(0, 3));
  expect(isHungAssembly(world, state)).toBe(true);

  for (const partyId of parties.slice(0, 3)) {
    const platform = state.partyStates[partyId]?.publicPlatform;
    if (!platform) continue;
    for (const issue of PARTY_PLATFORM_ISSUES) platform.positions[issue] = 0.15;
  }

  return { world, state };
}

describe("Phase 19 FORM A GOVERNMENT", () => {
  it("majority Assembly does not open talks", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "gf-majority", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const parties = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort();
    const playerParty = state.politicians[state.playerPoliticianId]?.partyId ?? parties[0]!;
    // Give player party a clear majority.
    fragmentAssemblySeats(world, state, [playerParty, playerParty, parties[1]!]);
    const math = assemblySeatMath(world, state);
    expect(math.hung).toBe(false);
    expect((math.byParty[playerParty] ?? 0) >= math.majorityNeeded).toBe(true);

    const events = ensureHungFormationSession(world, state, "CMD_MAJ");
    expect(events.some((e) => e.type === "GOVERNMENT_FORMATION_OPENED")).toBe(false);
    expect(activeGovernmentFormation(state)).toBeNull();
  });

  it("near-majority one partner succeeds through investiture path", () => {
    const { world, state } = hungFixture("gf-near");
    state.provincialRuntime.constitutionalOrder.cabinetFormation = "assembly_confidence";
    ensureHungFormationSession(world, state, "CMD_OPEN");
    const lead = state.politicians[state.playerPoliticianId]!.partyId!;
    const math = assemblySeatMath(world, state);
    const partner = listPotentialPartners(world, state, lead).find((p) => p.reachesMajority);
    expect(partner).toBeTruthy();

    const opened = openGovernmentTalks(world, state, {
      actorId: state.playerPoliticianId,
      partnerPartyIds: [partner!.partyId],
      commandId: "CMD_TALKS",
    });
    expect(opened.ok).toBe(true);

    const seats = (math.byParty[lead] ?? 0) + (math.byParty[partner!.partyId] ?? 0);
    const terms = {
      policyPriorities: ["economy", "housing", "labor"] as const,
      redLines: [] as const,
      cabinetShares: {
        [lead]: (math.byParty[lead] ?? 0) / seats,
        [partner!.partyId]: (math.byParty[partner!.partyId] ?? 0) / seats,
      },
    };
    const proposed = proposeCoalitionTerms(world, state, {
      actorId: state.playerPoliticianId,
      terms: {
        policyPriorities: [...terms.policyPriorities],
        redLines: [],
        cabinetShares: terms.cabinetShares,
      },
      commandId: "CMD_PROP",
    });
    expect(proposed.ok).toBe(true);
    expect(activeGovernmentFormation(state)?.status).toBe("agreement_ready");
    expect(activeGovernmentFormation(state)?.lastPartnerResponse).toBe("accept");

    const confirmed = confirmGovernmentAgreement(world, state, {
      actorId: state.playerPoliticianId,
      commandId: "CMD_CONF",
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.ok && confirmed.events.some((e) => e.type === "COALITION_FORMED")).toBe(true);
    expect(
      confirmed.ok &&
        confirmed.events.some(
          (e) => e.type === "ASSEMBLY_CONFIDENCE_PASSED" || e.type === "ASSEMBLY_CONFIDENCE_FAILED",
        ),
    ).toBe(true);
    // Payload must not leak a raw negotiationScore into public formation events.
    if (confirmed.ok) {
      for (const e of confirmed.events) {
        expect(e.payload).not.toHaveProperty("negotiationScore");
        expect(JSON.stringify(e.payload)).not.toMatch(/Acceptance probability/i);
      }
    }
    if (activeGovernmentFormation(state)?.status === "formed") {
      expect(activeCoalition(state)?.partyIds).toContain(partner!.partyId);
    }
  });

  it("red-line priority triggers reject", () => {
    const { world, state } = hungFixture("gf-red");
    ensureHungFormationSession(world, state, "CMD_OPEN");
    const lead = state.politicians[state.playerPoliticianId]!.partyId!;
    const partner = listPotentialPartners(world, state, lead).find((p) => p.reachesMajority)!;

    // Partner hard-opposes environment; lead will try to elevate it.
    const platform = state.partyStates[partner.partyId]!.publicPlatform!;
    platform.positions.environment = -0.85;
    for (const issue of PARTY_PLATFORM_ISSUES) {
      if (issue !== "environment") platform.positions[issue] = 0.1;
    }
    const leadPlat = state.partyStates[lead]!.publicPlatform!;
    leadPlat.positions.environment = 0.8;

    openGovernmentTalks(world, state, {
      actorId: state.playerPoliticianId,
      partnerPartyIds: [partner.partyId],
      commandId: "CMD_TALKS",
    });
    const math = assemblySeatMath(world, state);
    const seats = (math.byParty[lead] ?? 0) + (math.byParty[partner.partyId] ?? 0);
    const out = proposeCoalitionTerms(world, state, {
      actorId: state.playerPoliticianId,
      terms: {
        policyPriorities: ["environment", "economy"],
        redLines: [],
        cabinetShares: {
          [lead]: (math.byParty[lead] ?? 0) / seats,
          [partner.partyId]: (math.byParty[partner.partyId] ?? 0) / seats,
        },
      },
      commandId: "CMD_RED",
    });
    expect(out.ok).toBe(true);
    const session = activeGovernmentFormation(state);
    expect(session?.lastPartnerResponse).toBe("reject");
    expect(session?.rejectReason).toBe("red_line");
    expect(session?.rejectNote).toBeTruthy();
    expect(JSON.stringify(out.ok ? out.events.map((e) => e.payload) : [])).not.toMatch(
      /\d+\.\d+%|negotiationScore/,
    );
  });

  it("thin Cabinet share draws a counteroffer with revised allocation", () => {
    const { world, state } = hungFixture("gf-cab");
    ensureHungFormationSession(world, state, "CMD_OPEN");
    const lead = state.politicians[state.playerPoliticianId]!.partyId!;
    const partner = listPotentialPartners(world, state, lead).find((p) => p.reachesMajority)!;
    openGovernmentTalks(world, state, {
      actorId: state.playerPoliticianId,
      partnerPartyIds: [partner.partyId],
      commandId: "CMD_TALKS",
    });
    const out = proposeCoalitionTerms(world, state, {
      actorId: state.playerPoliticianId,
      terms: {
        policyPriorities: ["economy", "housing"],
        redLines: [],
        cabinetShares: { [lead]: 0.92, [partner.partyId]: 0.08 },
      },
      commandId: "CMD_CAB",
    });
    expect(out.ok).toBe(true);
    const session = activeGovernmentFormation(state);
    expect(session?.status).toBe("counteroffer");
    expect(session?.lastPartnerResponse).toBe("counter");
    expect(session?.counteroffer?.cabinetShares[partner.partyId]).toBeGreaterThan(0.08);
    expect(session?.counterofferNote).toMatch(/Cabinet/i);

    const accepted = respondToCoalitionCounter(world, state, {
      actorId: state.playerPoliticianId,
      response: "accept",
      commandId: "CMD_ACC",
    });
    expect(accepted.ok).toBe(true);
    expect(activeGovernmentFormation(state)?.status).toBe("agreement_ready");
  });

  it("optional multiparty talks can reach agreement_ready", () => {
    const { world, state } = hungFixture("gf-multi");
    ensureHungFormationSession(world, state, "CMD_OPEN");
    const lead = state.politicians[state.playerPoliticianId]!.partyId!;
    const partners = listPotentialPartners(world, state, lead).slice(0, 2);
    expect(partners.length).toBe(2);
    openGovernmentTalks(world, state, {
      actorId: state.playerPoliticianId,
      partnerPartyIds: partners.map((p) => p.partyId),
      commandId: "CMD_TALKS",
    });
    const math = assemblySeatMath(world, state);
    const ids = [lead, ...partners.map((p) => p.partyId)];
    const seats = ids.reduce((s, id) => s + (math.byParty[id] ?? 0), 0) || 1;
    const shares: Record<string, number> = {};
    for (const id of ids) shares[id] = (math.byParty[id] ?? 0) / seats;
    const out = proposeCoalitionTerms(world, state, {
      actorId: state.playerPoliticianId,
      terms: {
        policyPriorities: ["economy", "labor", "housing"],
        redLines: [],
        cabinetShares: shares,
      },
      commandId: "CMD_MULTI",
    });
    expect(out.ok).toBe(true);
    expect(["agreement_ready", "counteroffer"]).toContain(activeGovernmentFormation(state)?.status);
  });

  it("repeated talk failures reach constitutional fallback", () => {
    const { world, state } = hungFixture("gf-fail");
    state.provincialRuntime.constitutionalOrder.cabinetFormation = "assembly_confidence";
    ensureHungFormationSession(world, state, "CMD_OPEN");
    for (let i = 0; i < MAX_FORMATION_ATTEMPTS; i += 1) {
      const abandoned = abandonGovernmentTalks(world, state, {
        actorId: state.playerPoliticianId,
        commandId: `CMD_ABANDON_${i}`,
      });
      expect(abandoned.ok).toBe(true);
    }
    const session = activeGovernmentFormation(state);
    expect(session?.status).toBe("fallback");
    expect(session?.attempt).toBeGreaterThanOrEqual(MAX_FORMATION_ATTEMPTS);
    expect(state.provincialRuntime.constitutionalOrder.cabinetNeedsConfidence).toBe(true);
    expect(state.history.some((e) => e.type === "GOVERNING_FORMATION_FALLBACK")).toBe(true);
  });

  it("NPC auto-coalition still runs when the player cannot steer", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "gf-npc", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const parties = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort();
    // Player holds no seats / is not leadership of a seated party.
    const playerParty = state.politicians[state.playerPoliticianId]?.partyId;
    if (playerParty) {
      state.partyStates[playerParty]!.leaderId = "NPC001";
      const org = ensurePartyOrgRuntime(state);
      if (org.officers[playerParty]?.chair) {
        org.officers[playerParty]!.chair!.politicianId = "NPC001";
      }
    }
    fragmentAssemblySeats(world, state, parties.slice(0, 3));
    for (const partyId of parties.slice(0, 3)) {
      const platform = state.partyStates[partyId]?.publicPlatform;
      if (!platform) continue;
      for (const issue of PARTY_PLATFORM_ISSUES) platform.positions[issue] = 0.2;
    }
    state.provincialRuntime.constitutionalOrder.cabinetFormation = "assembly_confidence";
    // Clear any human session.
    ensurePoliticsRuntime(state).governmentFormation = null;

    const events = processCoalitionMonth(world, state, "CMD_NPC");
    expect(
      events.some((e) => e.type === "COALITION_FORMED" || e.type === "COALITION_NEGOTIATING"),
    ).toBe(true);
  });
});
