import { describe, expect, it } from "vitest";
import {
  assemblyReportingOrder,
  electionNightFinalVisible,
  provinceReportingOrder,
} from "./electionNight.js";

describe("Election Night reporting order", () => {
  it("is deterministic and holds a close transfer-heavy Assembly count for later", () => {
    const simple = {
      constituencyId: "C099",
      magnitude: 5,
      firstPreferences: { A: 700, B: 200 },
      turnout: { ballotsCast: 900, turnoutRate: 0.58 },
      countArchive: { steps: [1, 2] },
    };
    const close = {
      constituencyId: "C001",
      magnitude: 12,
      firstPreferences: { A: 510, B: 500, C: 490 },
      turnout: { ballotsCast: 1500, turnoutRate: 0.73 },
      countArchive: { steps: Array.from({ length: 50 }, (_, i) => i) },
    };
    const medium = {
      constituencyId: "C050",
      magnitude: 7,
      firstPreferences: { A: 550, B: 350 },
      turnout: { ballotsCast: 900, turnoutRate: 0.62 },
      countArchive: { steps: Array.from({ length: 12 }, (_, i) => i) },
    };
    const first = assemblyReportingOrder("ELEC_TEST", [close, simple, medium]).map(
      (row) => row.constituencyId,
    );
    const second = assemblyReportingOrder("ELEC_TEST", [medium, simple, close]).map(
      (row) => row.constituencyId,
    );
    expect(first).toEqual(second);
    expect(first.at(-1)).toBe("C001");
  });

  it("holds a close province result after a decisive one without using province names", () => {
    const decisive = {
      id: "RACE_Z",
      provinceId: "P21",
      voteShares: { A: 0.68, B: 0.32 },
      turnoutRate: 0.61,
    };
    const close = {
      id: "RACE_A",
      provinceId: "P01",
      voteShares: { A: 0.501, B: 0.499 },
      turnoutRate: 0.7,
    };
    expect(provinceReportingOrder("GOV_TEST", [close, decisive]).map((row) => row.id)).toEqual([
      "RACE_Z",
      "RACE_A",
    ]);
  });
});

describe("Election Night finalVisible spoiler gate", () => {
  it("hides certified finals during partial Assembly counts and early Presidential rounds", () => {
    expect(
      electionNightFinalVisible({
        status: "resolved",
        eventCount: 48,
        historical: false,
        revealed: false,
      }),
    ).toBe(false);
    expect(
      electionNightFinalVisible({
        status: "resolved",
        eventCount: 5,
        historical: false,
        revealed: false,
      }),
    ).toBe(false);
  });

  it("opens finals after Instant/full reveal, for historical replay, or when there is nothing to gate", () => {
    expect(
      electionNightFinalVisible({
        status: "resolved",
        eventCount: 48,
        historical: false,
        revealed: true,
      }),
    ).toBe(true);
    expect(
      electionNightFinalVisible({
        status: "resolved",
        eventCount: 5,
        historical: true,
        revealed: false,
      }),
    ).toBe(true);
    expect(
      electionNightFinalVisible({
        status: "voting",
        eventCount: 5,
        historical: false,
        revealed: false,
      }),
    ).toBe(true);
    expect(
      electionNightFinalVisible({
        status: "resolved",
        eventCount: 0,
        historical: false,
        revealed: false,
      }),
    ).toBe(true);
  });
});
