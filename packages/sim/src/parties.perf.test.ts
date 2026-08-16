import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { kernelOffice, syntheticWorld } from "./synthetic-world.js";
import { syntheticAgentProfile } from "./agents/profile.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaPartyFields } from "./terena-party-input.js";
import { assemblyCaucus, factionMembers, partyMembers } from "./parties/index.js";
import type { KernelWorld } from "./types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function addPolitician(
  world: KernelWorld,
  id: string,
  partyId: string | null,
  factionId: string | null,
  extra?: Parameters<typeof syntheticAgentProfile>[1],
): void {
  world.politicians.push({ id, alive: true, retired: false, partyId, factionId });
  world.agentProfiles[id] = syntheticAgentProfile(id, {
    traits: {
      ambition: 0.6,
      partyLoyalty: 0.6,
      factionLoyalty: 0.7,
    },
    presidentialStatus: "possible",
    ...extra,
  });
}

function leadershipWorld(seed: string): KernelWorld {
  const world = syntheticWorld(seed);
  world.partyDefinitions = {
    PARTY_LAB: {
      partyId: "PARTY_LAB",
      name: "Labour",
      short: "LAB",
      organizationType: "membership_party",
      nominationRuleId: "labour_member_union_rcv",
      factionIds: ["FAC_A", "FAC_B"],
      canonicalFactionShares: { FAC_A: 0.7, FAC_B: 0.3 },
    },
  };
  world.factionDefinitions = {
    FAC_A: { factionId: "FAC_A", partyId: "PARTY_LAB", name: "A", share: 0.7 },
    FAC_B: { factionId: "FAC_B", partyId: "PARTY_LAB", name: "B", share: 0.3 },
  };
  world.nominationRules = {
    labour_member_union_rcv: {
      ruleId: "labour_member_union_rcv",
      partyId: "PARTY_LAB",
      method: "weighted_ranked_choice",
      memberWeight: 0.8,
      affiliateUnionDelegateWeight: 0.2,
      assemblyCaucusEndorsementFraction: null,
      provincialOrganizationEndorsementsMin: null,
      memberNominationsRequired: false,
      memberNominationThresholdRequired: false,
      provincialNominationSupportRequired: false,
      supporterRegistrationRequired: false,
    },
  };
  world.startingPartyLeaders = { PARTY_LAB: "PF" };
  world.startingFactionChairs = { FAC_A: "PD", FAC_B: "PE" };
  addPolitician(world, "PA", "PARTY_LAB", "FAC_A", { presidentialStatus: "frontrunner" });
  addPolitician(world, "PB", "PARTY_LAB", "FAC_B", { presidentialStatus: "possible" });
  addPolitician(world, "PC", "PARTY_LAB", "FAC_A", { presidentialStatus: "possible" });
  addPolitician(world, "PD", "PARTY_LAB", "FAC_A", { presidentialStatus: "exploring" });
  addPolitician(world, "PE", "PARTY_LAB", "FAC_B", { presidentialStatus: "exploring" });
  addPolitician(world, "PF", "PARTY_LAB", "FAC_B", { presidentialStatus: "exploring" });
  addPolitician(world, "PG", "PARTY_LAB", "FAC_A");
  addPolitician(world, "PH", "PARTY_LAB", "FAC_A");
  world.politicianHomeProvince = {
    PA: "P01",
    PB: "P02",
    PC: "P01",
    PD: "P01",
    PE: "P02",
    PF: "P02",
    PG: "P02",
    PH: "P01",
  };
  for (const id of ["PA", "PB", "PC", "PD", "PE"]) {
    const officeId = `OFFICE_ASM_${id}`;
    world.offices[officeId] = kernelOffice({ id: officeId, kind: "assembly_member" });
    world.startingTerms.push({
      officeId,
      holderId: id,
      startDate: "2000-01-01",
      startKnown: true,
      endDate: null,
      accessionReason: "test",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    });
  }
  return world;
}

function runLeadership(
  seed: string,
  args: {
    endorseB?: boolean;
    caucus?: boolean;
    relateToB?: boolean;
  } = {},
): string | null {
  const sim = createSimulation({
    world: leadershipWorld(seed),
    playerPoliticianId: "P1",
    seed,
  });
  const created = sim.executeCommand({
    type: "DEV_CREATE_PARTY_CONTEST",
    contestType: "party_leadership",
    partyId: "PARTY_LAB",
    selectorMethod: args.caucus ? "caucus_rcv" : "member_rcv",
  });
  if (!created.ok) throw new Error(created.error.message);
  const contestId = Object.values(sim.getSnapshot().partyContests).find(
    (c) => c.type === "party_leadership",
  )!.id;
  for (const id of ["PA", "PB", "PC"]) {
    const r = sim.executeCommand({
      type: "DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: id,
    });
    if (!r.ok) throw new Error(r.error.message);
  }
  if (args.endorseB) {
    for (const endorser of ["PD", "PE", "PF"]) {
      const r = sim.executeCommand({
        type: "ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: endorser,
        targetId: "PB",
      });
      if (!r.ok) throw new Error(r.error.message);
    }
  }
  if (args.relateToB) {
    for (const source of ["PA", "PC", "PD", "PG", "PH"]) {
      const r = sim.executeCommand({
        type: "DEV_RECORD_INTERACTION",
        sourceId: source,
        targetId: "PB",
        delta: { trust: 0.85, affinity: 0.8, respect: 0.7 },
      });
      if (!r.ok) throw new Error(r.error.message);
    }
  }
  if (!sim.executeCommand({ type: "DEV_OPEN_PARTY_CONTEST", contestId }).ok) {
    throw new Error("open failed");
  }
  if (!sim.executeCommand({ type: "DEV_RESOLVE_PARTY_CONTEST", contestId }).ok) {
    throw new Error("resolve failed");
  }
  return sim.getSnapshot().partyContests[contestId]?.winnerId ?? null;
}

describe("Phase 3 performance", () => {
  it("derives 530-politician party queries without an O(N^2) init", () => {
    const bundle = loadContentBundleFromRepo(repoRoot);
    const world = buildTerenaKernelWorld({
      contentVersion: bundle.manifest.content_version,
      scenario: jsonClone(bundle.content.scenario),
      figures: bundle.content.starting_figures.figures,
      issues: bundle.content.terena_issues.issues.map((i: { id: string }) => ({ id: i.id })),
      offices: bundle.content.terena_offices.offices,
      constitution: jsonClone(bundle.content.terena_constitution),
      administrations: bundle.content.terena_presidential_administrations.administrations,
      ...terenaPartyFields({
        parties: bundle.content.terena_parties.parties,
        nominationRules: bundle.content.terena_nomination_rules.rules,
        provinceFeatures: bundle.content.terena_provinces.features,
        constituencyFeatures: bundle.content.terena_constituencies.features,
      }),
      presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    } satisfies TerenaKernelInput);
    const t0 = Date.now();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    for (const partyId of Object.keys(snap.partyStates)) {
      partyMembers(snap, partyId);
      assemblyCaucus(world, snap, partyId);
    }
    for (const factionId of Object.keys(snap.factionStates)) {
      factionMembers(snap, factionId);
    }
    const elapsed = Date.now() - t0;
    expect(Object.keys(snap.politicians).length).toBe(530);
    expect(elapsed).toBeLessThan(15_000);
  });

  it("runs 1,000 leadership contests with non-degenerate faction and endorsement politics", () => {
    const tallies = { PA: 0, PB: 0, PC: 0, other: 0 };
    const endorsedB = { PA: 0, PB: 0, PC: 0, other: 0 };
    const t0 = Date.now();
    for (let i = 0; i < 1000; i++) {
      const winner = runLeadership(`LEAD-${i}`);
      if (winner === "PA" || winner === "PB" || winner === "PC") tallies[winner] += 1;
      else tallies.other += 1;
      const boosted = runLeadership(`LEAD-${i}`, { endorseB: true });
      if (boosted === "PA" || boosted === "PB" || boosted === "PC") endorsedB[boosted] += 1;
      else endorsedB.other += 1;
    }
    const elapsed = Date.now() - t0;
    const baselineLargest = tallies.PA + tallies.PC;
    const distinctBaseline = [tallies.PA, tallies.PB, tallies.PC].filter((n) => n > 0).length;
    const sameA = runLeadership("LEAD-DET");
    const sameB = runLeadership("LEAD-DET");
    let relChanged = 0;
    for (let i = 0; i < 80; i++) {
      const base = runLeadership(`LEAD-REL-${i}`, { caucus: true });
      const related = runLeadership(`LEAD-REL-${i}`, { caucus: true, relateToB: true });
      if (base !== related) relChanged += 1;
    }
    console.info(
      JSON.stringify({
        leadershipContestsMs: elapsed,
        baseline: tallies,
        endorsedB,
        distinctBaseline,
        relationshipCaucusChanges: relChanged,
        deterministic: { sameA, sameB },
      }),
    );
    expect(baselineLargest).toBeGreaterThan(tallies.PB);
    expect(tallies.PB).toBeGreaterThan(0);
    expect(baselineLargest).toBeLessThan(1000);
    expect(distinctBaseline).toBeGreaterThan(1);
    expect(endorsedB.PB).toBeGreaterThan(tallies.PB);
    expect(endorsedB.PB).toBeLessThan(1000);
    expect(sameA).toBe(sameB);
    expect(relChanged).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(120_000);
  }, 120_000);
});
