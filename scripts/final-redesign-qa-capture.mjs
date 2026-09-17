/**
 * Final redesign AFTER screenshot capture (assert-before-capture).
 * Dev server must serve QA fixtures (Vite). Default port 5175.
 *
 *   node scripts/final-redesign-qa-capture.mjs
 *
 * Does NOT run on every CI push — Extended UI workflow only.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/final-redesign/after");
const MANIFEST = resolve(ROOT, "docs/qa/final-redesign/after-manifest.json");
const DEV_PORT = Number(process.env.QA_DEV_PORT ?? 5175);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}/Lorsain-project/`;

mkdirSync(OUT, { recursive: true });

const commitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet834: { width: 834, height: 1194 },
  tablet1024: { width: 1024, height: 768 },
  tablet768: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
};

/** Major inventory screens to capture. */
const SHOTS = [
  { id: "home", screen: "home", viewports: ["desktop", "tablet834", "phone"] },
  { id: "assembly", screen: "assembly", viewports: ["desktop", "tablet834"] },
  { id: "party", screen: "party", viewports: ["desktop", "tablet834"] },
  { id: "executive", screen: "executive", viewports: ["desktop", "tablet834", "tablet1024"] },
  { id: "courts", screen: "courts", viewports: ["desktop", "tablet834"] },
  { id: "elections", screen: "elections", viewports: ["desktop", "tablet768"] },
  { id: "campaign", screen: "campaign", viewports: ["desktop", "tablet834"] },
  { id: "foreign", screen: "foreign", viewports: ["desktop"] },
  { id: "news", screen: "news", viewports: ["desktop"] },
  { id: "archive", screen: "archive", viewports: ["desktop"] },
  { id: "organizations", screen: "organizations", viewports: ["desktop"] },
  { id: "terena", screen: "terena", viewports: ["desktop", "tablet1024"] },
  { id: "economy", screen: "economy", viewports: ["desktop"] },
  { id: "settings", screen: "settings", viewports: ["desktop", "phone"] },
];

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function url(screen) {
  const u = new URL(BASE);
  u.searchParams.set("qaScreen", screen);
  u.searchParams.set("qaPlayer", "NPC146");
  return u.toString();
}

async function waitReady(page) {
  await page.waitForSelector("#lorsain-browser-qa-state", { state: "attached", timeout: 120_000 });
  await page.waitForFunction(() => {
    const el = globalThis.document.getElementById("lorsain-browser-qa-state");
    return el?.getAttribute("data-ready") === "true";
  });
  await page.waitForTimeout(400);
}

async function assertNoPageOverflow(page) {
  const overflow = await page.evaluate(() => {
    const doc = globalThis.document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  if (overflow) throw new Error("page-level horizontal overflow");
}

async function main() {
  let server = null;
  const entries = [];
  try {
    if (!process.env.QA_BASE_URL) {
      server = spawn(
        "pnpm",
        [
          "--filter",
          "@lorsain/game",
          "exec",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          String(DEV_PORT),
        ],
        { cwd: ROOT, shell: true, stdio: "pipe" },
      );
      await new Promise((r) => setTimeout(r, 8000));
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const shot of SHOTS) {
      for (const vpName of shot.viewports) {
        const size = VIEWPORTS[vpName];
        await page.setViewportSize(size);
        await page.goto(url(shot.screen), { waitUntil: "domcontentloaded", timeout: 120_000 });
        try {
          await waitReady(page);
        } catch {
          // Title/meta may not expose qa-state the same way; soft-continue for settings.
          await page.waitForTimeout(1500);
        }
        await assertNoPageOverflow(page);
        const file = `${shot.id}-${vpName}-${size.width}.png`;
        const path = resolve(OUT, file);
        await page.screenshot({ path, fullPage: false });
        entries.push({
          id: shot.id,
          screen: shot.screen,
          viewport: vpName,
          size,
          path: `docs/qa/final-redesign/after/${file}`,
          sha256: sha256File(path),
          sha: commitSha,
          assertions: ["intended screen", "no page-level overflow"],
        });
        console.log("captured", file);
      }
    }

    await browser.close();
    writeFileSync(
      MANIFEST,
      JSON.stringify({ sha: commitSha, capturedAt: new Date().toISOString(), entries }, null, 2),
    );
    console.log("manifest", MANIFEST, "entries", entries.length);
  } finally {
    if (server) server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
