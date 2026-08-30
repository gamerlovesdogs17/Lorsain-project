import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KernelWorld, SimState } from "@lorsain/sim";
import {
  CONSTITUENCY_TIE_FILL,
  constituencySittingPluralityPartyId,
  constituencySittingSeatBreakdown,
  mapFillFor,
} from "./fills.js";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "../styles.css");

function office(id: string, constituencyId: string) {
  return {
    id,
    kind: "assembly_member" as const,
    title: id,
    constituencyId,
  };
}

function term(id: string, officeId: string, holderId: string) {
  return {
    id,
    officeId,
    holderId,
    status: "active" as const,
    holdingKind: "substantive" as const,
  };
}

function politician(id: string, partyId: string | null) {
  return { id, partyId, alive: true, retired: false };
}

function snapFor(
  terms: ReturnType<typeof term>[],
  politicians: Record<string, ReturnType<typeof politician>>,
): SimState {
  return {
    officeTerms: Object.fromEntries(terms.map((t) => [t.id, t])),
    politicians,
    polls: {},
    economyRuntime: { provinces: {} },
  } as unknown as SimState;
}

function worldFor(offices: ReturnType<typeof office>[], colors: Record<string, string>): KernelWorld {
  return {
    offices: Object.fromEntries(offices.map((o) => [o.id, o])),
    partyDefinitions: Object.fromEntries(
      Object.entries(colors).map(([partyId, color]) => [partyId, { partyId, name: partyId, color }]),
    ),
  } as unknown as KernelWorld;
}

describe("constituency sitting plurality", () => {
  it("colors a mixed constituency by majority sitting party, not first term found", () => {
    const world = worldFor(
      [office("ASM_A", "C001"), office("ASM_B", "C001"), office("ASM_C", "C001")],
      { PARTY_LAB: "#c94b4b", PARTY_NU: "#496f9d" },
    );
    const snap = snapFor(
      [
        term("T1", "ASM_A", "P_NU"),
        term("T2", "ASM_B", "P_LAB"),
        term("T3", "ASM_C", "P_LAB"),
      ],
      {
        P_NU: politician("P_NU", "PARTY_NU"),
        P_LAB: politician("P_LAB", "PARTY_LAB"),
      },
    );
    expect(constituencySittingSeatBreakdown(world, snap, "C001")).toEqual([
      { partyId: "PARTY_LAB", seats: 2 },
      { partyId: "PARTY_NU", seats: 1 },
    ]);
    expect(constituencySittingPluralityPartyId(world, snap, "C001")).toBe("PARTY_LAB");
    expect(
      mapFillFor("political", world, snap, { id: "C001" } as never, "constituency"),
    ).toBe("#c94b4b");
  });

  it("uses a neutral fill for an exact sitting-seat tie", () => {
    const world = worldFor(
      [office("ASM_A", "C002"), office("ASM_B", "C002")],
      { PARTY_LAB: "#c94b4b", PARTY_NU: "#496f9d" },
    );
    const snap = snapFor(
      [term("T1", "ASM_A", "P_NU"), term("T2", "ASM_B", "P_LAB")],
      {
        P_NU: politician("P_NU", "PARTY_NU"),
        P_LAB: politician("P_LAB", "PARTY_LAB"),
      },
    );
    expect(constituencySittingPluralityPartyId(world, snap, "C002")).toBe("tie");
    expect(
      mapFillFor("political", world, snap, { id: "C002" } as never, "constituency"),
    ).toBe(CONSTITUENCY_TIE_FILL);
  });

  it("campaign fills encode field organization, not party or latent support", () => {
    const world = worldFor([], {});
    const snap = snapFor([], {});
    const fill = mapFillFor(
      "campaign",
      world,
      snap,
      { id: "C001" } as never,
      "constituency",
      { C001: 1 },
    );
    expect(fill.startsWith("rgba(31, 58, 95")).toBe(true);
    expect(fill).not.toBe("transparent");
    expect(fill).not.toBe("none");
  });

  it("colors a selected historical Provincial Assembly cycle from archived seats", () => {
    const world = worldFor([], { PARTY_LAB: "#c94b4b", PARTY_NU: "#496f9d" });
    const snap = snapFor([], {});
    snap.provincialRuntime = {
      elections: {},
      assemblyElections: {
        PASM_P01_2030: {
          id: "PASM_P01_2030",
          provinceId: "P01",
          date: "2030-10-01",
          status: "resolved",
          partySeats: { PARTY_LAB: 18, PARTY_NU: 12 },
        },
        PASM_P01_2034: {
          id: "PASM_P01_2034",
          provinceId: "P01",
          date: "2034-10-01",
          status: "resolved",
          partySeats: { PARTY_LAB: 10, PARTY_NU: 20 },
        },
      },
    } as unknown as SimState["provincialRuntime"];
    expect(
      mapFillFor(
        "election",
        world,
        snap,
        { id: "P01" } as never,
        "province",
        undefined,
        undefined,
        "PASM_P01_2030",
      ),
    ).toBe("#c94b4b");
  });
});

describe("map constituency CSS fill", () => {
  it("does not override SVG fill attributes with fill: transparent", () => {
    const css = readFileSync(cssPath, "utf8");
    const block = css.match(/\.map-constituency\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toContain("stroke-width");
    expect(block).not.toMatch(/fill\s*:\s*transparent/);
  });
});
