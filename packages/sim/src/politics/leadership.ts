import { endorseCandidate } from "../parties/endorsements.js";
import { isCurrentlyActiveCandidate } from "../parties/lifecycle.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { ensurePoliticsRuntime } from "./state.js";
import { explainLeadershipSupport } from "./explain.js";

/**
 * Thin enhancement over existing party leadership contests:
 * record support-bloc explanations and occasional NPC endorsements.
 */
export function enhanceLeadershipContestsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];
  const contests = Object.values(state.partyContests)
    .filter(
      (c) =>
        c.type === "party_leadership" &&
        (c.status === "open" || c.status === "voting" || c.status === "qualification"),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const contest of contests) {
    const candidates = Object.values(contest.entries)
      .filter((entry) => isCurrentlyActiveCandidate(contest, entry.status))
      .map((entry) => entry.politicianId)
      .sort();
    if (candidates.length === 0) continue;

    const members = Object.values(state.politicians)
      .filter(
        (p) =>
          p.alive &&
          !p.retired &&
          p.partyId === contest.partyId &&
          p.id !== state.playerPoliticianId &&
          !candidates.includes(p.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    let endorsementsThisContest = 0;
    for (const member of members) {
      if (endorsementsThisContest >= 3) break;
      if (rng.float01("npc-decisions") > 0.22) continue;

      let bestId = candidates[0]!;
      let bestScore = -Infinity;
      for (const candidateId of candidates) {
        const factors = explainLeadershipSupport(world, state, member.id, candidateId, contest.id);
        const score = factors.reduce((sum, f) => sum + f.weight, 0);
        if (score > bestScore || (score === bestScore && candidateId < bestId)) {
          bestScore = score;
          bestId = candidateId;
        }
      }

      const noteId = `${contest.id}:${member.id}`;
      runtime.leadershipSupportNotes[noteId] = {
        contestId: contest.id,
        supporterId: member.id,
        candidateId: bestId,
        factors: explainLeadershipSupport(world, state, member.id, bestId, contest.id),
        recordedDate: state.currentDate,
      };

      if (bestScore < 0.15) continue;
      const endorsed = endorseCandidate(
        state,
        world,
        {
          contestId: contest.id,
          endorserId: member.id,
          targetId: bestId,
          endorserType: "politician",
        },
        commandId,
      );
      if (!("error" in endorsed)) {
        events.push(...endorsed.events);
        endorsementsThisContest += 1;
      }
    }
  }

  return events;
}
