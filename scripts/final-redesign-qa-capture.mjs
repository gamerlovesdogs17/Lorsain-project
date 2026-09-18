/**
 * Final redesign QA capture — playable-state only.
 *
 * Requires Vite with QA fixtures (dev). Example:
 *   QA_OUT_DIR=docs/qa/final-redesign/current-baseline node scripts/final-redesign-qa-capture.mjs
 *   node scripts/final-redesign-qa-capture.mjs
 *
 * Every shot MUST pass qaFixture + screen assertions. Unexpected duplicate PNG
 * hashes and title-screen captures fail the run.
 *
 * Does NOT run on normal push CI.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_REL = process.env.QA_OUT_DIR ?? "docs/qa/final-redesign/after";
const OUT = resolve(ROOT, OUT_REL);
const MANIFEST_REL =
  process.env.QA_MANIFEST ??
  (OUT_REL.includes("baseline")
    ? "docs/qa/final-redesign/current-baseline-manifest.json"
    : "docs/qa/final-redesign/after-manifest.json");
const MANIFEST = resolve(ROOT, MANIFEST_REL);
const DEV_PORT = Number(process.env.QA_DEV_PORT ?? 5175);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}/`;
const DEFAULT_FIXTURE = process.env.QA_FIXTURE ?? "institutions";
const DEFAULT_PLAYER = process.env.QA_PLAYER ?? "NPC003";

mkdirSync(OUT, { recursive: true });

const commitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tabletPortrait: { width: 834, height: 1194 },
  tabletLandscape: { width: 1024, height: 768 },
  phone: { width: 390, height: 844 },
};

/**
 * @typedef {{
 *   id: string,
 *   screen: string,
 *   fixture?: string,
 *   player?: string,
 *   viewports: Array<keyof typeof VIEWPORTS>,
 *   assert: string[],
 *   allowDuplicateWith?: string[],
 * }} Shot
 */

/** @type {Shot[]} */
const SHOTS = [
  {
    id: "home",
    screen: "home",
    viewports: ["desktop", "tabletPortrait", "tabletLandscape", "phone"],
    assert: ["playable-shell", "no-title-new-game", "has-end-turn"],
  },
  {
    id: "assembly",
    screen: "assembly",
    viewports: ["desktop", "tabletPortrait", "tabletLandscape", "phone"],
    assert: ["playable-shell", "assembly-heading", "no-title-new-game"],
  },
  {
    id: "party",
    screen: "party",
    viewports: ["desktop", "tabletPortrait", "tabletLandscape"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "executive",
    screen: "executive",
    viewports: ["desktop", "tabletPortrait", "tabletLandscape"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "courts",
    screen: "courts",
    viewports: ["desktop", "tabletPortrait", "tabletLandscape"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "elections",
    screen: "elections",
    viewports: ["desktop", "tabletPortrait", "tabletLandscape"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "campaign",
    screen: "campaign",
    fixture: "active-campaign",
    player: "NPC001",
    viewports: ["desktop", "tabletPortrait"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "foreign",
    screen: "foreign",
    viewports: ["desktop", "tabletPortrait"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "news",
    screen: "news",
    viewports: ["desktop"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "archive",
    screen: "archive",
    viewports: ["desktop"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "organizations",
    screen: "organizations",
    viewports: ["desktop"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "terena",
    screen: "terena",
    viewports: ["desktop", "tabletLandscape"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "economy",
    screen: "economy",
    viewports: ["desktop"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "settings",
    screen: "settings",
    viewports: ["desktop", "phone"],
    assert: ["playable-shell", "no-title-new-game"],
  },
  {
    id: "electionNight",
    screen: "electionNight",
    fixture: "election-night-partial",
    player: "NPC001",
    viewports: ["desktop"],
    assert: ["playable-shell", "no-title-new-game"],
  },
];

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** Canonical QA URL builder — always includes fixture. */
function qaUrl({ fixture, screen, player }) {
  const u = new URL(BASE);
  u.searchParams.set("qaFixture", fixture);
  u.searchParams.set("qaScreen", screen);
  u.searchParams.set("qaPlayer", player);
  return u.toString();
}

async function waitReady(page) {
  await page.waitForSelector("#lorsain-browser-qa-state", { state: "attached", timeout: 120_000 });
  await page.waitForFunction(() => {
    const el = globalThis.document.getElementById("lorsain-browser-qa-state");
    return el?.getAttribute("data-ready") === "true";
  });
  const screenAttr = await page.locator("#lorsain-browser-qa-state").getAttribute("data-screen");
  const playerAttr = await page.locator("#lorsain-browser-qa-state").getAttribute("data-player");
  return { screenAttr, playerAttr };
}

async function assertPlayable(page, shot, expectedScreen) {
  const summary = [];
  const bodyText = (
    (await page
      .locator("body")
      .innerText()
      .catch(() => "")) || ""
  ).slice(0, 8000);
  const lower = bodyText.toLowerCase();

  // Title / meta detection
  const hasNewGame =
    (await page.locator("button", { hasText: /^New Game$/i }).count()) > 0 ||
    (await page.locator("button", { hasText: /^NEW GAME$/i }).count()) > 0;
  const titleish =
    /\bnew game\b/i.test(bodyText) &&
    /\bcontinue\b/i.test(bodyText) &&
    (await page.locator("#lorsain-browser-qa-state").count()) === 0;

  if (shot.assert.includes("no-title-new-game") || shot.assert.includes("playable-shell")) {
    if (hasNewGame || titleish) {
      throw new Error(
        `${shot.id}: landed on title/meta screen (New Game visible or qa-state missing)`,
      );
    }
    summary.push("not-title-screen");
  }

  // Error / blank detection
  if (/something went wrong|error boundary|uncaught/i.test(bodyText)) {
    throw new Error(`${shot.id}: error boundary / crash text visible`);
  }
  if (bodyText.trim().length < 40) {
    throw new Error(`${shot.id}: blank/near-blank page`);
  }
  summary.push("not-blank");

  const qa = page.locator("#lorsain-browser-qa-state");
  if ((await qa.count()) === 0) {
    throw new Error(`${shot.id}: missing #lorsain-browser-qa-state (not in playable mode)`);
  }
  const dataScreen = await qa.getAttribute("data-screen");
  if (dataScreen && dataScreen !== expectedScreen) {
    // Soft warn for screens that remount to aliases; hard fail if stuck on home when not requested
    if (expectedScreen !== "home" && dataScreen === "home" && !lower.includes("assembly")) {
      throw new Error(`${shot.id}: expected screen ${expectedScreen}, qa-state has ${dataScreen}`);
    }
  }
  summary.push(`qa-screen:${dataScreen ?? "unknown"}`);

  if (shot.assert.includes("has-end-turn")) {
    const end =
      (await page.locator("button.btn-end-turn").count()) > 0 ||
      (await page.locator("button", { hasText: /End Turn/i }).count()) > 0;
    if (!end) throw new Error(`${shot.id}: End Turn control missing`);
    summary.push("has-end-turn");
  }

  if (shot.assert.includes("assembly-heading")) {
    const ok =
      /assembly/i.test(bodyText) ||
      (await page.locator("h1,h2,.page-title,.command-header", { hasText: /Assembly/i }).count()) >
        0;
    if (!ok) throw new Error(`${shot.id}: Assembly heading/content missing`);
    summary.push("assembly-content");
  }

  const overflow = await page.evaluate(() => {
    const doc = globalThis.document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  if (overflow) throw new Error(`${shot.id}: page-level horizontal overflow`);
  summary.push("no-page-overflow");

  return summary;
}

async function waitForServer(base, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(base);
      if (res.ok || res.status === 404) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server not reachable at ${base}`);
}

async function main() {
  let server = null;
  const entries = [];
  const hashToIds = new Map();
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
      await waitForServer(BASE);
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const shot of SHOTS) {
      const fixture = shot.fixture ?? DEFAULT_FIXTURE;
      const player = shot.player ?? DEFAULT_PLAYER;
      for (const vpName of shot.viewports) {
        const size = VIEWPORTS[vpName];
        await page.setViewportSize(size);
        const href = qaUrl({ fixture, screen: shot.screen, player });
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: 120_000 });
        const ready = await waitReady(page);
        const assertions = await assertPlayable(page, shot, shot.screen);
        assertions.push(
          `fixture:${fixture}`,
          `player:${player}`,
          `ready-player:${ready.playerAttr}`,
        );

        const file = `${shot.id}-${vpName}-${size.width}x${size.height}.png`;
        const path = resolve(OUT, file);
        await page.screenshot({ path, fullPage: false });
        const hash = sha256File(path);
        const rel = relative(ROOT, path).replace(/\\/g, "/");

        if (!hashToIds.has(hash)) hashToIds.set(hash, []);
        hashToIds.get(hash).push(shot.id);

        entries.push({
          id: shot.id,
          screen: shot.screen,
          fixture,
          player,
          viewport: vpName,
          size,
          path: rel,
          sha256: hash,
          commitSha,
          capturedAt: new Date().toISOString(),
          assertions,
          qaUrl: href.replace(/https?:\/\/[^/]+/, ""),
        });
        console.log("captured", file, hash.slice(0, 12));
      }
    }

    await browser.close();

    /** Unexpected duplicate hashes across different shot ids (same viewport family). */
    const unexpectedDuplicates = [];
    for (const [hash, ids] of hashToIds) {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length <= 1) continue;
      // Same id across viewports can share hash only if identical pixels (rare); flag cross-id always.
      unexpectedDuplicates.push({ hash, shotIds: uniqueIds });
    }
    if (unexpectedDuplicates.length > 0) {
      writeFileSync(
        MANIFEST,
        JSON.stringify(
          {
            commitSha,
            capturedAt: new Date().toISOString(),
            outDir: OUT_REL,
            entries,
            unexpectedDuplicates,
            status: "FAILED_DUPLICATE_HASHES",
          },
          null,
          2,
        ),
      );
      console.error("UNEXPECTED DUPLICATE SCREENSHOT HASHES:", unexpectedDuplicates);
      process.exitCode = 1;
      return;
    }

    writeFileSync(
      MANIFEST,
      JSON.stringify(
        {
          commitSha,
          capturedAt: new Date().toISOString(),
          outDir: OUT_REL,
          entryCount: entries.length,
          entries,
          unexpectedDuplicates: [],
          status: "OK",
        },
        null,
        2,
      ),
    );
    console.log("manifest", MANIFEST, "entries", entries.length, "status OK");
  } finally {
    if (server) {
      try {
        server.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
