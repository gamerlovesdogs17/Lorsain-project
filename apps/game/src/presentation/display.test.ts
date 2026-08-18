import { describe, expect, it } from "vitest";
import {
  decisionDisplayLabel,
  formatPublicNumber,
  interruptDisplay,
  looksLikeInternalCode,
  relationshipPublicLabel,
} from "./display.js";

describe("formatPublicNumber", () => {
  it("formats rational vote totals as integers", () => {
    expect(formatPublicNumber("6205093/1")).toBe("6,205,093");
    expect(formatPublicNumber("42/1")).toBe("42");
  });

  it("formats plain numbers", () => {
    expect(formatPublicNumber(6205093)).toBe("6,205,093");
    expect(formatPublicNumber(100.5)).toBe("100.5");
  });
});

describe("interruptDisplay", () => {
  it("never exposes PRESIDENTIAL_ELECTION_DUE code", () => {
    const text = interruptDisplay({ code: "PRESIDENTIAL_ELECTION_DUE", date: "2028-10-14" });
    expect(text).toContain("2028 presidential election");
    expect(text).not.toContain("PRESIDENTIAL_ELECTION_DUE");
    expect(text).not.toContain("Unresolved domain event");
  });

  it("handles unknown codes without leaking SCREAMING_SNAKE", () => {
    const text = interruptDisplay({ code: "MYSTERY_BLOCKER", date: "2029-01-01" });
    expect(text).not.toContain("MYSTERY_BLOCKER");
    expect(text).toContain("2029-01-01");
  });
});

describe("decisionDisplayLabel", () => {
  it("replaces interrupt message leak", () => {
    const label = decisionDisplayLabel(
      {
        key: "interrupt:x",
        kind: "interrupt",
        label: "Unresolved domain event PRESIDENTIAL_ELECTION_DUE on 2028-10-14",
      },
      { code: "PRESIDENTIAL_ELECTION_DUE", date: "2028-10-14" } as never,
    );
    expect(label).not.toContain("PRESIDENTIAL_ELECTION_DUE");
    expect(label).toContain("2028 presidential election");
  });
});

describe("looksLikeInternalCode", () => {
  it("detects internal codes", () => {
    expect(looksLikeInternalCode("PRESIDENTIAL_ELECTION_DUE")).toBe(true);
    expect(looksLikeInternalCode("Sign or return: Budget bill")).toBe(false);
  });
});

describe("relationshipPublicLabel", () => {
  it("uses human relationship wording", () => {
    expect(relationshipPublicLabel(0)).toBe("Neutral");
    expect(relationshipPublicLabel(0.3)).toBe("Cordial");
    expect(relationshipPublicLabel(-0.4)).toBe("Cool");
  });
});
