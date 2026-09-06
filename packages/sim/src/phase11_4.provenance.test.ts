import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import {
  applyEnactedLawProvenance,
  repealRestoreOptionId,
} from "./legislature/procedure.js";
import {
  currentLawSource,
  currentProvisionOption,
  foundingOptionId,
  legislativeProvisionOption,
  policyItemForProvision,
  provisionHistory,
} from "./legislature/provisions.js";
import type { EnactedLawRecord } from "./legislature/types.js";
import type { SimState } from "./types.js";

const PROVISION = "PROV_UNEMPLOYMENT_INSURANCE";
const OPTION_A = "eighteen_week_benefits";
const OPTION_B = "twenty_six_week_benefits";
const OPTION_C = "forty_week_benefits";
const OPTION_D = "eight_week_benefits";

function enact(
  state: SimState,
  args: {
    id: string;
    title: string;
    optionId: string;
    lawAction?: "amend" | "replace" | "repeal";
    targetLawId?: string;
  },
): EnactedLawRecord {
  const item = policyItemForProvision(PROVISION, args.optionId);
  expect(item).toBeTruthy();
  const law: EnactedLawRecord = {
    id: args.id,
    billId: `BILL_${args.id}`,
    title: args.title,
    policyItems: [item!],
    amendmentIds: [],
    floorVoteId: null,
    repassageVoteId: null,
    presidentialDisposition: "signed",
    enactedDate: state.currentDate,
    sponsorId: state.playerPoliticianId,
    eventIds: [],
    operative: true,
    invalidatedByDecisionId: null,
    metadata: {},
  };
  state.legislatureRuntime.enactedLaws[law.id] = law;
  applyEnactedLawProvenance(state, law, {
    ...(args.lawAction ? { lawAction: args.lawAction } : {}),
    ...(args.targetLawId ? { targetLawId: args.targetLawId } : {}),
  });
  return law;
}

describe("Phase 11.4 provision history stack", () => {
  it("A enacts → B enacts → repeal B restores A (not founding)", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "PROV-STACK" });
    const state = jsonClone(sim.getSnapshot());
    const founding = foundingOptionId(PROVISION);
    expect(founding).toBeTruthy();
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(founding);
    expect(provisionHistory(state, PROVISION)).toHaveLength(0);

    const lawA = enact(state, {
      id: "LAW_A",
      title: "Unemployment Duration Act A",
      optionId: OPTION_A,
    });
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_A);
    expect(provisionHistory(state, PROVISION)).toHaveLength(1);
    expect(provisionHistory(state, PROVISION)[0]).toMatchObject({
      lawId: lawA.id,
      optionId: OPTION_A,
      previousOptionId: founding,
    });
    expect(currentLawSource(state, PROVISION).lawId).toBe(lawA.id);
    expect(repealRestoreOptionId(state, PROVISION, lawA.id)).toBe(founding);

    const lawB = enact(state, {
      id: "LAW_B",
      title: "Unemployment Duration Act B",
      optionId: OPTION_B,
    });
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_B);
    expect(provisionHistory(state, PROVISION)).toHaveLength(2);
    expect(provisionHistory(state, PROVISION)[1]).toMatchObject({
      lawId: lawB.id,
      optionId: OPTION_B,
      previousOptionId: OPTION_A,
    });
    expect(currentLawSource(state, PROVISION).previousOptionId).toBe(OPTION_A);
    expect(repealRestoreOptionId(state, PROVISION, lawB.id)).toBe(OPTION_A);

    enact(state, {
      id: "LAW_REPEAL_B",
      title: "Repeal of Unemployment Duration Act B",
      optionId: OPTION_A,
      lawAction: "repeal",
      targetLawId: lawB.id,
    });

    expect(state.legislatureRuntime.enactedLaws[lawB.id]?.operative).toBe(false);
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_A);
    expect(currentProvisionOption(state, PROVISION)?.id).not.toBe(founding);
    expect(provisionHistory(state, PROVISION)).toHaveLength(1);
    expect(provisionHistory(state, PROVISION)[0]?.lawId).toBe(lawA.id);
    expect(currentLawSource(state, PROVISION).lawId).toBe(lawA.id);
    expect(currentLawSource(state, PROVISION).founding).toBe(false);
  });

  it("replace pops the target Act then pushes the successor", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "PROV-REPLACE" });
    const state = jsonClone(sim.getSnapshot());
    const lawA = enact(state, {
      id: "LAW_A2",
      title: "Act A",
      optionId: OPTION_A,
    });
    const lawC = enact(state, {
      id: "LAW_C",
      title: "Replacement of Act A",
      optionId: OPTION_B,
      lawAction: "replace",
      targetLawId: lawA.id,
    });
    expect(state.legislatureRuntime.enactedLaws[lawA.id]?.operative).toBe(false);
    expect(provisionHistory(state, PROVISION)).toHaveLength(1);
    expect(provisionHistory(state, PROVISION)[0]).toMatchObject({
      lawId: lawC.id,
      optionId: OPTION_B,
    });
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_B);
  });

  it("A→B→C→D then sequential repeal D,C,B restores each prior", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "PROV-SEQ" });
    const state = jsonClone(sim.getSnapshot());

    const lawA = enact(state, { id: "SEQ_A", title: "Act A", optionId: OPTION_A });
    const lawB = enact(state, { id: "SEQ_B", title: "Act B", optionId: OPTION_B });
    const lawC = enact(state, { id: "SEQ_C", title: "Act C", optionId: OPTION_C });
    const lawD = enact(state, { id: "SEQ_D", title: "Act D", optionId: OPTION_D });

    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_D);
    expect(provisionHistory(state, PROVISION)).toHaveLength(4);

    // Repeal D → restores C
    enact(state, {
      id: "SEQ_REPEAL_D",
      title: "Repeal D",
      optionId: OPTION_C,
      lawAction: "repeal",
      targetLawId: lawD.id,
    });
    expect(state.legislatureRuntime.enactedLaws[lawD.id]?.operative).toBe(false);
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_C);
    expect(provisionHistory(state, PROVISION)).toHaveLength(3);
    expect(provisionHistory(state, PROVISION).at(-1)?.lawId).toBe(lawC.id);

    // Repeal C → restores B
    enact(state, {
      id: "SEQ_REPEAL_C",
      title: "Repeal C",
      optionId: OPTION_B,
      lawAction: "repeal",
      targetLawId: lawC.id,
    });
    expect(state.legislatureRuntime.enactedLaws[lawC.id]?.operative).toBe(false);
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_B);
    expect(provisionHistory(state, PROVISION)).toHaveLength(2);

    // Repeal B → restores A
    enact(state, {
      id: "SEQ_REPEAL_B",
      title: "Repeal B",
      optionId: OPTION_A,
      lawAction: "repeal",
      targetLawId: lawB.id,
    });
    expect(state.legislatureRuntime.enactedLaws[lawB.id]?.operative).toBe(false);
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_A);
    expect(provisionHistory(state, PROVISION)).toHaveLength(1);
    expect(provisionHistory(state, PROVISION)[0]?.lawId).toBe(lawA.id);
    expect(currentLawSource(state, PROVISION).founding).toBe(false);
  });

  it("amend preserves the target law and records amend provenance", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "PROV-AMEND" });
    const state = jsonClone(sim.getSnapshot());

    const lawA = enact(state, { id: "AMD_A", title: "Original Act", optionId: OPTION_A });
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_A);

    const lawB = enact(state, {
      id: "AMD_B",
      title: "Amendment to Original",
      optionId: OPTION_B,
      lawAction: "amend",
      targetLawId: lawA.id,
    });
    // Amend pushes new stack entry but does NOT pop the target
    expect(state.legislatureRuntime.enactedLaws[lawA.id]?.operative).toBe(true);
    expect(currentProvisionOption(state, PROVISION)?.id).toBe(OPTION_B);
    expect(provisionHistory(state, PROVISION)).toHaveLength(2);
    expect(lawB.metadata.lawAction).toBe("amend");
    expect(lawB.metadata.amendsLawId).toBe(lawA.id);
    expect(currentLawSource(state, PROVISION).lawId).toBe(lawB.id);
    expect(currentLawSource(state, PROVISION).previousOptionId).toBe(OPTION_A);
  });

  it("migration alias resolves old keep_* founding IDs from saves", () => {
    const opt = legislativeProvisionOption("PROV_UNEMPLOYMENT_INSURANCE", "keep_current_duration");
    expect(opt).toBeTruthy();
    expect(opt?.founding).toBe(true);
    expect(opt?.id).toBe("founding_twelve_week_duration");
  });
});
