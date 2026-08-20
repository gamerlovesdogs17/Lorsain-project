import type { KernelWorld, SimState } from "../types.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import type { PlayerActionableDecision } from "../player-decisions.js";

export function collectForeignPlayerDecisions(
  world: KernelWorld,
  state: SimState,
): PlayerActionableDecision[] {
  const out: PlayerActionableDecision[] = [];
  const playerId = state.playerPoliticianId;
  const president = currentPresidentialAuthorityId(world, state) === playerId;
  const mp = currentAssemblyMemberIds(world, state).includes(playerId);

  if (mp) {
    for (const rat of Object.values(state.foreignAffairsRuntime.treatyRatifications).sort((a, b) =>
      a.treatyId < b.treatyId ? -1 : 1,
    )) {
      if (rat.status !== "pending") continue;
      const treaty = state.foreignAffairsRuntime.treaties[rat.treatyId];
      if (!treaty) continue;
      const pending = state.foreignAffairsRuntime.pendingPlayerTreatyVotes[rat.treatyId];
      if (pending?.choice) continue;
      out.push({
        key: `treaty_ratification:${rat.treatyId}`,
        kind: "treaty_ratification_vote",
        label: `Ratify treaty: ${treaty.title}`,
        treatyId: rat.treatyId,
      });
    }
  }

  if (president) {
    for (const action of state.foreignAffairsRuntime.pendingPresidentialActions) {
      const decision: PlayerActionableDecision = {
        key: `foreign_pending:${action.kind}:${action.targetCountryId ?? "none"}`,
        kind: "foreign_presidential_action",
        label: `Pending: ${action.kind.replace(/_/g, " ")}`,
      };
      if (action.targetCountryId) decision.targetCountryId = action.targetCountryId;
      out.push(decision);
    }
  }

  return out;
}
