type RationalValue = string | number | bigint;

function value(raw: RationalValue | undefined): number {
  const [numerator, denominator = "1"] = String(raw ?? "0").split("/");
  const den = Number(denominator);
  return den === 0 ? 0 : (Number(numerator) || 0) / den;
}

export function stableElectionNightHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function closeness(values: number[]): number {
  const ranked = values.slice().sort((a, b) => b - a);
  if (ranked.length < 2 || ranked[0] === 0) return 0;
  return 1 - Math.min(1, (ranked[0]! - ranked[1]!) / ranked[0]!);
}

/**
 * Deterministic reporting order: simpler, clearer, lower-volume counts arrive
 * first; large, close, transfer-heavy counts arrive later. A bounded hash
 * breaks otherwise identical records without letting a place name decide.
 */
export function assemblyReportingOrder<
  T extends {
    constituencyId: string;
    magnitude: number;
    firstPreferences: Record<string, RationalValue>;
    turnout: { ballotsCast: number; turnoutRate: number };
    countArchive?: { steps?: readonly unknown[] } | null;
  },
>(electionId: string, rows: readonly T[]): T[] {
  const maxBallots = Math.max(1, ...rows.map((row) => row.turnout.ballotsCast));
  const score = (row: T) => {
    const transferWork = Math.min(1, (row.countArchive?.steps?.length ?? 0) / 45);
    const magnitude = Math.min(1, row.magnitude / 14);
    const close = closeness(Object.values(row.firstPreferences).map(value));
    const volume = row.turnout.ballotsCast / maxBallots;
    const jitter =
      (stableElectionNightHash(`${electionId}:${row.constituencyId}:report`) % 1000) / 1000;
    return transferWork * 0.38 + magnitude * 0.2 + close * 0.24 + volume * 0.14 + jitter * 0.04;
  };
  return rows
    .slice()
    .sort((a, b) => score(a) - score(b) || a.constituencyId.localeCompare(b.constituencyId));
}

export function provinceReportingOrder<
  T extends {
    id: string;
    provinceId: string;
    voteShares?: Record<string, number>;
    partyVoteShares?: Record<string, number>;
    turnoutRate: number | null;
  },
>(cycleKey: string, rows: readonly T[]): T[] {
  const score = (row: T) => {
    const shares = Object.values(row.voteShares ?? row.partyVoteShares ?? {});
    const close = closeness(shares);
    const turnout = row.turnoutRate ?? 0.6;
    const jitter = (stableElectionNightHash(`${cycleKey}:${row.provinceId}:report`) % 1000) / 1000;
    return close * 0.68 + turnout * 0.22 + jitter * 0.1;
  };
  return rows.slice().sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
}

/**
 * Spoiler gate for certified final banners/tables during Election Night.
 * Partial counts stay hidden; Instant / full reveal / historical replay open them.
 */
export function electionNightFinalVisible(args: {
  status: string;
  eventCount: number;
  historical: boolean;
  revealed: boolean;
}): boolean {
  return args.status !== "resolved" || args.eventCount === 0 || args.historical || args.revealed;
}
