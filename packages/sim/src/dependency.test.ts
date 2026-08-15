import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(fileURLToPath(new URL(".", import.meta.url)));

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const FORBIDDEN = [
  /from\s+["']react["']/,
  /from\s+["']react-dom["']/,
  /from\s+["']node:fs["']/,
  /from\s+["']@lorsain\/game["']/,
  /scripts\/phase0b/,
  /Math\.random\(/,
  /Date\.now\(/,
  /new Date\(/,
];

describe("sim dependency boundary", () => {
  it("does not import React, DOM, node:fs, game, generators, Math.random, or ambient clocks", () => {
    const files = listTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      if (file.endsWith("dependency.test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        expect(text, `${file} matched ${re}`).not.toMatch(re);
      }
    }
  });
});
