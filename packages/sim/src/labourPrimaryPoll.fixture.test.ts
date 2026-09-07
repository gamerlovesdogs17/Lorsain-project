import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { restoreSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { parseSaveFile } from "./save.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixturePath = resolve(
  repoRoot,
  "docs/qa/institutional/fixtures/labour-primary-poll-browser-save.json",
);
const metaPath = resolve(repoRoot, "docs/qa/institutional/fixtures/labour-primary-poll-meta.json");

describe("labour primary poll QA fixture", () => {
  it("loads with a published nomination contest poll for ≥2 Labour candidates", () => {
    const world = loadTerenaWorld();
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      contestId: string;
      candidatePoliticianIds: string[];
      playerPoliticianId: string;
      provinceId: string;
      nationalShares: Array<{ politicianId: string; percentLabel: string }>;
    };
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const parsed = parseSaveFile(raw, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sim = restoreSimulation(parsed.save, world);
    const state = sim.getSnapshot();

    expect(state.playerPoliticianId).toBe(meta.playerPoliticianId);
    const contest = state.partyContests[meta.contestId];
    expect(contest?.type).toBe("presidential_nomination");
    expect(contest?.partyId).toBe("PARTY_LAB");
    expect(["open", "qualification", "voting"]).toContain(contest?.status);

    const campaigns = Object.values(state.campaignRuntime.campaigns).filter(
      (c) =>
        c.contestId === meta.contestId &&
        c.type === "presidential_nomination" &&
        (c.status === "active" || c.status === "exploring"),
    );
    expect(campaigns.length).toBeGreaterThanOrEqual(2);
    for (const id of meta.candidatePoliticianIds) {
      expect(campaigns.some((c) => c.politicianId === id)).toBe(true);
      expect(state.politicians[id]?.partyId).toBe("PARTY_LAB");
    }

    const contestPolls = Object.values(state.polls)
      .filter((poll) => poll.metadata.contestId === meta.contestId)
      .sort(
        (a, b) => b.publicationDate.localeCompare(a.publicationDate) || b.id.localeCompare(a.id),
      );
    expect(contestPolls.length).toBeGreaterThanOrEqual(2);
    const national = contestPolls.find((p) => p.geographyKind === "national");
    const provincial = contestPolls.find(
      (p) => p.geographyKind === "province" && p.provinceId === meta.provinceId,
    );
    expect(national).toBeTruthy();
    expect(provincial).toBeTruthy();
    expect(national!.id > provincial!.id).toBe(true);
    expect(national!.metadata.purpose).toBe("nomination");
    expect(national!.firstPreference.every((row) => typeof row.politicianId === "string")).toBe(
      true,
    );
    expect(national!.firstPreference.length).toBeGreaterThanOrEqual(2);
    for (const expected of meta.nationalShares) {
      const row = national!.firstPreference.find((r) => r.politicianId === expected.politicianId);
      expect(row).toBeTruthy();
      expect(`${((row?.share ?? 0) * 100).toFixed(1)}%`).toBe(expected.percentLabel);
    }

    const leader = [...(provincial?.firstPreference ?? [])].sort((a, b) => b.share - a.share)[0];
    expect(leader?.politicianId).toBe(meta.candidatePoliticianIds[0]);

    const playerCampaign = campaigns.find((c) => c.politicianId === meta.playerPoliticianId);
    expect(playerCampaign).toBeTruthy();
  });
});
