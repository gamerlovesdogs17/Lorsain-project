import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation } from "./engine.js";
import { hashCanonical, jsonClone } from "./hash.js";
import { currentHolderIds, occupyingTerms, officesOfKind } from "./offices.js";
import { parseSaveFile } from "./save.js";
import { buildTerenaKernelWorld, KernelContentError, type TerenaKernelInput } from "./world.js";
import { nthWeekdayOfMonth, presidentialAssumptionDate } from "./calendar.js";
import type { KernelWorld } from "./types.js";
import { countRelationshipEdges } from "./agents/relationships.js";
import { SAVE_SCHEMA_VERSION } from "./types.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "./terena-party-input.js";
import { enqueueScheduled } from "./scheduler.js";
import {
  applyPresidentialAssumption,
  resolveUnablePresidentElect,
} from "./elections/resolution.js";
import { ensureAssemblyElectionCycle } from "./elections/assembly-cycle.js";
import { plannedElection } from "./elections/state.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function stamp(bundle: ReturnType<typeof loadContentBundleFromRepo>): string {
  return hashCanonical({
    figures: bundle.content.starting_figures.figures.map(
      (f: {
        id: string;
        party_id?: string | null;
        faction_id?: string | null;
        roles: unknown;
      }) => ({
        id: f.id,
        party_id: f.party_id ?? null,
        faction_id: f.faction_id ?? null,
        roles: f.roles,
      }),
    ),
    seats: bundle.content.scenario.assembly.party_seats,
    offices: bundle.content.terena_offices.offices.map((o: { id: string }) => o.id),
  });
}

function loadTerenaInput() {
  const bundle = loadContentBundleFromRepo(repoRoot);
  return {
    bundle,
    input: {
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
      ...terenaElectoralFromBundle(bundle),
      ...terenaWorldFieldsFromBundle(bundle),
    } satisfies TerenaKernelInput,
  };
}

function loadTerenaWorld(): { world: KernelWorld; bundleHash: string } {
  const { bundle, input } = loadTerenaInput();
  return { world: buildTerenaKernelWorld(input), bundleHash: stamp(bundle) };
}

describe("TERENA_2028 office instantiation", () => {
  it("creates canonical office-term counts without mutating content", () => {
    const { world, bundleHash } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    const asmOffices = officesOfKind(world, "assembly_member");
    let asmTerms = 0;
    for (const o of asmOffices) {
      const n = occupyingTerms(snap, o.id).length;
      expect(n).toBe(o.capacity);
      asmTerms += n;
    }
    expect(asmTerms).toBe(420);
    expect(currentHolderIds(snap, "OFFICE_PRESIDENT")).toEqual(["NPC001"]);
    expect(
      officesOfKind(world, "governor").every((o) => occupyingTerms(snap, o.id).length === 1),
    ).toBe(true);
    expect(officesOfKind(world, "governor").length).toBe(21);
    expect(officesOfKind(world, "constitutional_court_justice").length).toBe(9);
    expect(
      officesOfKind(world, "constitutional_court_justice").every(
        (o) => occupyingTerms(snap, o.id).length === 1,
      ),
    ).toBe(true);
    expect(
      officesOfKind(world, "minister").every((o) => occupyingTerms(snap, o.id).length === 1),
    ).toBe(true);
    expect(officesOfKind(world, "minister").length).toBe(12);
    expect(currentHolderIds(snap, "OFFICE_SPEAKER")).toEqual(["NPC002"]);
    const mayorFilled = officesOfKind(world, "mayor").filter(
      (o) => occupyingTerms(snap, o.id).length === 1,
    );
    expect(mayorFilled.length).toBe(12);
    expect(Object.keys(snap.politicians).length).toBe(530);
    const occupied = Object.values(snap.officeTerms).filter(
      (t) => t.status === "active" || t.status === "suspended",
    ).length;
    expect(occupied).toBe(476);
    expect(world.offices["OFFICE_PARTY_LEADER"]).toBeUndefined();

    const again = loadContentBundleFromRepo(repoRoot);
    expect(stamp(again)).toBe(bundleHash);
  });

  it("enforces assembly capacity, single president, and incompatibilities", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const asm = officesOfKind(world, "assembly_member")[0]!;
    const extra = sim.executeCommand({
      type: "DEV_ASSUME_OFFICE",
      officeId: asm.id,
      holderId: "NPC999",
    });
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.error.code).toBe("CAPACITY");

    const twoPres = sim.executeCommand({
      type: "DEV_ASSUME_OFFICE",
      officeId: "OFFICE_PRESIDENT",
      holderId: "NPC002",
    });
    expect(twoPres.ok).toBe(false);

    const finance = sim.executeCommand({
      type: "DEV_ASSUME_OFFICE",
      officeId: "OFFICE_MINISTER_FINANCE",
      holderId: "NPC005",
    });
    expect(finance.ok).toBe(false);

    const presAsMp = sim.executeCommand({
      type: "DEV_ASSUME_OFFICE",
      officeId: asm.id,
      holderId: "NPC001",
    });
    expect(presAsMp.ok).toBe(false);

    const speakerStillMp = occupyingTerms(sim.getSnapshot(), "OFFICE_SPEAKER")[0];
    expect(speakerStillMp?.holderId).toBe("NPC002");
    const speakerAsm = Object.values(sim.getSnapshot().officeTerms).filter(
      (t) =>
        t.holderId === "NPC002" &&
        world.offices[t.officeId]?.kind === "assembly_member" &&
        t.status === "active",
    );
    expect(speakerAsm.length).toBe(1);
  });
});

describe("presidential vacancy", () => {
  it("ends a President-elect's symmetrically incompatible office before assumption", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({
      world,
      playerPoliticianId: "NPC337",
      seed: "P113-SPEAKER-ELECT",
    });
    const state = sim.serializeSave().simulation;
    const election = state.elections.ELEC_PRES_2028!;
    election.status = "resolved";
    election.winnerIds = ["NPC002"];
    state.presidential.certifiedPresidentElectId = "NPC002";
    const assemblyElection = plannedElection({
      id: "ELEC_ASM_ASSUMPTION_TEST",
      type: "assembly",
      date: "2029-05-13",
      geographyKind: "national",
      constituencyId: null,
      seats: 420,
    });
    state.elections[assemblyElection.id] = assemblyElection;
    const assemblyCycle = ensureAssemblyElectionCycle(state, world, assemblyElection);
    assemblyCycle.filingStatus = "open";
    assemblyCycle.candidacies.NPC002 = {
      politicianId: "NPC002",
      constituencyId: "C001",
      partyId: state.politicians.NPC002?.partyId ?? null,
      filedDate: state.currentDate,
      source: "npc",
      incumbent: true,
      status: "filed",
    };
    const scheduled = enqueueScheduled(state, {
      dueDate: state.currentDate,
      eventType: "PRESIDENTIAL_ASSUMPTION_DUE",
      payload: { electionId: election.id, electionDate: election.date },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "TEST",
    });
    expect("error" in scheduled).toBe(false);
    if ("error" in scheduled) return;
    const result = applyPresidentialAssumption(state, world, {
      date: state.currentDate,
      scheduledEventId: scheduled.id,
      commandId: "CMD_TEST",
    });
    expect("error" in result).toBe(false);
    expect(occupyingTerms(state, "OFFICE_PRESIDENT")[0]?.holderId).toBe("NPC002");
    expect(occupyingTerms(state, "OFFICE_SPEAKER")).toHaveLength(0);
    expect(assemblyCycle.candidacies.NPC002?.status).toBe("withdrawn");
    expect(
      "events" in result &&
        result.events.some((event) => event.type === "ASSEMBLY_CANDIDACY_WITHDRAWN"),
    ).toBe(true);
  });

  it("uses lawful succession and schedules a real special election when the President-elect cannot assume", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({
      world,
      playerPoliticianId: "NPC337",
      seed: "P113-ELECT-VACANCY",
    });
    const state = sim.serializeSave().simulation;
    const election = state.elections.ELEC_PRES_2028!;
    election.status = "resolved";
    election.winnerIds = ["NPC006"];
    state.presidential.certifiedPresidentElectId = "NPC006";
    state.politicians.NPC006!.alive = false;
    const scheduled = enqueueScheduled(state, {
      dueDate: state.currentDate,
      eventType: "PRESIDENTIAL_ASSUMPTION_DUE",
      payload: { electionId: election.id, electionDate: election.date },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "TEST",
    });
    expect("error" in scheduled).toBe(false);
    if ("error" in scheduled) return;
    const result = resolveUnablePresidentElect(state, world, {
      scheduledEventId: scheduled.id,
      commandId: "CMD_TEST",
    });
    expect("error" in result).toBe(false);
    expect(state.presidential.certifiedPresidentElectId).toBeNull();
    expect(
      occupyingTerms(state, "OFFICE_PRESIDENT").some((term) => term.holdingKind === "acting"),
    ).toBe(true);
    const special = Object.values(state.elections).find(
      (candidate) => candidate.metadata.specialElection === true,
    );
    expect(special).toBeTruthy();
    expect(
      state.scheduler.events.some(
        (event) =>
          event.eventType === "PRESIDENTIAL_ELECTION_DUE" &&
          event.payload.electionId === special?.id,
      ),
    ).toBe(true);
  });

  it("Speaker becomes Acting President and a special election is required early in the term", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const r = sim.executeCommand({ type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      r.events.some((e) => e.type === "ACTING_PRESIDENT_ASSUMED" && e.actorIds.includes("NPC002")),
    ).toBe(true);
    expect(r.events.some((e) => e.type === "SPECIAL_PRESIDENTIAL_ELECTION_REQUIRED")).toBe(true);
    expect(
      sim
        .getSnapshot()
        .scheduler.events.some(
          (e) => e.eventType === "SPECIAL_PRESIDENTIAL_ELECTION_DEADLINE" && e.status === "pending",
        ),
    ).toBe(true);
    const acting = occupyingTerms(sim.getSnapshot(), "OFFICE_PRESIDENT").find(
      (t) => t.status === "active",
    );
    expect(acting?.holderId).toBe("NPC002");
    expect(acting?.holdingKind).toBe("acting");
    expect(sim.getSnapshot().presidential.electedTermCountByPolitician["NPC002"]).toBeUndefined();
    const speaker = occupyingTerms(sim.getSnapshot(), "OFFICE_SPEAKER")[0];
    expect(speaker?.status).toBe("suspended");
  });

  it("skips an unavailable Speaker in favor of the Justice Minister", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    sim.executeCommand({ type: "DEV_SET_ALIVE", politicianId: "NPC002", alive: false });
    const r = sim.executeCommand({ type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      r.events.some((e) => e.type === "ACTING_PRESIDENT_ASSUMED" && e.actorIds.includes("NPC011")),
    ).toBe(true);
  });

  it("skips Speaker and Justice in favor of Finance", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    sim.executeCommand({ type: "DEV_SET_ALIVE", politicianId: "NPC002", alive: false });
    sim.executeCommand({ type: "DEV_SET_ALIVE", politicianId: "NPC011", alive: false });
    const r = sim.executeCommand({ type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      r.events.some((e) => e.type === "ACTING_PRESIDENT_ASSUMED" && e.actorIds.includes("NPC009")),
    ).toBe(true);
  });

  it("does not require a special election within 180 days of the regular election", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    for (let i = 0; i < 6; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      if (r.ok && r.interrupt) sim.executeCommand({ type: "RESUME_TURN" });
    }
    expect(sim.getSnapshot().currentDate).toBe("2028-07-01");
    const r = sim.executeCommand({ type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.some((e) => e.type === "SPECIAL_PRESIDENTIAL_ELECTION_NOT_REQUIRED")).toBe(
      true,
    );
    expect(r.events.some((e) => e.type === "SPECIAL_PRESIDENTIAL_ELECTION_REQUIRED")).toBe(false);
  });

  it("uses a certified president-elect as acting successor before January 20", () => {
    const { world } = loadTerenaWorld();
    const shifted = jsonClone(world);
    shifted.scenarioStartDate = "2029-01-01";
    shifted.initialScheduled = shifted.initialScheduled.filter((e) => e.dueDate >= "2029-01-01");
    const sim = createSimulation({ world: shifted, playerPoliticianId: "NPC002" });
    sim.executeCommand({ type: "DEV_CERTIFY_PRESIDENT_ELECT", politicianId: "NPC006" });
    expect(sim.getSnapshot().currentDate).toBe("2029-01-01");
    const r = sim.executeCommand({ type: "INJECT_PRESIDENTIAL_VACANCY", reason: "death" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      r.events.some((e) => e.type === "ACTING_PRESIDENT_ASSUMED" && e.actorIds.includes("NPC006")),
    ).toBe(true);
    expect(sim.getSnapshot().presidential.electedTermCountByPolitician["NPC006"]).toBeUndefined();
  });
});

describe("TERENA first domain interrupt", () => {
  it("advances until the 2028-10-14 presidential election blocking interrupt", () => {
    const { world, bundleHash } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC337" });
    let interrupt = null as null | { code: string; date: string };
    for (let i = 0; i < 12; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok).toBe(true);
      if (r.ok && r.interrupt) {
        interrupt = { code: r.interrupt.code, date: r.interrupt.date };
        break;
      }
    }
    expect(interrupt).toEqual({ code: "PRESIDENTIAL_ELECTION_DUE", date: "2028-10-14" });
    expect(sim.getSnapshot().currentDate).toBe("2028-10-14");
    expect(sim.getSnapshot().completedTurns).toBe(9);
    expect(sim.getSnapshot().pendingInterrupt?.requiresResolution).toBe(true);
    const resume = sim.executeCommand({ type: "RESUME_TURN" });
    expect(resume.ok).toBe(false);
    if (!resume.ok) expect(resume.error.code).toBe("DOMAIN_RESOLUTION_REQUIRED");
    expect(sim.getSnapshot().currentDate).toBe("2028-10-14");
    expect(sim.getSnapshot().completedTurns).toBe(9);
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(restored.getSnapshot().currentDate).toBe("2028-10-14");
    expect(restored.getSnapshot().pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    expect(restored.executeCommand({ type: "RESUME_TURN" }).ok).toBe(false);
    expect(restored.getSnapshot().currentDate).toBe("2028-10-14");
    const again = loadContentBundleFromRepo(repoRoot);
    expect(stamp(again)).toBe(bundleHash);
  }, 60_000);

  it("cannot silently carry expired elected terms past an unresolved election", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC337" });
    for (let i = 0; i < 20; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      if (r.ok && r.interrupt) break;
    }
    expect(sim.getSnapshot().currentDate).toBe("2028-10-14");
    expect(sim.getSnapshot().currentDate < "2029-01-20").toBe(true);
    const pres = occupyingTerms(sim.getSnapshot(), "OFFICE_PRESIDENT").find(
      (t) => t.status === "active",
    );
    expect(pres?.holderId).toBe("NPC001");
    expect(pres?.endDate).toBe("2029-01-20");
  }, 60_000);
});

describe("authoritative calendar consumption", () => {
  it("rejects a constitution calendar that contradicts the scenario election date", () => {
    const { input } = loadTerenaInput();
    input.constitution.calendars!.CALENDAR_PRESIDENTIAL_REGULAR.month = 11;
    expect(() => buildTerenaKernelWorld(input)).toThrow(KernelContentError);
  });

  it("follows a consistently mutated constitution calendar", () => {
    const { input } = loadTerenaInput();
    input.constitution.calendars!.CALENDAR_PRESIDENTIAL_REGULAR.month = 11;
    const date = nthWeekdayOfMonth(2028, 11, "saturday", 2);
    input.scenario.presidential_election.date = date;
    input.scenario.presidential_election.regular_term_begins = presidentialAssumptionDate(date, {
      intervalYears: 5,
      month: 11,
      nthWeekday: 2,
      weekday: "saturday",
      anchorYear: 2018,
      assumptionMonth: 1,
      assumptionDay: 20,
      assumptionYearOffset: 1,
    });
    const world = buildTerenaKernelWorld(input);
    expect(world.presidentialCalendar.month).toBe(11);
    expect(world.nextRegularPresidentialElectionDate).toBe(date);
  });
});

describe("TERENA_2028 January save integrity", () => {
  it("rejects mutating the October presidential election to processed", () => {
    const { world } = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    expect(sim.getSnapshot().currentDate).toBe("2028-01-01");
    const raw = JSON.parse(JSON.stringify(sim.serializeSave())) as {
      simulation: { scheduler: { events: Array<{ eventType: string; status: string }> } };
    };
    const election = raw.simulation.scheduler.events.find(
      (e) => e.eventType === "PRESIDENTIAL_ELECTION_DUE",
    )!;
    election.status = "processed";
    expect(parseSaveFile(raw).ok).toBe(false);
    expect(() => restoreSimulation(raw as never, world)).toThrow();
  });
});

describe("TERENA_2028 Phase 2 agent substrate", () => {
  it("loads 530 canonical profiles without O(N^2) social state", () => {
    const { world } = loadTerenaWorld();
    expect(Object.keys(world.agentProfiles).length).toBe(530);
    const tiers = { rich: 0, standard: 0, light: 0 };
    for (const p of Object.values(world.agentProfiles)) tiers[p.aiTier] += 1;
    expect(tiers).toEqual({ rich: 316, standard: 207, light: 7 });
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    expect(snap.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(countRelationshipEdges(snap)).toBe(0);
    expect(Object.keys(snap.memories).length).toBe(0);
    expect(Object.keys(snap.beliefs).length).toBe(0);
    expect(Object.keys(snap.goals).length).toBeGreaterThan(500);
    expect(Object.keys(snap.generatedAgentProfiles).length).toBe(0);
    const v2Bytes = JSON.stringify(sim.serializeSave()).length;
    const v1Shaped = jsonClone(sim.serializeSave()) as unknown as {
      schemaVersion: number;
      simulation: Record<string, unknown>;
    };
    v1Shaped.schemaVersion = 1;
    v1Shaped.simulation.schemaVersion = 1;
    delete v1Shaped.simulation.relationships;
    delete v1Shaped.simulation.memories;
    delete v1Shaped.simulation.beliefs;
    delete v1Shaped.simulation.goals;
    delete v1Shaped.simulation.generatedAgentProfiles;
    delete v1Shaped.simulation.agentProfileOverrides;
    const v1Bytes = JSON.stringify(v1Shaped).length;
    expect(v2Bytes).toBeGreaterThan(v1Bytes);
    expect(v2Bytes).toBeLessThan(2_000_000);
    expect(Object.keys(snap.partyStates).sort()).toEqual([
      "PARTY_CR",
      "PARTY_GRN",
      "PARTY_LAB",
      "PARTY_NU",
      "PARTY_PM",
      "PARTY_RL",
    ]);
    expect(Object.keys(snap.factionStates).length).toBe(15);
    expect(snap.partyStates.PARTY_IND).toBeUndefined();
    expect(Object.keys(snap.partyContests).length).toBe(6);
    expect(
      Object.values(snap.partyContests).every(
        (c) => c.type === "presidential_nomination" && c.status === "planned",
      ),
    ).toBe(true);
  });
});
