import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { currentAssemblyMemberIds, allocateLegislativeVoteId } from "../legislature/state.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import { stageIsRipe } from "../legislature/procedure.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import { buildDecisionActorContext } from "../agents/context.js";
import { chooseDecision, emptySignals, type DecisionOption } from "../agents/decisions.js";
import { getAgentProfile } from "../agents/profile.js";
import { allocateTreatyRatificationId, getBilateralRelation } from "./state.js";
import { TERENA_WORLD_ID, type TreatyRecord } from "./types.js";
import { isTerenaTreatyMember, terenaTreatyRequiresAssembly } from "./treaty-effects.js";
import { publicActiveCrises } from "./crises.js";
import { activateTreaty } from "./treaties.js";
import { treatyAssemblyFraction } from "../provinces/constitutionGameplay.js";
import { assemblyFractionYesNeeded } from "../executive/procedure.js";

/**
 * Procedural default for treaty ratification: simple majority of votes cast
 * (yes > no with at least one cast vote), matching Assembly motion semantics
 * (`simple_majority_cast`). The constitution assigns ratification to the Assembly
 * without prescribing a special supermajority.
 */
export function treatyRatificationPassed(yes: number, no: number): boolean {
  return yes + no > 0 && yes > no;
}

function treatyCounterpartyId(treaty: TreatyRecord): string | null {
  const foreign = treaty.memberIds.filter((id) => id !== TERENA_WORLD_ID);
  return foreign[0] ?? null;
}

export function chooseTreatyRatificationVote(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  treaty: TreatyRecord,
  rng: RngService,
): LegislativeVoteChoice {
  if (politicianId === state.playerPoliticianId) return "abstain";
  const pol = state.politicians[politicianId];
  const profile = getAgentProfile(world, state, politicianId);
  const counterparty = treatyCounterpartyId(treaty);
  const rel = counterparty
    ? getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, counterparty)
    : null;
  const president = currentPresidentialAuthorityId(world, state);
  const presidentParty = president ? state.politicians[president]?.partyId : null;
  const samePartyAsPresident = pol?.partyId != null && pol.partyId === presidentParty;
  const partyLoyalty = profile?.traits.partyLoyalty ?? 0.5;
  const institutionalism = profile?.traits.institutionalism ?? 0.5;
  const pragmatism = profile?.traits.pragmatism ?? 0.5;

  let support = 0;
  if (treaty.kind === "trade") support += 0.15 + (rel?.economicTies ?? 0.2) * 0.2;
  if (treaty.kind === "mutual_defense") support += rel && rel.general > 0 ? 0.12 : -0.15;
  if (treaty.kind === "non_aggression") support += 0.08;
  if (rel) support += (rel.general + 100) / 400;
  if (samePartyAsPresident) support += partyLoyalty * 0.18;
  else support -= partyLoyalty * 0.08;
  support += institutionalism * 0.06;
  support -= publicActiveCrises(state.foreignAffairsRuntime).length * 0.06;
  if (treaty.kind === "mutual_defense" && rel && rel.general < -20) support -= 0.25;

  // Foreign country IDs must not appear in targetIds — domestic MPs only have
  // politician public facts. Treaty/country context stays in signals + metadata.
  const options: DecisionOption[] = [
    {
      optionId: "YES",
      actionType: "CAST_TREATY_RATIFICATION_VOTE",
      targetIds: [],
      uncertainty: 0.1,
      signals: emptySignals({
        ideologicalAlignment: support,
        partyAlignment: samePartyAsPresident ? partyLoyalty * 0.2 : -partyLoyalty * 0.1,
        institutionalAlignment: institutionalism * 0.15,
        pragmaticEffectiveness: pragmatism * 0.1,
        risk: treaty.kind === "mutual_defense" ? 0.15 : 0.08,
      }),
      goalImpacts: {},
      metadata: {
        treatyId: treaty.id,
        treatyKind: treaty.kind,
        counterpartyId: counterparty,
        choice: "yes",
      },
    },
    {
      optionId: "NO",
      actionType: "CAST_TREATY_RATIFICATION_VOTE",
      targetIds: [],
      uncertainty: 0.1,
      signals: emptySignals({
        ideologicalAlignment: -support,
        partyAlignment: samePartyAsPresident ? -partyLoyalty * 0.15 : partyLoyalty * 0.08,
        risk: 0.12,
      }),
      goalImpacts: {},
      metadata: {
        treatyId: treaty.id,
        treatyKind: treaty.kind,
        counterpartyId: counterparty,
        choice: "no",
      },
    },
    {
      optionId: "ABSTAIN",
      actionType: "CAST_TREATY_RATIFICATION_VOTE",
      targetIds: [],
      uncertainty: 0.15,
      signals: emptySignals({ risk: 0.05, institutionalAlignment: 0.05 }),
      goalImpacts: {},
      metadata: {
        treatyId: treaty.id,
        treatyKind: treaty.kind,
        counterpartyId: counterparty,
        choice: "abstain",
      },
    },
  ];

  const ctx = buildDecisionActorContext(world, state, politicianId, []);
  const pick = chooseDecision(options, ctx, rng).chosen;
  if (pick?.optionId === "YES") return "yes";
  if (pick?.optionId === "NO") return "no";
  return "abstain";
}

export function ensurePendingPlayerTreatyVote(state: SimState, treatyId: string): void {
  if (!state.foreignAffairsRuntime.pendingPlayerTreatyVotes[treatyId]) {
    state.foreignAffairsRuntime.pendingPlayerTreatyVotes[treatyId] = {
      treatyId,
      choice: null,
    };
  }
}

export function scheduleTreatyRatification(
  state: SimState,
  treaty: TreatyRecord,
  commandId: string | null,
): SimEvent[] {
  treaty.status = "ratification_pending";
  treaty.ratificationStatus = "pending";
  const voteId = allocateLegislativeVoteId(state);
  const ratId = allocateTreatyRatificationId(state);
  treaty.ratificationVoteId = voteId;
  state.foreignAffairsRuntime.treatyRatifications[ratId] = {
    treatyId: treaty.id,
    voteId,
    introducedDate: state.currentDate,
    voteReadyDate: state.currentDate,
    status: "pending",
  };
  ensurePendingPlayerTreatyVote(state, treaty.id);
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "TREATY_RATIFICATION_PENDING",
      importance: 0.7,
      visibility: "public",
      actorIds: [treaty.proposerId],
      entityIds: [treaty.id, voteId],
      payload: {
        treatyId: treaty.id,
        voteId,
        voteReadyDate: state.currentDate,
        title: treaty.title,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function advanceTreatyAfterCounterpartyAcceptance(
  state: SimState,
  treaty: TreatyRecord,
  commandId: string | null,
): SimEvent[] {
  const needsAssembly =
    isTerenaTreatyMember(treaty.memberIds) && terenaTreatyRequiresAssembly(treaty.kind, state);
  if (needsAssembly) return scheduleTreatyRatification(state, treaty, commandId);
  treaty.status = "active";
  treaty.signedDate = state.currentDate;
  treaty.ratificationStatus = "not_required";
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "TREATY_RATIFIED",
      importance: 0.72,
      visibility: "public",
      actorIds: treaty.memberIds,
      entityIds: [treaty.id],
      payload: { treatyId: treaty.id, title: treaty.title },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function processTreatyRatificationVotes(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const mps = currentAssemblyMemberIds(world, state);
  if (mps.length === 0) return events;

  for (const rat of Object.values(state.foreignAffairsRuntime.treatyRatifications).sort((a, b) =>
    a.treatyId.localeCompare(b.treatyId),
  )) {
    if (rat.status !== "pending") continue;
    if (!stageIsRipe(state, rat.voteReadyDate)) continue;
    const treaty = state.foreignAffairsRuntime.treaties[rat.treatyId];
    if (!treaty || treaty.status !== "ratification_pending") continue;

    const votes: Record<string, LegislativeVoteChoice> = {};
    for (const mp of mps) {
      if (mp === state.playerPoliticianId) {
        const pending = state.foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id];
        votes[mp] = pending?.choice ?? "abstain";
        continue;
      }
      votes[mp] = chooseTreatyRatificationVote(world, state, mp, treaty, rng);
    }

    let yes = 0;
    let no = 0;
    let abstain = 0;
    for (const choice of Object.values(votes)) {
      if (choice === "yes") yes += 1;
      else if (choice === "no") no += 1;
      else abstain += 1;
    }
    // A8: Wire treatyAssemblyFraction into ratification threshold
    const fraction = treatyAssemblyFraction(state);
    const passed =
      fraction > 0.5
        ? yes >=
          assemblyFractionYesNeeded(world.legislativeConstitution.assemblySeatCount, fraction)
        : treatyRatificationPassed(yes, no);
    const thresholdLabel =
      fraction > 0.5 ? ("absolute_majority" as const) : ("simple_majority_cast" as const);

    const voteRecord = {
      id: rat.voteId,
      billId: `TREATY:${treaty.id}`,
      stage: "floor" as const,
      date: state.currentDate,
      committeeId: null,
      votes,
      partyIdsAtVote: Object.fromEntries(
        Object.keys(votes).map((id) => [id, state.politicians[id]?.partyId ?? null]),
      ),
      factionIdsAtVote: Object.fromEntries(
        Object.keys(votes).map((id) => [id, state.politicians[id]?.factionId ?? null]),
      ),
      yes,
      no,
      abstain,
      passed,
      threshold: thresholdLabel,
      metadata: {
        kind: "treaty_ratification",
        treatyId: treaty.id,
        treatyKind: treaty.kind,
        title: treaty.title,
        displayTitle: `Treaty ratification: ${treaty.title}`,
      },
    };
    state.legislatureRuntime.legislativeVotes[rat.voteId] = voteRecord;

    if (passed) {
      rat.status = "passed";
      activateTreaty(state, treaty.id, state.currentDate);
      delete state.foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id];
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "TREATY_RATIFIED",
          importance: 0.75,
          visibility: "public",
          actorIds: [],
          entityIds: [treaty.id, rat.voteId],
          payload: {
            treatyId: treaty.id,
            voteId: rat.voteId,
            yes,
            no,
            abstain,
            title: treaty.title,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    } else {
      rat.status = "failed";
      treaty.status = "rejected";
      treaty.ratificationStatus = "rejected";
      delete state.foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id];
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "TREATY_REJECTED",
          importance: 0.7,
          visibility: "public",
          actorIds: [],
          entityIds: [treaty.id, rat.voteId],
          payload: {
            treatyId: treaty.id,
            voteId: rat.voteId,
            yes,
            no,
            abstain,
            stage: "assembly",
            title: treaty.title,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}
