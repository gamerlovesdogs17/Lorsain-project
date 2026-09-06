import { recordPoliticalMemory, memoriesOwnedBy } from "../agents/memories.js";
import { applyRelationshipChange } from "../agents/relationships.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { AS_MEMORY_ALLIANCE_THRESHOLD, AS_MEMORY_RIVALRY_THRESHOLD } from "./types.js";

function endorsementCounts(state: SimState, a: string, b: string): number {
  return Object.values(state.endorsements).filter(
    (e) =>
      e.status === "active" &&
      e.endorserType === "politician" &&
      ((e.endorserId === a && e.targetId === b) || (e.endorserId === b && e.targetId === a)),
  ).length;
}

function challengeCounts(state: SimState, a: string, b: string): number {
  let n = 0;
  for (const contest of Object.values(state.partyContests)) {
    if (contest.type !== "party_leadership") continue;
    const entries = contest.entries;
    if (!entries[a] || !entries[b]) continue;
    if (contest.winnerId === a || contest.winnerId === b) n += 1;
  }
  return n;
}

/**
 * Helpers for alliance/rivalry from repeated endorsements/challenges.
 * Bounded; reuses agents/memories + relationships.
 */
export function processPoliticalMemoryMonth(world: KernelWorld, state: SimState): SimEvent[] {
  const pairs = new Set<string>();
  for (const e of Object.values(state.endorsements)) {
    if (e.endorserType !== "politician" || e.status !== "active") continue;
    const key = [e.endorserId, e.targetId].sort().join("|");
    pairs.add(key);
  }
  for (const contest of Object.values(state.partyContests)) {
    if (contest.type !== "party_leadership") continue;
    const ids = Object.keys(contest.entries).sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        pairs.add(`${ids[i]}|${ids[j]}`);
      }
    }
  }

  let processed = 0;
  for (const key of [...pairs].sort()) {
    if (processed >= 12) break;
    const [a, b] = key.split("|") as [string, string];
    if (!state.politicians[a] || !state.politicians[b]) continue;
    const endorsements = endorsementCounts(state, a, b);
    const challenges = challengeCounts(state, a, b);

    if (endorsements >= AS_MEMORY_ALLIANCE_THRESHOLD) {
      const already = memoriesOwnedBy(state, a).some(
        (m) =>
          m.kind === "successful_cooperation" &&
          m.subjectIds.includes(b) &&
          m.tags.includes("alliance"),
      );
      if (!already) {
        recordPoliticalMemory(
          state,
          world,
          {
            ownerId: a,
            subjectIds: [b],
            kind: "successful_cooperation",
            valence: 0.45,
            salience: 0.6,
            durability: "durable",
            tags: ["alliance", "phase12"],
            relationshipEffects: { affinity: 0.08, trust: 0.06, respect: 0.04 },
            metadata: { pair: key, endorsements },
          },
          state.currentDate,
        );
        applyRelationshipChange(state, a, b, { affinity: 0.05, trust: 0.04 }, state.currentDate);
        processed += 1;
      }
    }

    if (challenges >= AS_MEMORY_RIVALRY_THRESHOLD) {
      const already = memoriesOwnedBy(state, a).some(
        (m) =>
          m.kind === "election_rivalry" && m.subjectIds.includes(b) && m.tags.includes("rivalry"),
      );
      if (!already) {
        recordPoliticalMemory(
          state,
          world,
          {
            ownerId: a,
            subjectIds: [b],
            kind: "election_rivalry",
            valence: -0.4,
            salience: 0.65,
            durability: "durable",
            tags: ["rivalry", "phase12"],
            relationshipEffects: { affinity: -0.08, trust: -0.05, respect: 0.02 },
            metadata: { pair: key, challenges },
          },
          state.currentDate,
        );
        applyRelationshipChange(state, a, b, { affinity: -0.06, trust: -0.04 }, state.currentDate);
        processed += 1;
      }
    }
  }

  return [];
}

/** Record + read helper for tests / UI. */
export function recentPoliticalMemories(
  state: SimState,
  ownerId: string,
  limit = 8,
): ReturnType<typeof memoriesOwnedBy> {
  return memoriesOwnedBy(state, ownerId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, limit);
}
