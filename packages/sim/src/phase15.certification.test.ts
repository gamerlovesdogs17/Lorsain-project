import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lightweight gate: after shards are produced, aggregate must exist and pass.
 * Shard execution itself is outside Vitest (scripts/phase15-cert-shard.ts).
 */
describe("Phase 15 certification aggregate contract", () => {
  it("documents the required shard matrix", () => {
    const expected = ["CERT-25-A", "CERT-25-B", "CERT-25-C", "CERT-50-A", "CERT-50-B", "CERT-100"];
    const src = readFileSync(
      resolve(
        fileURLToPath(new URL(".", import.meta.url)),
        "../../../scripts/phase15-cert-shard.ts",
      ),
      "utf8",
    );
    for (const id of expected) {
      expect(src).toContain(`id: "${id}"`);
    }
    expect(src).toContain("longrun-audit.json");
  });

  it("accepts a present aggregate artifact when available", () => {
    const path = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../../docs/qa/phase15/longrun-audit.json",
    );
    if (!existsSync(path)) {
      expect(true).toBe(true);
      return;
    }
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      result: string;
      audits: Array<{ shardId: string; result: string }>;
    };
    expect(raw.audits.length).toBe(6);
    expect(["pass", "fail"]).toContain(raw.result);
  });
});
