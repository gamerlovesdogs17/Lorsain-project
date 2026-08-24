import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { createRngService } from "./rng.js";
import { activeTermsForPolitician } from "./offices.js";
import { declareCampaign } from "./campaigns/actions.js";
import { FIELD } from "./campaigns/policy.js";
import {
  allocateAssemblyCandidateFields,
  assemblyCandidateEligibilityError,
  declineAssemblyCandidacy,
  fileAssemblyCandidacy,
  finalizeAssemblyFieldsIfDue,
  openAssemblyFilingIfDue,
} from "./elections/assembly-cycle.js";
import {
  buildAssemblyConstituencyField,
  resolveAssemblyElection,
} from "./elections/assembly-national.js";
import { resolveAssemblyConstituency } from "./elections/assembly.js";
import { CANONICAL_ASSEMBLY_ELECTION_ID } from "./elections/types.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { migrateSaveV10ToV11 } from "./save.js";

function preparedAssemblyState(playerPoliticianId = "NPC146") {
  const world = loadTerenaWorld();
  const simulation = createSimulation({ world, playerPoliticianId, seed: "P11-CLOSEOUT" });
  const state = simulation.serializeSave().simulation;
  const election = state.elections[CANONICAL_ASSEMBLY_ELECTION_ID]!;
  state.currentDate = "2029-11-01";
  openAssemblyFilingIfDue(state, world, election, "CMD-TEST");
  return { world, state, election };
}

describe("Phase 11.1 closeout Assembly candidacy", () => {
  it("allocates nationally without processing-order bias or duplicate candidates", () => {
    const { world, state, election } = preparedAssemblyState();
    const normal = allocateAssemblyCandidateFields(
      jsonClone(state),
      world,
      jsonClone(election),
      Object.keys(world.constituencyElectorate).sort(),
    );
    const reversed = allocateAssemblyCandidateFields(
      jsonClone(state),
      world,
      jsonClone(election),
      Object.keys(world.constituencyElectorate).sort().reverse(),
    );
    expect("error" in normal).toBe(false);
    expect("error" in reversed).toBe(false);
    if ("error" in normal || "error" in reversed) return;
    expect(normal).toEqual(reversed);

    const allCandidates = Object.values(normal.fields).flatMap((field) => field.candidateIds);
    expect(new Set(allCandidates).size).toBe(allCandidates.length);
    expect(allCandidates).not.toContain(state.playerPoliticianId);
    const uncontested = Object.values(normal.fields).filter(
      (field) => field.candidateIds.length === field.magnitude,
    );
    expect(uncontested.length).toBeLessThanOrEqual(5);
    for (const field of Object.values(normal.fields)) {
      expect(field.candidateIds.length).toBeGreaterThanOrEqual(field.magnitude);
      for (const politicianId of field.candidateIds) {
        expect(
          assemblyCandidateEligibilityError(state, world, politicianId, field.constituencyId),
        ).toBeNull();
        const politician = state.politicians[politicianId]!;
        expect(politician.alive).toBe(true);
        expect(politician.retired).toBe(false);
      }
    }
  });

  it("recruits against the actual eligible filing pool after long-run attrition", () => {
    const world = loadTerenaWorld();
    const simulation = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-LATE-POOL" });
    const state = simulation.serializeSave().simulation;
    const election = state.elections[CANONICAL_ASSEMBLY_ELECTION_ID]!;
    state.currentDate = "2029-11-01";

    const retained = new Set(
      Object.keys(state.politicians)
        .filter((id) => id !== state.playerPoliticianId)
        .sort()
        .slice(0, 250),
    );
    for (const politician of Object.values(state.politicians)) {
      if (politician.id !== state.playerPoliticianId && !retained.has(politician.id)) {
        politician.retired = true;
      }
    }

    const beforePromotions = Object.keys(state.provincialRuntime.promotions).length;
    const events = openAssemblyFilingIfDue(state, world, election, "CMD-LATE-POOL");
    expect(events).toHaveLength(1);
    expect(Object.keys(state.provincialRuntime.promotions).length).toBeGreaterThan(beforePromotions);
    for (const field of Object.values(election.assembly!.constituencyFields)) {
      expect(field.candidateIds.length).toBeGreaterThanOrEqual(field.magnitude + 1);
    }
  });

  it("keeps an incumbent player off the ballot unless they affirmatively file", () => {
    const { world, state, election } = preparedAssemblyState("NPC146");
    expect(election.assembly?.constituencyFields.C007?.candidateIds).not.toContain("NPC146");
    const filed = fileAssemblyCandidacy(
      state,
      world,
      { electionId: election.id, politicianId: "NPC146", constituencyId: "C007" },
      "CMD-FILE",
    );
    expect("error" in filed).toBe(false);
    expect(election.assembly?.constituencyFields.C007?.candidateIds).toContain("NPC146");
    const campaign = declareCampaign(
      state,
      world,
      {
        politicianId: "NPC146",
        type: "assembly",
        electionId: election.id,
        constituencyId: "C007",
      },
      "CMD-CAMPAIGN",
    );
    expect("error" in campaign).toBe(false);
    if (!("error" in campaign)) {
      expect(campaign.campaign.electionId).toBe(election.id);
      expect(campaign.campaign.constituencyId).toBe("C007");
    }
  });

  it("persists a player decline and allows a non-incumbent to file legitimately", () => {
    const incumbent = preparedAssemblyState("NPC146");
    const declined = declineAssemblyCandidacy(
      incumbent.state,
      incumbent.world,
      { electionId: incumbent.election.id, politicianId: "NPC146" },
      "CMD-DECLINE",
    );
    expect("error" in declined).toBe(false);
    expect(incumbent.election.assembly?.decisions.NPC146?.decision).toBe("declined");
    expect(incumbent.election.assembly?.constituencyFields.C007?.candidateIds).not.toContain(
      "NPC146",
    );

    const nonMember = Object.keys(incumbent.state.politicians).find(
      (id) =>
        id !== "NPC146" &&
        activeTermsForPolitician(incumbent.state, id).every(
          (term) => incumbent.world.offices[term.officeId]?.kind !== "assembly_member",
        ) &&
        !assemblyCandidateEligibilityError(incumbent.state, incumbent.world, id, "C001"),
    );
    expect(nonMember).toBeTruthy();
    if (!nonMember) return;
    const nonMemberRun = preparedAssemblyState(nonMember);
    const filed = fileAssemblyCandidacy(
      nonMemberRun.state,
      nonMemberRun.world,
      {
        electionId: nonMemberRun.election.id,
        politicianId: nonMember,
        constituencyId: "C001",
      },
      "CMD-NONMEMBER",
    );
    expect("error" in filed).toBe(false);
    expect(nonMemberRun.election.assembly?.constituencyFields.C001?.candidateIds).toContain(
      nonMember,
    );
  });

  it("feeds bounded constituency organization into the Assembly ballot model", () => {
    const { world, state, election } = preparedAssemblyState("NPC146");
    const filed = fileAssemblyCandidacy(
      state,
      world,
      { electionId: election.id, politicianId: "NPC146", constituencyId: "C007" },
      "CMD-FILE-MOBILIZATION",
    );
    expect("error" in filed).toBe(false);
    state.currentDate = "2030-04-01";
    finalizeAssemblyFieldsIfDue(state, world, election, "CMD-FINALIZE-MOBILIZATION");
    const field = buildAssemblyConstituencyField(state, world, "C007", "");
    expect("error" in field).toBe(false);
    if ("error" in field) return;

    const base = resolveAssemblyConstituency(
      world,
      state,
      createRngService("P11-MOBILIZATION"),
      {
        constituencyId: "C007",
        ...field,
        mobilizationByCandidate: Object.fromEntries(field.candidateIds.map((id) => [id, 1])),
      },
    );
    const organized = resolveAssemblyConstituency(
      world,
      state,
      createRngService("P11-MOBILIZATION"),
      {
        constituencyId: "C007",
        ...field,
        mobilizationByCandidate: Object.fromEntries(
          field.candidateIds.map((id) => [id, id === "NPC146" ? 1 + FIELD.turnoutScale : 1]),
        ),
      },
    );
    expect("error" in base).toBe(false);
    expect("error" in organized).toBe(false);
    if ("error" in base || "error" in organized) return;
    const firstPreferences = (value: string | undefined) =>
      BigInt((value ?? "0/1").split("/")[0] ?? "0");
    expect(
      firstPreferences(organized.election.countArchive?.firstPreferences.NPC146),
    ).toBeGreaterThan(firstPreferences(base.election.countArchive?.firstPreferences.NPC146));
  });

  it("retains complete typed STV archives for every constituency", () => {
    const { world, state, election } = preparedAssemblyState();
    state.currentDate = "2030-04-01";
    finalizeAssemblyFieldsIfDue(state, world, election, "CMD-FINALIZE");
    state.currentDate = election.date;
    const resolved = resolveAssemblyElection(state, world, createRngService("P11-ARCHIVE"), {
      electionId: election.id,
      scheduledEventId: "SEV-CALIBRATION",
      commandId: "CMD-COUNT",
    });
    expect("error" in resolved).toBe(false);
    expect(election.winnerIds).toHaveLength(420);
    expect(new Set(election.winnerIds).size).toBe(420);
    expect(Object.keys(election.assembly?.constituencyResults ?? {})).toHaveLength(48);
    for (const result of Object.values(election.assembly!.constituencyResults)) {
      expect(result.archiveCompleteness).toBe("full");
      expect(result.countArchive?.method).toBe("stv");
      expect(result.electedIds).toHaveLength(result.magnitude);
      expect(result.electedIds.every((id) => result.candidateIds.includes(id))).toBe(true);
    }

    const legacy = {
      schemaVersion: 10,
      contentVersion: "0.3.1-predev",
      simulation: jsonClone(state),
    };
    legacy.simulation.schemaVersion = 10;
    legacy.simulation.elections[election.id]!.assembly = null;
    const migrated = migrateSaveV10ToV11(legacy) as typeof legacy;
    const migratedElection = migrated.simulation.elections[election.id]!;
    expect(migrated.schemaVersion).toBe(11);
    expect(migrated.simulation.schemaVersion).toBe(11);
    expect(Object.keys(migratedElection.assembly?.constituencyResults ?? {})).toHaveLength(48);
    expect(
      Object.values(migratedElection.assembly!.constituencyResults).every(
        (result) => result.archiveCompleteness === "legacy_summary" && result.countArchive === null,
      ),
    ).toBe(true);
  }, 120_000);
});
