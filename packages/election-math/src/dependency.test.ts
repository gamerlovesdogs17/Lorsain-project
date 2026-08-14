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
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "test-helpers.ts") {
      out.push(p);
    }
  }
  return out;
}

const FORBIDDEN = [
  /from\s+["']@lorsain\/sim["']/,
  /from\s+["']@lorsain\/game["']/,
  /from\s+["']@lorsain\/content-[^"']+["']/,
  /from\s+["']react["']/,
  /from\s+["']react-dom["']/,
  /terena_parties/,
  /data\/terena_/,
];

describe("election-math dependency boundary", () => {
  it("does not import sim, game, content, React, or Terena data", () => {
    const files = listTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        expect(text, `${file} matched ${re}`).not.toMatch(re);
      }
    }
  });
});
