import type { ConstituencyElection } from "./election.ts";

/** Deep-replace candidate IDs throughout an archived election row. */
export function remapElectionIds(
  elections: ConstituencyElection[],
  remap: Map<string, string>,
): void {
  if (remap.size === 0) return;
  const mapId = (id: string): string => remap.get(id) ?? id;

  for (const el of elections) {
    el.winners = el.winners.map(mapId);
    for (const c of el.candidates) {
      c.id = mapId(c.id);
    }
    for (const b of el.ballots) {
      b.rankings = b.rankings.map(mapId);
      if (b.id) {
        // Keep ballot group ids stable enough; rewrite embedded candidate tokens when present
        for (const [from, to] of remap) {
          if (b.id.includes(from)) b.id = b.id.split(from).join(to);
        }
      }
    }
    const r = el.result;
    r.elected = r.elected.map(mapId);
    r.eliminated = r.eliminated.map(mapId);
    r.candidateIds = r.candidateIds.map(mapId);

    const fp: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.firstPreferences)) fp[mapId(k)] = v;
    r.firstPreferences = fp;

    for (const step of r.steps) {
      if (step.electedId) step.electedId = mapId(step.electedId);
      if (step.eliminatedId) step.eliminatedId = mapId(step.eliminatedId);
      if (step.electedIds) step.electedIds = step.electedIds.map(mapId);
      const before: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.totalsBefore)) before[mapId(k)] = v;
      step.totalsBefore = before;
      const after: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.totalsAfter)) after[mapId(k)] = v;
      step.totalsAfter = after;
      for (const t of step.transfers) {
        if (t.toCandidateId) t.toCandidateId = mapId(t.toCandidateId);
        if (t.ballotGroupId) {
          for (const [from, to] of remap) {
            if (t.ballotGroupId.includes(from)) {
              t.ballotGroupId = t.ballotGroupId.split(from).join(to);
            }
          }
        }
      }
      if (step.tieResolution) {
        step.tieResolution.tiedIds = step.tieResolution.tiedIds.map(mapId);
        step.tieResolution.chosenId = mapId(step.tieResolution.chosenId);
        if (step.tieResolution.lot) {
          step.tieResolution.lot.sortedTiedIds = step.tieResolution.lot.sortedTiedIds.map(mapId);
          step.tieResolution.lot.selectedId = mapId(step.tieResolution.lot.selectedId);
        }
      }
    }
  }
}
