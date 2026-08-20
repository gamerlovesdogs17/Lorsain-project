import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countIrv, countStv, serializeCountResult } from "@lorsain/election-math";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { hashCanonical, jsonClone } from "./hash.js";
import { parseSaveFile } from "./save.js";
import { createRngService } from "./rng.js";
import { regularElectionDate } from "./calendar.js";
import { activeTermsForPolitician, occupyingTerms } from "./offices.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle } from "./terena-party-input.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld, type SaveFile } from "./types.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import { aggregateSupport, blocSupportShares, publicCandidateFacts } from "./elections/support.js";
import { resolveAssemblyConstituency } from "./elections/assembly.js";
import { replayElectionCount } from "./elections/replay.js";
import {
  firstPreferenceTotals,
  generateConstituencyBallots,
  integerBallotWeightSum,
} from "./elections/ballots.js";
import { constituencyTurnout } from "./elections/turnout.js";
import { miniElectorateWorld } from "./mini-electorate-world.js";
import { FIELD } from "./campaigns/policy.js";
import {
  assemblyCaucus,
  evaluatePresidentialEligibility,
  partyMembers,
  provincialOrgId,
} from "./parties/index.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function loadTerenaWorld(): KernelWorld {
  const bundle = loadContentBundleFromRepo(repoRoot);
  const electoral = terenaElectoralFromBundle(bundle);
  const input = {
    contentVersion: bundle.manifest.content_version,
    scenario: jsonClone(bundle.content.scenario),
    figures: bundle.content.starting_figures.figures,
    issues: bundle.content.terena_issues.issues.map((i: { id: string; dimension: string }) => ({
      id: i.id,
      dimension: i.dimension,
    })),
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
    voterBlocs: electoral.voterBlocs,
    pollsters: electoral.pollsters,
    constituencyGeo: electoral.constituencyGeo,
    turnout2026: electoral.turnout2026,
    ...terenaWorldFieldsFromBundle(bundle),
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

function stripToV3(save: SaveFile): Record<string, unknown> {
  const raw = jsonClone(save) as unknown as Record<string, unknown>;
  raw.schemaVersion = 3;
  const sim = raw.simulation as Record<string, unknown>;
  sim.schemaVersion = 3;
  delete sim.elections;
  delete sim.candidateStanding;
  delete sim.electoralEnvironment;
  delete sim.polls;
  delete sim.domainResolutions;
  delete sim.campaignRuntime;
  delete sim.legislatureRuntime;
  const counters = sim.counters as Record<string, unknown>;
  delete counters.nextPollId;
  delete counters.nextElectionId;
  delete counters.nextDomainResolutionId;
  delete counters.nextCampaignId;
  delete counters.nextDebateId;
  delete counters.nextBillId;
  delete counters.nextAmendmentId;
  delete counters.nextLegislativeVoteId;
  delete counters.nextLawId;
  return raw;
}

describe("Phase 4 kernel electorate ingest", () => {
  it("loads 48 constituencies, unique blocs, 12 pollsters, and issue dimensions", () => {
    const world = loadTerenaWorld();
    expect(Object.keys(world.constituencyElectorate).length).toBe(48);
    const blocIds = Object.keys(world.voterBlocs);
    expect(new Set(blocIds).size).toBe(blocIds.length);
    expect(blocIds.length).toBeGreaterThan(100);
    expect(Object.keys(world.pollsters).length).toBe(12);
    expect(world.issueDimensions.ISS_LABOR).toBe("economic");
    expect(Object.keys(world.issueDimensions).length).toBe(15);
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    expect(snap.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]?.fieldFinalized).toBe(false);
    expect(snap.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]?.winnerIds).toEqual([]);
    expect(Object.keys(snap.elections).length).toBe(2);
    expect(Object.keys(snap.polls).length).toBe(0);
    const planned = Object.values(snap.partyContests).filter(
      (c) => c.type === "presidential_nomination" && c.status === "planned",
    );
    expect(planned.length).toBe(6);
  });
});

describe("Phase 4 hidden-truth boundary", () => {
  it("does not change underlying support when hidden skills/traits change", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const bloc = world.voterBlocs.C001_B01!;
    const before = blocSupportShares(world, sim.getSnapshot(), bloc, ["P1", "P2"]);
    const mutated = jsonClone(world);
    mutated.agentProfiles.P1 = {
      ...mutated.agentProfiles.P1!,
      skills: { ...mutated.agentProfiles.P1!.skills, campaigning: 0.99, media: 0.99 },
      traits: { ...mutated.agentProfiles.P1!.traits, integrity: 0.01, ambition: 0.99 },
    };
    const sim2 = createSimulation({ world: mutated, playerPoliticianId: "P1" });
    const after = blocSupportShares(mutated, sim2.getSnapshot(), bloc, ["P1", "P2"]);
    expect(after.P1).toBeCloseTo(before.P1!, 12);
    expect(after.P2).toBeCloseTo(before.P2!, 12);
  });
});

describe("Phase 5 candidate-specific field organization", () => {
  it("raises only the organizing candidate's realized share and conserves ballots", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const snap = sim.getSnapshot();
    const valid = world.constituencyElectorate.C001!.turnout2026.validVoteValue;
    const baseline = generateConstituencyBallots(
      world,
      snap,
      "C001",
      ["P1", "P2"],
      valid,
      undefined,
      null,
      { P1: 1, P2: 1 },
    );
    const boosted = generateConstituencyBallots(
      world,
      snap,
      "C001",
      ["P1", "P2"],
      valid,
      undefined,
      null,
      { P1: 1 + FIELD.turnoutScale, P2: 1 },
    );
    expect(Number(integerBallotWeightSum(baseline))).toBe(valid);
    expect(Number(integerBallotWeightSum(boosted))).toBe(valid);
    const baseFirst = firstPreferenceTotals(baseline);
    const boostFirst = firstPreferenceTotals(boosted);
    expect(boostFirst.P1 ?? 0).toBeGreaterThan(baseFirst.P1 ?? 0);
    expect((boostFirst.P1 ?? 0) + (boostFirst.P2 ?? 0)).toBe(valid);
  });
});

describe("Phase 4 support monotonicity", () => {
  it("raises first-preference share when public favorability or party environment improves", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const bloc = world.voterBlocs.C001_B01!;
    const base = blocSupportShares(world, sim.getSnapshot(), bloc, ["P1", "P2"]);
    expect(
      sim.executeCommand({
        type: "DEV_SET_CANDIDATE_STANDING",
        politicianId: "P1",
        favorability: 0.85,
      }).ok,
    ).toBe(true);
    const better = blocSupportShares(world, sim.getSnapshot(), bloc, ["P1", "P2"]);
    expect(better.P1!).toBeGreaterThanOrEqual(base.P1! - 1e-12);
    expect(
      sim.executeCommand({
        type: "DEV_SET_ELECTORAL_ENVIRONMENT",
        nationalPartyShift: { PARTY_LAB: 0.25 },
      }).ok,
    ).toBe(true);
    const env = blocSupportShares(world, sim.getSnapshot(), bloc, ["P1", "P2"]);
    expect(env.P1!).toBeGreaterThan(better.P1!);
  });
});

describe("Phase 4 polling", () => {
  it("is deterministic, house-effect centered after renormalize, and lower variance at larger N", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "POLL-CAL" });
    const a = sim.executeCommand({
      type: "DEV_CREATE_POLL",
      pollsterId: "POLL_TEST",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      sampleSize: 800,
    });
    expect(a.ok).toBe(true);
    const pollId = Object.keys(sim.getSnapshot().polls)[0]!;
    const hash = sim.hashState();
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(hash);
    expect(sim.getSnapshot().polls[pollId]?.id).toBe("POLL000001");
    const shares = sim
      .getSnapshot()
      .polls[pollId]!.firstPreference.reduce((s, r) => s + r.share, 0);
    expect(shares).toBeCloseTo(1, 8);

    const samplesSmall: number[] = [];
    const samplesLarge: number[] = [];
    for (let i = 0; i < 80; i++) {
      const s = createSimulation({ world, playerPoliticianId: "P1", seed: `N-${i}` });
      s.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_TEST",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
        sampleSize: 200,
      });
      samplesSmall.push(Object.values(s.getSnapshot().polls)[0]!.firstPreference[0]!.share);
      const t = createSimulation({ world, playerPoliticianId: "P1", seed: `N-${i}` });
      t.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_TEST",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
        sampleSize: 4000,
      });
      samplesLarge.push(Object.values(t.getSnapshot().polls)[0]!.firstPreference[0]!.share);
    }
    const varOf = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    };
    expect(varOf(samplesLarge)).toBeLessThan(varOf(samplesSmall));

    const latent = blocSupportShares(
      world,
      createSimulation({ world, playerPoliticianId: "P1" }).getSnapshot(),
      world.voterBlocs.C001_B01!,
      ["P1", "P2"],
    );
    const house = world.pollsters.POLL_TEST!.houseEffectsByParty;
    const housedP1 = (latent.P1 ?? 0) + (house.PARTY_LAB ?? 0);
    const housedP2 = (latent.P2 ?? 0) + (house.PARTY_NU ?? 0);
    const expectedP1 = housedP1 / (housedP1 + housedP2);
    const means: number[] = [];
    for (let i = 0; i < 120; i++) {
      const s = createSimulation({ world, playerPoliticianId: "P1", seed: `CAL-${i}` });
      s.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_TEST",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
        sampleSize: 4000,
      });
      const p1 = s
        .getSnapshot()
        .polls[Object.keys(s.getSnapshot().polls)[0]!]!.firstPreference.find(
          (r) => r.politicianId === "P1",
        )!.share;
      means.push(p1);
    }
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    expect(Math.abs(mean - expectedP1)).toBeLessThan(0.04);

    const hiWorld = jsonClone(world);
    hiWorld.pollsters.POLL_HI = { ...world.pollsters.POLL_TEST!, id: "POLL_HI", quality: 0.95 };
    hiWorld.pollsters.POLL_LO = { ...world.pollsters.POLL_TEST!, id: "POLL_LO", quality: 0.15 };
    const hi: number[] = [];
    const lo: number[] = [];
    for (let i = 0; i < 60; i++) {
      const a = createSimulation({ world: hiWorld, playerPoliticianId: "P1", seed: `Q-${i}` });
      a.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_HI",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
        sampleSize: 800,
      });
      hi.push(Object.values(a.getSnapshot().polls)[0]!.firstPreference[0]!.share);
      const b = createSimulation({ world: hiWorld, playerPoliticianId: "P1", seed: `Q-${i}` });
      b.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_LO",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
        sampleSize: 800,
      });
      lo.push(Object.values(b.getSnapshot().polls)[0]!.firstPreference[0]!.share);
    }
    expect(varOf(hi)).toBeLessThan(varOf(lo));
    const sameA = createSimulation({ world, playerPoliticianId: "P1", seed: "SAME" });
    const sameB = createSimulation({ world, playerPoliticianId: "P1", seed: "SAME" });
    sameA.executeCommand({
      type: "DEV_CREATE_POLL",
      pollsterId: "POLL_TEST",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      sampleSize: 500,
    });
    sameB.executeCommand({
      type: "DEV_CREATE_POLL",
      pollsterId: "POLL_TEST",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      sampleSize: 500,
    });
    expect(JSON.stringify(Object.values(sameA.getSnapshot().polls)[0]!.firstPreference)).toBe(
      JSON.stringify(Object.values(sameB.getSnapshot().polls)[0]!.firstPreference),
    );
    expect(
      createSimulation({ world, playerPoliticianId: "P1" }).executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_FAKE",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
      }).ok,
    ).toBe(false);
  });
});

describe("Phase 4 10,000 synthetic acceptance", () => {
  it("exercises the real support/turnout/ballot/election-math pipeline", () => {
    const world = miniElectorateWorld();
    const stats = {
      presidential: 0,
      assembly: 0,
      supportPoll: 0,
      irvWins: {} as Record<string, number>,
      stvSeats: {} as Record<string, number>,
      firstPrefAbsErr: [] as number[],
      turnoutRates: [] as number[],
      exhaustion: 0,
      transfers: 0,
      reorderSame: 0,
      replaySame: 0,
      hiddenUnchanged: 0,
      clearWins: 0,
      closeUniqueWinners: new Set<string>(),
      closeFirstLeader: [] as number[],
    };
    const closeWorld = jsonClone(world);
    closeWorld.voterBlocs.C001_B01 = {
      ...closeWorld.voterBlocs.C001_B01!,
      partyHabit: { PARTY_LAB: 0.51, PARTY_NU: 0.49 },
    };
    for (let i = 0; i < 10000; i++) {
      const kind = i % 10;
      if (kind < 2) {
        const sim = createSimulation({ world, playerPoliticianId: "P1", seed: `S-${i}` });
        if (i % 2 === 0) {
          sim.executeCommand({
            type: "DEV_SET_CANDIDATE_STANDING",
            politicianId: "P1",
            favorability: 0.6,
          });
        }
        const snap = sim.getSnapshot();
        const shares = blocSupportShares(world, snap, world.voterBlocs.C001_B01!, ["P1", "P2"]);
        expect((shares.P1 ?? 0) + (shares.P2 ?? 0)).toBeCloseTo(1, 10);
        const poll = sim.executeCommand({
          type: "DEV_CREATE_POLL",
          pollsterId: "POLL_TEST",
          geographyKind: "national",
          candidateIds: ["P1", "P2"],
        });
        expect(poll.ok).toBe(true);
        stats.supportPoll += 1;
      } else if (kind < 6) {
        const seed = `IRV-${i}`;
        const clear = i % 5 === 0;
        const raceWorld = clear ? world : closeWorld;
        const pair = clear ? (["P1", "P2"] as const) : (["P3", "P4"] as const);
        const sim = createSimulation({ world: raceWorld, playerPoliticianId: "P1", seed });
        if (clear) {
          sim.executeCommand({
            type: "DEV_SET_CANDIDATE_STANDING",
            politicianId: "P1",
            favorability: 0.92,
            nameRecognition: 0.9,
            enthusiasm: 0.8,
          });
        }
        const snap = sim.getSnapshot();
        const rng = createRngService(seed);
        const facts = pair.map((id) => publicCandidateFacts(raceWorld, snap, id)!);
        const turnout = constituencyTurnout(raceWorld, "C001", facts, "presidential", rng);
        stats.turnoutRates.push(turnout.turnoutRate);
        const latent = blocSupportShares(raceWorld, snap, raceWorld.voterBlocs.C001_B01!, pair);
        const order = i % 2 === 0 ? [...pair] : [...pair].reverse();
        const ballots = generateConstituencyBallots(
          raceWorld,
          snap,
          "C001",
          order,
          turnout.validVoteValue,
          undefined,
          rng,
        );
        expect(Number(integerBallotWeightSum(ballots))).toBe(turnout.validVoteValue);
        const first = firstPreferenceTotals(ballots);
        const firstSum = Object.values(first).reduce((a, b) => a + b, 0);
        expect(firstSum).toBe(turnout.validVoteValue);
        const leader = pair[0];
        stats.firstPrefAbsErr.push(
          Math.abs((first[leader] ?? 0) / firstSum - (latent[leader] ?? 0)),
        );
        if (ballots.some((b) => b.rankings.length < 2)) stats.exhaustion += 1;
        const result = countIrv(
          { candidateIds: [...order].sort(), ballots },
          { rng: { nextUint32: () => rng.uint32("elections") } },
        );
        expect(result.elected).toBeTruthy();
        stats.irvWins[result.elected!] = (stats.irvWins[result.elected!] ?? 0) + 1;
        stats.transfers += result.rounds.length > 1 ? 1 : 0;
        const reversed = [...pair].reverse();
        const reorderedSameLots = countIrv(
          { candidateIds: reversed, ballots },
          {
            rng: {
              nextUint32: (() => {
                const r = createRngService(seed);
                return () => r.uint32("elections");
              })(),
            },
          },
        );
        if (reorderedSameLots.elected === result.elected) stats.reorderSame += 1;
        const againRng = createRngService(seed);
        const again = countIrv(
          { candidateIds: [...pair], ballots },
          { rng: { nextUint32: () => againRng.uint32("elections") } },
        );
        if (serializeCountResult(again) === serializeCountResult(result)) stats.replaySame += 1;
        if (clear && result.elected === "P1") stats.clearWins += 1;
        if (!clear) {
          stats.closeUniqueWinners.add(result.elected ?? "");
          stats.closeFirstLeader.push((first[leader] ?? 0) / firstSum);
        }
        const mutated = jsonClone(raceWorld);
        mutated.agentProfiles[leader] = {
          ...mutated.agentProfiles[leader]!,
          ideology: { ...mutated.agentProfiles[leader]!.ideology, economic: 0.99 },
          skills: { ...mutated.agentProfiles[leader]!.skills, campaigning: 0.99, media: 0.99 },
          traits: { ...mutated.agentProfiles[leader]!.traits, integrity: 0.01, ambition: 0.99 },
        };
        const simH = createSimulation({ world: mutated, playerPoliticianId: "P1", seed });
        if (clear) {
          simH.executeCommand({
            type: "DEV_SET_CANDIDATE_STANDING",
            politicianId: "P1",
            favorability: 0.92,
            nameRecognition: 0.9,
            enthusiasm: 0.8,
          });
        }
        const rngH = createRngService(seed);
        const factsH = pair.map((id) => publicCandidateFacts(mutated, simH.getSnapshot(), id)!);
        const turnoutH = constituencyTurnout(mutated, "C001", factsH, "presidential", rngH);
        const hiddenBallots = generateConstituencyBallots(
          mutated,
          simH.getSnapshot(),
          "C001",
          order,
          turnoutH.validVoteValue,
          undefined,
          rngH,
        );
        const hiddenResult = countIrv(
          { candidateIds: [...order].sort(), ballots: hiddenBallots },
          { rng: { nextUint32: () => rngH.uint32("elections") } },
        );
        if (serializeCountResult(hiddenResult) === serializeCountResult(result)) {
          stats.hiddenUnchanged += 1;
        }
        stats.presidential += 1;
      } else {
        const seed = `STV-${i}`;
        const sim = createSimulation({ world, playerPoliticianId: "P1", seed });
        sim.executeCommand({
          type: "DEV_SET_CANDIDATE_STANDING",
          politicianId: "P1",
          favorability: 0.35,
        });
        const rng = createRngService(seed);
        const out = resolveAssemblyConstituency(world, sim.getSnapshot(), rng, {
          constituencyId: "C001",
          candidateIds: i % 2 === 0 ? ["P1", "P2", "P3", "P4"] : ["P4", "P3", "P2", "P1"],
          partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU", P3: "PARTY_LAB", P4: "PARTY_NU" },
        });
        expect("error" in out).toBe(false);
        if ("error" in out) return;
        expect(out.election.winnerIds.length).toBe(2);
        expect(new Set(out.election.winnerIds).size).toBe(2);
        expect(serializeCountResult(replayElectionCount(out.election))).toBe(
          serializeCountResult(out.election.countArchive),
        );
        stats.replaySame += 1;
        const first = firstPreferenceTotals(out.election.countInput!.ballots);
        const tot = Object.values(first).reduce((a, b) => a + b, 0);
        const lab = (first.P1 ?? 0) + (first.P3 ?? 0);
        expect(lab / tot).toBeGreaterThan(0.2);
        expect(lab / tot).toBeLessThan(0.95);
        if (out.election.countInput!.ballots.some((b) => b.rankings.length < 4)) {
          stats.exhaustion += 1;
        }
        const archive = out.election.countArchive;
        if (archive && archive.method === "stv" && archive.steps.length > 1) stats.transfers += 1;
        for (const id of out.election.winnerIds) {
          stats.stvSeats[id] = (stats.stvSeats[id] ?? 0) + 1;
        }
        stats.assembly += 1;
      }
    }
    expect(stats.presidential).toBe(4000);
    expect(stats.assembly).toBe(4000);
    expect(stats.supportPoll).toBe(2000);
    expect(stats.reorderSame).toBe(stats.presidential);
    expect(stats.hiddenUnchanged).toBe(stats.presidential);
    const meanErr = stats.firstPrefAbsErr.reduce((a, b) => a + b, 0) / stats.firstPrefAbsErr.length;
    expect(meanErr).toBeLessThan(0.08);
    expect(stats.clearWins).toBeGreaterThan(700);
    expect(stats.closeUniqueWinners.size).toBeGreaterThan(1);
    expect(
      Math.max(...stats.closeFirstLeader) - Math.min(...stats.closeFirstLeader),
    ).toBeGreaterThan(0.002);
    expect(Math.min(...stats.turnoutRates)).toBeGreaterThan(0.2);
    expect(Math.max(...stats.turnoutRates)).toBeLessThan(0.95);
    console.log(
      JSON.stringify({
        pipeline10000: {
          presidential: stats.presidential,
          assembly: stats.assembly,
          supportPoll: stats.supportPoll,
          irvWins: stats.irvWins,
          stvSeats: stats.stvSeats,
          meanFormalVsLatentAbsErr: meanErr,
          turnoutMin: Math.min(...stats.turnoutRates),
          turnoutMax: Math.max(...stats.turnoutRates),
          exhaustionCases: stats.exhaustion,
          transferCases: stats.transfers,
          reorderSame: stats.reorderSame,
          replaySame: stats.replaySame,
          hiddenUnchanged: stats.hiddenUnchanged,
          closeUniqueWinners: [...stats.closeUniqueWinners],
        },
      }),
    );
  }, 180_000);
});

describe("Phase 4 RCV/STV sanity", () => {
  it("transfers from a nearby ideology more than a distant one", () => {
    const result = countIrv(
      {
        candidateIds: ["CL", "C", "NAT"],
        ballots: [
          { id: "cl", weight: "20/1", rankings: ["CL", "C"] },
          { id: "c", weight: "35/1", rankings: ["C"] },
          { id: "nat", weight: "30/1", rankings: ["NAT"] },
        ],
      },
      { rng: { nextUint32: () => 1 } },
    );
    expect(result.elected).toBe("C");
  });

  it("elects magnitude seats with same-party competition and exhaustion", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const rng = createRngService("STV-SANITY");
    const out = resolveAssemblyConstituency(world, sim.getSnapshot(), rng, {
      constituencyId: "C001",
      candidateIds: ["P1", "P2", "P3", "P4"],
      partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU", P3: "PARTY_LAB", P4: "PARTY_NU" },
    });
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.election.winnerIds.length).toBe(2);
    expect(serializeCountResult(replayElectionCount(out.election))).toBe(
      serializeCountResult(out.election.countArchive),
    );
    const firsts = new Map<string, number>();
    for (const b of out.election.countInput!.ballots) {
      const top = b.rankings[0];
      if (!top) continue;
      firsts.set(top, (firsts.get(top) ?? 0) + Number(b.weight.split("/")[0]));
    }
    expect(firsts.get("P1") ?? 0).not.toBe(firsts.get("P3") ?? 0);
    const exhausted = out.election.countInput!.ballots.some((b) => b.rankings.length < 4);
    expect(exhausted).toBe(true);
  });
});

describe("Phase 4 geography backcast", () => {
  it("keeps Labour strong in industrial blocs and RL present in regional shares", () => {
    const world = loadTerenaWorld();
    let lab = 0;
    let nu = 0;
    let rl = 0;
    let grn = 0;
    let w = 0;
    for (const bloc of Object.values(world.voterBlocs)) {
      lab += bloc.weight * (bloc.partyHabit.PARTY_LAB ?? 0);
      nu += bloc.weight * (bloc.partyHabit.PARTY_NU ?? 0);
      rl += bloc.weight * (bloc.partyHabit.PARTY_RL ?? 0);
      grn += bloc.weight * (bloc.partyHabit.PARTY_GRN ?? 0);
      w += bloc.weight;
    }
    expect(lab / w).toBeGreaterThan(0.2);
    expect(lab / w).toBeLessThan(0.4);
    expect(nu / w).toBeGreaterThan(0.15);
    expect(rl / w).toBeGreaterThan(0.05);
    expect(grn / w).toBeLessThan(0.2);
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    const leaders = Object.values(snap.partyStates)
      .map((p) => p.leaderId)
      .filter((id): id is string => !!id);
    const shares = aggregateSupport(
      world,
      snap,
      Object.keys(world.constituencyElectorate).sort(),
      leaders,
      () => 1,
    );
    const byParty: Record<string, number> = {};
    for (const id of leaders) {
      const party = snap.politicians[id]?.partyId;
      if (party) byParty[party] = (byParty[party] ?? 0) + (shares[id] ?? 0);
    }
    expect(byParty.PARTY_LAB ?? 0).toBeGreaterThan(0.18);
    expect(byParty.PARTY_NU ?? 0).toBeGreaterThan(0.12);
    expect(byParty.PARTY_RL ?? 0).toBeGreaterThan(0.04);
    expect(byParty.PARTY_GRN ?? 0).toBeLessThan(0.28);
    const rng = createRngService("BACKCAST-FORMAL");
    const formal: Record<string, number> = {};
    let formalTotal = 0;
    for (const cid of Object.keys(world.constituencyElectorate).sort()) {
      const facts = leaders.map((id) => publicCandidateFacts(world, snap, id)!);
      const turnout = constituencyTurnout(world, cid, facts, "presidential", null);
      const ballots = generateConstituencyBallots(
        world,
        snap,
        cid,
        leaders,
        turnout.validVoteValue,
        undefined,
        null,
      );
      const first = firstPreferenceTotals(ballots);
      for (const [id, n] of Object.entries(first)) {
        const party = snap.politicians[id]?.partyId;
        if (!party) continue;
        formal[party] = (formal[party] ?? 0) + n;
        formalTotal += n;
      }
    }
    void rng;
    expect(formal.PARTY_LAB! / formalTotal).toBeGreaterThan(0.14);
    expect(formal.PARTY_NU! / formalTotal).toBeGreaterThan(0.1);
    expect(formal.PARTY_RL! / formalTotal).toBeGreaterThan(0.03);
    expect(formal.PARTY_GRN! / formalTotal).toBeLessThan(0.32);
    console.log(
      JSON.stringify({
        backcastFormal: Object.fromEntries(
          Object.entries(formal).map(([k, v]) => [k, v / formalTotal]),
        ),
      }),
    );
    const rural = Object.values(world.voterBlocs).filter((b) =>
      /rural|conservative|farm/i.test(b.archetype),
    );
    if (rural.length) {
      const g = rural.reduce((a, b) => a + b.weight * (b.partyHabit.PARTY_GRN ?? 0), 0);
      const tw = rural.reduce((a, b) => a + b.weight, 0);
      expect(g / tw).toBeLessThan(0.35);
    }
  });
});

describe("Phase 4 save schema v4", () => {
  it("round-trips a new game and migrates v3 saves", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    expect(sim.serializeSave().schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    const hash = sim.hashState();
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(hash);
    const parsed = parseSaveFile(stripToV3(sim.serializeSave()), "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    const restored = restoreSimulation(parsed.save, world);
    expect(restored.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]).toBeTruthy();
    expect(Object.keys(restored.getSnapshot().polls).length).toBe(0);
  });
});

describe("Phase 4 TERENA_2028 domain block", () => {
  it("reaches 2028-10-14 and still requires an explicit presidential count", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    for (let i = 0; i < 14; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok).toBe(true);
      if (r.ok && r.interrupt) {
        if (r.interrupt.requiresResolution) break;
        expect(sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" }).ok).toBe(true);
        expect(sim.executeCommand({ type: "RESUME_TURN" }).ok).toBe(true);
      }
    }
    const snap = sim.getSnapshot();
    expect(snap.pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    expect(snap.currentDate).toBe("2028-10-14");
    expect(snap.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]?.fieldFinalized).toBe(true);
    expect(snap.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]?.status).not.toBe("resolved");
  });
});

function expectOk(sim: Simulation, command: Command): void {
  const r = sim.executeCommand(command);
  if (!r.ok) {
    throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  }
}

function contentHashes(): Record<string, string> {
  const files = [
    "data/terena_voter_blocs_2028.json",
    "data/terena_pollsters.json",
    "data/terena_election_assembly_2026.json",
    "data/terena_parties.json",
    "data/terena_issues.json",
  ];
  const out: Record<string, string> = {};
  for (const f of files) {
    out[f] = hashCanonical(JSON.parse(readFileSync(resolve(repoRoot, f), "utf8")));
  }
  return out;
}

function kernelElectorateHash(world: KernelWorld): string {
  return hashCanonical({
    blocs: world.voterBlocs,
    pollsters: world.pollsters,
    turnout: Object.fromEntries(
      Object.entries(world.constituencyElectorate).map(([k, v]) => [k, v.turnout2026]),
    ),
    parties: world.partyDefinitions,
    issues: world.issueDimensions,
  });
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
  if (ordered.length < 1) {
    throw new Error(`no eligible presidential nominees for ${partyId}`);
  }
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
    expectOk(sim, { type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: id });
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
          type: "ENDORSE_PARTY_CONTEST_CANDIDATE",
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
        type: "ENDORSE_PARTY_CONTEST_CANDIDATE",
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

describe("Phase 4 explicit 2028–2029 test path", () => {
  it("resolves six nominees, counts IRV, and assumes office on 2029-01-20", () => {
    const diskBefore = contentHashes();
    const world = loadTerenaWorld();
    const kernelBefore = kernelElectorateHash(world);
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P4-FULL-2028" });
    expect(Object.keys(sim.getSnapshot().polls).length).toBe(0);
    const parties = Object.keys(sim.getSnapshot().partyStates).sort();
    for (const partyId of parties) {
      forceResolveNomination(world, sim, partyId);
    }
    const election = sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
    expect(Object.keys(election.candidates).length).toBe(6);
    expectOk(sim, {
      type: "FINALIZE_ELECTION_FIELD",
      electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
    });
    expect(sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]?.fieldFinalized).toBe(
      true,
    );
    const nominees = Object.keys(
      sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.candidates,
    );
    expectOk(sim, {
      type: "DEV_CREATE_POLL",
      pollsterId: "POLL_NAT_OMNI",
      electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
      geographyKind: "national",
      candidateIds: nominees,
    });
    expect(kernelElectorateHash(world)).toBe(kernelBefore);
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
    expect(sim.getSnapshot().currentDate).toBe("2028-10-14");
    expect(sim.getSnapshot().pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    const failHash = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_FAKE",
        geographyKind: "national",
        candidateIds: nominees,
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(failHash);
    expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    const resolved = sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
    expect(resolved.status).toBe("resolved");
    expect(resolved.winnerIds.length).toBe(1);
    expect(resolved.countArchive?.method).toBe("irv");
    expect(serializeCountResult(replayElectionCount(resolved))).toBe(
      serializeCountResult(resolved.countArchive),
    );
    const winnerId = resolved.winnerIds[0]!;
    expect(sim.getSnapshot().presidential.certifiedPresidentElectId).toBe(winnerId);
    expect(sim.getSnapshot().presidential.electedTermCountByPolitician[winnerId]).toBeGreaterThan(
      0,
    );
    const replayHash = serializeCountResult(resolved.countArchive);
    const dresCount = Object.keys(sim.getSnapshot().domainResolutions).length;
    expect(dresCount).toBeGreaterThan(0);
    const afterElectionHash = sim.hashState();
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(afterElectionHash);
    console.log(
      JSON.stringify({
        presidentialReplay: replayHash,
        afterElectionStateHash: afterElectionHash,
        domainResolutions: dresCount,
        winnerId,
      }),
    );
    expectOk(sim, { type: "RESUME_TURN" });
    expect(sim.getSnapshot().currentDate).toBe("2028-11-01");
    for (let i = 0; i < 4; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok).toBe(true);
      if (r.ok && r.interrupt) {
        if (!r.interrupt.requiresResolution) {
          expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
          expectOk(sim, { type: "RESUME_TURN" });
        } else if (r.interrupt.resolutionStatus === "resolved") {
          expectOk(sim, { type: "RESUME_TURN" });
        }
      }
    }
    expect(sim.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    const after = sim.getSnapshot();
    expect(after.presidential.certifiedPresidentElectId).toBeNull();
    expect(occupyingTerms(after, "OFFICE_PRESIDENT").some((t) => t.holderId === winnerId)).toBe(
      true,
    );
    const incompatible = new Set(["assembly_member", "governor", "minister"]);
    for (const t of activeTermsForPolitician(after, winnerId)) {
      const kind = world.offices[t.officeId]?.kind;
      expect(kind && incompatible.has(kind)).toBeFalsy();
    }
    const nextPres = regularElectionDate(world.presidentialCalendar, 2033);
    expect(after.presidential.nextRegularElectionDate).toBe(nextPres);
    expect(
      after.scheduler.events.some(
        (e) => e.eventType === "PRESIDENTIAL_ELECTION_DUE" && e.dueDate === nextPres,
      ),
    ).toBe(true);
    expectOk(sim, {
      type: "DEV_SET_CANDIDATE_STANDING",
      politicianId: winnerId,
      favorability: -0.8,
    });
    expect(
      serializeCountResult(
        replayElectionCount(sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!),
      ),
    ).toBe(replayHash);
    expect(kernelElectorateHash(world)).toBe(kernelBefore);
    expect(contentHashes()).toEqual(diskBefore);
  }, 180_000);
});

describe("Phase 4 performance", () => {
  it("benchmarks support, polls, synthetic elections, STV batch, and national RCV setup", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const leaders = Object.values(sim.getSnapshot().partyStates)
      .map((p) => p.leaderId)
      .filter((id): id is string => !!id);
    const tSupport = Date.now();
    aggregateSupport(
      world,
      sim.getSnapshot(),
      Object.keys(world.constituencyElectorate).sort(),
      leaders,
      (bloc) => bloc.turnoutPropensity,
    );
    const supportMs = Date.now() - tSupport;

    const mini = miniElectorateWorld();
    const tPolls = Date.now();
    for (let i = 0; i < 1000; i++) {
      const s = createSimulation({ world: mini, playerPoliticianId: "P1", seed: `PERF-P-${i}` });
      s.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_TEST",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
      });
    }
    const pollsMs = Date.now() - tPolls;

    const t10k = Date.now();
    for (let i = 0; i < 10000; i++) {
      if (i % 2 === 0) {
        countIrv(
          {
            candidateIds: ["P1", "P2"],
            ballots: [
              { id: "a", weight: "55/1", rankings: ["P1", "P2"] },
              { id: "b", weight: "45/1", rankings: ["P2"] },
            ],
          },
          { rng: { nextUint32: () => createRngService(`PERF-I-${i}`).uint32("elections") } },
        );
      } else {
        countStv(
          {
            candidateIds: ["P1", "P2", "P3", "P4"],
            seats: 2,
            ballots: [
              { id: "a", weight: "40/1", rankings: ["P1", "P3"] },
              { id: "b", weight: "35/1", rankings: ["P2", "P4"] },
              { id: "c", weight: "25/1", rankings: ["P3"] },
            ],
          },
          { rng: { nextUint32: () => createRngService(`PERF-S-${i}`).uint32("elections") } },
        );
      }
    }
    const tenKMs = Date.now() - t10k;

    const tStv = Date.now();
    const miniSnap = createSimulation({ world: mini, playerPoliticianId: "P1" }).getSnapshot();
    for (let i = 0; i < 48; i++) {
      resolveAssemblyConstituency(mini, miniSnap, createRngService(`PERF-STV-${i}`), {
        constituencyId: "C001",
        candidateIds: ["P1", "P2", "P3", "P4"],
        partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU", P3: "PARTY_LAB", P4: "PARTY_NU" },
      });
    }
    const stvMs = Date.now() - tStv;

    const tRcvSetup = Date.now();
    aggregateSupport(
      world,
      sim.getSnapshot(),
      Object.keys(world.constituencyElectorate).sort(),
      leaders,
      (bloc) => bloc.turnoutPropensity,
    );
    const rcvSetupMs = Date.now() - tRcvSetup;

    expect(supportMs).toBeLessThan(15_000);
    expect(pollsMs).toBeLessThan(60_000);
    expect(tenKMs).toBeLessThan(60_000);
    expect(stvMs).toBeLessThan(15_000);
    expect(rcvSetupMs).toBeLessThan(15_000);
    console.log(
      JSON.stringify({
        support48Ms: supportMs,
        polls1000Ms: pollsMs,
        synthetic10000Ms: tenKMs,
        stvBatchMs: stvMs,
        nationalSupportMs: rcvSetupMs,
      }),
    );
  }, 180_000);
});
