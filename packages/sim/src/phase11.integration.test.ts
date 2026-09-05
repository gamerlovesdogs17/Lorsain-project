import { beforeEach, describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { currentPresidentialAuthorityId } from "./executive/state.js";
import { activeTermsForPolitician, occupyingTerms } from "./offices.js";
import { CANONICAL_ASSEMBLY_ELECTION_ID } from "./elections/types.js";
import { assemblyCandidateEligibilityError } from "./elections/assembly-cycle.js";
import { hashCanonical } from "./hash.js";
import { reconcileAssemblyVacancies } from "./legislature/vacancies.js";
import { nominationQualificationNeed } from "./campaigns/qualification.js";
import {
  advanceIntegrated,
  assertCatastrophicInvariants,
  expectOk,
  loadTerenaWorld,
  runDeterministicHorizon,
} from "./integration/harness.js";

async function advanceResponsive(
  sim: ReturnType<typeof createSimulation>,
  turns: number,
  stopOn?: string,
): Promise<string | null> {
  for (let index = 0; index < turns; index += 1) {
    const hit = advanceIntegrated(sim, 1, stopOn);
    if (hit) return hit;
    if (index % 3 === 2) await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
  }
  return null;
}

async function advanceToDateResponsive(
  sim: ReturnType<typeof createSimulation>,
  targetDate: string,
): Promise<void> {
  let turns = 0;
  while (sim.getSnapshot().currentDate < targetDate) {
    advanceIntegrated(sim, 1);
    turns += 1;
    if (turns > 120) throw new Error(`failed to reach ${targetDate}`);
    if (turns % 3 === 0) await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
  }
}

describe("Phase 11.1 full-game integration", () => {
  beforeEach(async () => {
    // Let the worker deliver the preceding long integration result before the
    // next synchronous multi-year simulation starts.
    await new Promise<void>((resolveYield) => setImmediate(resolveYield));
  });

  it("reaches 2029 presidential transition with matching continuous/reload hashes", () => {
    const world = loadTerenaWorld();
    const a = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-MP-2029" });
    const b = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-MP-2029" });

    advanceIntegrated(a, 18);
    expect(a.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    const president = currentPresidentialAuthorityId(world, a.getSnapshot());
    expect(president).toBeTruthy();
    expect(president).not.toBe("NPC001");

    advanceIntegrated(b, 10);
    const mid = b.serializeSave();
    const restored = restoreSimulation(mid, world);
    expect(restored.hashState()).toBe(b.hashState());
    advanceIntegrated(b, 8);
    advanceIntegrated(restored, 8);
    expect(restored.hashState()).toBe(b.hashState());
    expect(a.hashState()).toBe(b.hashState());
    expect(assertCatastrophicInvariants(world, a.getSnapshot())).toEqual([]);
  }, 240_000);

  it("resolves the 2030 Assembly election and reseats 420 members", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-ASM-2030" });
    // 2028-01 → 2030-05 is 28 months; resolve presidential along the way.
    const hit = advanceIntegrated(sim, 40, "ASSEMBLY_ELECTION_DUE");
    expect(hit).toBe("ASSEMBLY_ELECTION_DUE");
    expect(sim.getSnapshot().currentDate).toBe("2030-05-12");
    expectOk(sim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    expectOk(sim, { type: "RESUME_TURN" });
    const election = sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID];
    expect(election?.status).toBe("resolved");
    expect(election?.winnerIds.length).toBe(420);
    expect(election?.candidates.NPC146).toBeUndefined();
    expect(sim.getSnapshot().currentDate).toBe("2030-06-01");
    expect(currentAssemblyMemberIds(world, sim.getSnapshot())).toHaveLength(420);
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());

    // Continue beyond the June 1 assumption.
    advanceIntegrated(sim, 2);
    expect(sim.getSnapshot().currentDate >= "2030-06-01").toBe(true);
    expect(currentAssemblyMemberIds(world, sim.getSnapshot())).toHaveLength(420);
    expect(currentAssemblyMemberIds(world, sim.getSnapshot())).not.toContain("NPC146");
    expect(sim.getSnapshot().playerPoliticianId).toBe("NPC146");
    expect(occupyingTerms(sim.getSnapshot(), "OFFICE_SPEAKER").length).toBeGreaterThan(0);
    expect(assertCatastrophicInvariants(world, sim.getSnapshot())).toEqual([]);

    const mutable = sim.serializeSave().simulation;
    const vacated = Object.values(mutable.officeTerms).find(
      (term) =>
        term.status === "active" &&
        world.offices[term.officeId]?.kind === "assembly_member" &&
        term.holderId !== mutable.playerPoliticianId,
    )!;
    vacated.status = "ended";
    vacated.endedDate = mutable.currentDate;
    vacated.endedReason = "assumed_governorship";
    expect(currentAssemblyMemberIds(world, mutable)).toHaveLength(419);
    const vacancyEvents = reconcileAssemblyVacancies(mutable, world, null);
    expect(currentAssemblyMemberIds(world, mutable)).toHaveLength(420);
    expect(currentAssemblyMemberIds(world, mutable)).not.toContain(vacated.holderId);
    expect(
      vacancyEvents.filter((event) => event.type === "ASSEMBLY_CASUAL_VACANCY_FILLED"),
    ).toHaveLength(1);
    const restoredCountback = restoreSimulation(
      { ...sim.serializeSave(), simulation: mutable },
      world,
    );
    expect(
      restoredCountback
        .getSnapshot()
        .history.some((event) => event.type === "ASSEMBLY_CASUAL_VACANCY_FILLED"),
    ).toBe(true);

    const save = sim.serializeSave();
    expect(restoreSimulation(save, world).hashState()).toBe(sim.hashState());
  }, 360_000);

  it("supports Adrian's explicit reelection campaign with deterministic checkpoint reloads", async () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-ADRIAN-RUN" });
    for (let i = 0; i < 30; i += 1) {
      if (
        sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID]?.assembly?.filingStatus ===
        "open"
      ) {
        break;
      }
      advanceIntegrated(sim, 1);
      if (i % 3 === 2) await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
    }
    const filingState = sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID]!;
    expect(filingState.assembly?.filingStatus).toBe("open");
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());
    expectOk(sim, {
      type: "FILE_ASSEMBLY_CANDIDACY",
      electionId: filingState.id,
      constituencyId: "C007",
    });
    let campaign = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (candidate) => candidate.politicianId === "NPC146" && candidate.type === "assembly",
    );
    expect(campaign?.constituencyId).toBe("C007");
    expectOk(sim, {
      type: "CAMPAIGN_ORGANIZE",
      campaignId: campaign!.id,
      constituencyId: "C007",
    });
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());
    await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));

    const due = await advanceResponsive(sim, 12, "ASSEMBLY_ELECTION_DUE");
    expect(due).toBe("ASSEMBLY_ELECTION_DUE");
    expect(
      sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID]?.assembly?.constituencyFields.C007
        ?.candidateIds,
    ).toContain("NPC146");
    const reloaded = restoreSimulation(sim.serializeSave(), world);
    expectOk(sim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    expectOk(reloaded, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
    expect(sim.hashState()).toBe(reloaded.hashState());
    campaign = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (candidate) => candidate.politicianId === "NPC146" && candidate.type === "assembly",
    );
    expect(["won", "lost"]).toContain(campaign?.status);
    expect(campaign?.endedDate).toBe("2030-05-12");
    expectOk(sim, { type: "RESUME_TURN" });
    expectOk(reloaded, { type: "RESUME_TURN" });
    advanceIntegrated(sim, 2);
    advanceIntegrated(reloaded, 2);
    expect(sim.hashState()).toBe(reloaded.hashState());
    const won = sim
      .getSnapshot()
      .elections[CANONICAL_ASSEMBLY_ELECTION_ID]!.winnerIds.includes("NPC146");
    expect(currentAssemblyMemberIds(world, sim.getSnapshot()).includes("NPC146")).toBe(won);
    expect(sim.getSnapshot().playerPoliticianId).toBe("NPC146");
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());
  }, 480_000);

  it("lets an eligible non-incumbent file, campaign, and reach the June transition", async () => {
    const world = loadTerenaWorld();
    const probe = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-NONMEMBER" });
    const nonMember = Object.keys(probe.getSnapshot().politicians)
      .sort()
      .find(
        (id) =>
          activeTermsForPolitician(probe.getSnapshot(), id).every(
            (term) => world.offices[term.officeId]?.kind !== "assembly_member",
          ) && !assemblyCandidateEligibilityError(probe.getSnapshot(), world, id, "C001"),
      );
    expect(nonMember).toBeTruthy();
    if (!nonMember) return;
    const sim = createSimulation({ world, playerPoliticianId: nonMember, seed: "P11-NONMEMBER" });
    await advanceToDateResponsive(sim, "2029-11-01");
    if (
      sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID]?.assembly?.filingStatus ===
      "planned"
    ) {
      advanceIntegrated(sim, 1);
    }
    const election = sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID]!;
    expect(election.assembly?.filingStatus).toBe("open");
    expectOk(sim, {
      type: "FILE_ASSEMBLY_CANDIDACY",
      electionId: election.id,
      constituencyId: "C001",
    });
    const campaign = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (candidate) => candidate.politicianId === nonMember && candidate.type === "assembly",
    );
    expect(campaign?.constituencyId).toBe("C001");
    expectOk(sim, {
      type: "CAMPAIGN_ORGANIZE",
      campaignId: campaign!.id,
      constituencyId: "C001",
    });
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());
    const due = await advanceResponsive(sim, 12, "ASSEMBLY_ELECTION_DUE");
    expect(due).toBe("ASSEMBLY_ELECTION_DUE");
    expectOk(sim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    const won = sim
      .getSnapshot()
      .elections[CANONICAL_ASSEMBLY_ELECTION_ID]!.winnerIds.includes(nonMember);
    expectOk(sim, { type: "RESUME_TURN" });
    await advanceToDateResponsive(sim, "2030-06-01");
    advanceIntegrated(sim, 1);
    expect(currentAssemblyMemberIds(world, sim.getSnapshot()).includes(nonMember)).toBe(won);
    expect(sim.getSnapshot().playerPoliticianId).toBe(nonMember);
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());
  }, 480_000);

  it("keeps Mara Velic playable after leaving the presidency", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "P11-MARA" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("NPC001");
    advanceIntegrated(sim, 18);
    expect(sim.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).not.toBe("NPC001");
    const appoint = sim.executeCommand({
      type: "ISSUE_REGULATION",
      ministryOfficeId: "OFFICE_MIN_FINANCE",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.1, fiscalImpact: null }],
    });
    expect(appoint.ok).toBe(false);
    // Former president can still advance time.
    expectOk(sim, { type: "ADVANCE_TURN" });
    expect(sim.getSnapshot().playerPoliticianId).toBe("NPC001");
    expect(assertCatastrophicInvariants(world, sim.getSnapshot())).toEqual([]);
  }, 240_000);

  it("matches deterministic multi-year hashes with checkpoint reloads (MP)", async () => {
    const out = await runDeterministicHorizon({
      playerPoliticianId: "NPC146",
      seed: "P11-DET-MP",
      months: 36,
      checkpoints: ["2028-07-01", "2028-10-14", "2029-01-20", "2030-07-01"],
    });
    expect(out.finalHash).toBe(out.reloadHash);
    expect(out.invariantFailures).toEqual([]);
    expect(out.dates.at(-1)! >= "2030-12-01").toBe(true);
  }, 480_000);

  it("records ordinary and assembly election resolve timings", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-PERF" });
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      advanceIntegrated(sim, 1);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    // Soft ceiling — document regressions without flaking on slow CI hosts.
    expect(median).toBeLessThan(5_000);
    console.log(
      JSON.stringify({
        phase11Perf: {
          ordinaryMedianMs: Math.round(median),
          ordinaryMaxMs: Math.round(samples[samples.length - 1]!),
        },
      }),
    );

    const asm = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-PERF-ASM" });
    const hit = advanceIntegrated(asm, 40, "ASSEMBLY_ELECTION_DUE");
    expect(hit).toBe("ASSEMBLY_ELECTION_DUE");
    const t0 = performance.now();
    expectOk(asm, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    const resolveMs = performance.now() - t0;
    const assumptionStart = performance.now();
    expectOk(asm, { type: "RESUME_TURN" });
    const juneAssumptionMs = performance.now() - assumptionStart;
    expect(resolveMs).toBeLessThan(30_000);
    console.log(
      JSON.stringify({
        phase11Perf: {
          assemblyResolveMs: Math.round(resolveMs),
          juneAssumptionMs: Math.round(juneAssumptionMs),
        },
      }),
    );
  }, 360_000);

  it("naturally completes the 2033 presidential cycle and January 2034 transition", async () => {
    const world = loadTerenaWorld();
    const continuous = createSimulation({
      world,
      playerPoliticianId: "NPC146",
      seed: "P11-PRES-2033",
    });
    await advanceResponsive(continuous, 18);
    const historical2028 = hashCanonical(continuous.getSnapshot().elections.ELEC_PRES_2028);
    const historicalNominations = hashCanonical(
      Object.values(continuous.getSnapshot().partyContests).filter(
        (contest) => contest.metadata.electionId === "ELEC_PRES_2028",
      ),
    );
    // Mid-term presidential vacancies can schedule special elections (e.g. 2030).
    // Auto-resolve those on the way to the regular 2033 cycle instead of stopping early.
    await advanceToDateResponsive(continuous, "2033-10-01");
    const hit = await advanceResponsive(continuous, 12, "PRESIDENTIAL_ELECTION_DUE");
    expect(hit).toBe("PRESIDENTIAL_ELECTION_DUE");
    expect(continuous.getSnapshot().currentDate).toBe("2033-10-08");
    // PendingInterrupt no longer embeds payload; resolve election via scheduled event.
    const dueInterrupt = continuous.getSnapshot().pendingInterrupt;
    expect(dueInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    const dueScheduled = continuous
      .getSnapshot()
      .scheduler.events.find((event) => event.id === dueInterrupt?.scheduledEventId);
    expect(dueScheduled?.payload?.electionId).toBe("ELEC_PRES_2033");
    const election = continuous.getSnapshot().elections.ELEC_PRES_2033!;
    expect(election.fieldFinalized).toBe(true);
    expect(Object.keys(election.candidates).length).toBeGreaterThanOrEqual(2);
    const cycleContests = Object.values(continuous.getSnapshot().partyContests).filter(
      (contest) => contest.metadata.electionId === election.id,
    );
    expect(cycleContests).toHaveLength(6);
    expect(
      cycleContests.every((contest) => contest.metadata.candidateSource === "runtime_politics"),
    ).toBe(true);
    expect(cycleContests.every((contest) => !contest.entries.NPC146)).toBe(true);

    const restored = restoreSimulation(continuous.serializeSave(), world);
    const beforeResolve = performance.now();
    expectOk(continuous, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    const presidentialResolveMs = performance.now() - beforeResolve;
    expectOk(restored, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
    expect(continuous.hashState()).toBe(restored.hashState());
    const winner = continuous.getSnapshot().elections.ELEC_PRES_2033!.winnerIds[0]!;
    expect(winner).toBeTruthy();
    expectOk(continuous, { type: "RESUME_TURN" });
    expectOk(restored, { type: "RESUME_TURN" });
    advanceIntegrated(continuous, 5);
    advanceIntegrated(restored, 5);
    expect(continuous.hashState()).toBe(restored.hashState());
    expect(continuous.getSnapshot().currentDate >= "2034-01-20").toBe(true);
    expect(currentPresidentialAuthorityId(world, continuous.getSnapshot())).toBe(winner);
    expect(hashCanonical(continuous.getSnapshot().elections.ELEC_PRES_2028)).toBe(historical2028);
    expect(
      hashCanonical(
        Object.values(continuous.getSnapshot().partyContests).filter(
          (contest) => contest.metadata.electionId === "ELEC_PRES_2028",
        ),
      ),
    ).toBe(historicalNominations);
    expect(
      Object.values(continuous.getSnapshot().elections).some(
        (next) =>
          next.type === "presidential" && next.status === "planned" && next.date > "2033-10-08",
      ),
    ).toBe(true);
    expect(
      assertCatastrophicInvariants(world, continuous.getSnapshot()).filter(
        (failure) => failure.code !== "ASM_SEAT_COUNT",
      ),
    ).toEqual([]);
    console.log(
      JSON.stringify({
        phase11Perf: { presidential2033ResolveMs: Math.round(presidentialResolveMs) },
      }),
    );
  }, 600_000);

  it("lets the player enter the naturally opened 2033 nomination and preserves every campaign stage", async () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC003", seed: "P11-ANA-2033" });
    await advanceToDateResponsive(sim, "2029-02-01");
    const election = sim.getSnapshot().elections.ELEC_PRES_2033!;
    expect(election).toBeTruthy();
    let contest = Object.values(sim.getSnapshot().partyContests).find(
      (candidate) =>
        candidate.type === "presidential_nomination" &&
        candidate.partyId === sim.getSnapshot().politicians.NPC003?.partyId &&
        candidate.metadata.electionId === election.id,
    );
    expect(contest?.status).toBe("planned");
    const premature = sim.executeCommand({
      type: "DECLARE_CAMPAIGN",
      politicianId: "NPC003",
      campaignType: "presidential_nomination",
      contestId: contest!.id,
    });
    expect(premature.ok).toBe(false);
    if (!premature.ok) expect(premature.error.code).toBe("CONTEST_NOT_OPEN");
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());

    await advanceToDateResponsive(sim, "2033-01-01");
    contest = sim.getSnapshot().partyContests[contest!.id];
    if (contest?.status === "planned") {
      advanceIntegrated(sim, 1);
      contest = sim.getSnapshot().partyContests[contest.id];
    }
    expect(contest?.status).toBe("open");
    expectOk(sim, {
      type: "DECLARE_CAMPAIGN",
      politicianId: "NPC003",
      campaignType: "presidential_nomination",
      contestId: contest!.id,
    });
    let campaign = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (candidate) =>
        candidate.politicianId === "NPC003" && candidate.type === "presidential_nomination",
    );
    expect(campaign?.status).toBe("active");
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());

    while (sim.getSnapshot().currentDate < "2033-08-01") {
      campaign = sim.getSnapshot().campaignRuntime.campaigns[campaign!.id];
      if (campaign?.status === "active") {
        const need = nominationQualificationNeed(world, sim.getSnapshot(), campaign);
        expectOk(
          sim,
          need
            ? { type: "CAMPAIGN_SEEK_NOMINATION_SUPPORT", campaignId: campaign.id }
            : { type: "CAMPAIGN_FUNDRAISE", campaignId: campaign.id },
        );
      }
      advanceIntegrated(sim, 1);
      expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());
      await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
    }
    advanceIntegrated(sim, 1);
    contest = sim.getSnapshot().partyContests[contest!.id];
    expect(contest?.status).toBe("resolved");
    campaign = sim.getSnapshot().campaignRuntime.campaigns[campaign!.id];
    expect(["won", "lost"]).toContain(campaign?.status);
    const nominated = contest?.winnerId === "NPC003";
    const general = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (candidate) =>
        candidate.politicianId === "NPC003" &&
        candidate.type === "presidential_general" &&
        candidate.electionId === election.id,
    );
    expect(Boolean(general)).toBe(nominated);
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(sim.hashState());

    const due = await advanceResponsive(sim, 6, "PRESIDENTIAL_ELECTION_DUE");
    expect(due).toBe("PRESIDENTIAL_ELECTION_DUE");
    const restored = restoreSimulation(sim.serializeSave(), world);
    expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    expectOk(restored, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    expect(sim.hashState()).toBe(restored.hashState());
    const won = sim.getSnapshot().elections[election.id]!.winnerIds[0] === "NPC003";
    expectOk(sim, { type: "RESUME_TURN" });
    expectOk(restored, { type: "RESUME_TURN" });
    await advanceToDateResponsive(sim, "2034-01-20");
    await advanceToDateResponsive(restored, "2034-01-20");
    expect(sim.hashState()).toBe(restored.hashState());
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot()) === "NPC003").toBe(won);
    expect(sim.getSnapshot().playerPoliticianId).toBe("NPC003");
    console.log(JSON.stringify({ phase11Player2033: { nominated, won } }));
  }, 900_000);
});
