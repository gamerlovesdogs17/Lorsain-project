/**
 * Phase 17B.2 — small representative QA screenshots (assert-before-capture).
 * Uses existing browser QA fixtures only — no invented UI.
 *
 *   node scripts/phase17b2-qa-capture.mjs
 *
 * Surfaces: Government/Executive (17A fixture), Foreign Affairs, Court, News, Campaign.
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase17b2");
const MANIFEST = resolve(OUT, "manifest.json");
const GOV_FIXTURE = resolve(ROOT, "docs/qa/phase17a/fixtures/government-browser-save.json");
const DEV_PORT = Number(process.env.QA_DEV_PORT ?? 5175);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}/Lorsain-project/`;
const DESK = { width: 1280, height: 720 };

mkdirSync(OUT, { recursive: true });

const commitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const buildTimestamp = new Date().toISOString();

function readFixturePlayer(fixturePath, fallback) {
  try {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const id = raw?.simulation?.playerPoliticianId;
    if (typeof id === "string" && id.length > 0) return id;
  } catch {
    /* missing fixture */
  }
  return fallback;
}

const GOV_PLAYER = readFixturePlayer(GOV_FIXTURE, "NPC146");
const INST_PLAYER = "NPC003";

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function url(query) {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function waitReady(page) {
  await page.waitForSelector("#lorsain-browser-qa-state", { state: "attached", timeout: 120_000 });
  await page.waitForFunction(() => {
    const el = globalThis.document.getElementById("lorsain-browser-qa-state");
    return el?.getAttribute("data-ready") === "true";
  });
  await page.waitForTimeout(450);
}

async function gotoFixture(page, query) {
  await page.setViewportSize(DESK);
  await page.goto(url(query), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitReady(page);
}

async function dismissOverlays(page) {
  const backdrop = page.locator("button.shell-drawer-backdrop, button.nav-backdrop");
  if (
    (await backdrop.count()) > 0 &&
    (await backdrop
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await backdrop
      .first()
      .click({ force: true })
      .catch(() => null);
    await page.waitForTimeout(200);
  }
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(120);
}

async function clickTab(page, label) {
  const byRole = page.getByRole("tab", { name: label });
  if ((await byRole.count()) > 0) {
    await byRole.first().click({ force: true });
    await page.waitForTimeout(320);
    return;
  }
  throw new Error(`Tab not found: ${label}`);
}

async function captureShot(page, { file, screen, fixture, player, assert }) {
  const passed = [];
  const result = await assert();
  if (Array.isArray(result)) passed.push(...result);
  else if (typeof result === "string") passed.push(result);

  const path = resolve(OUT, file);
  await page.screenshot({ path, type: "png" });
  const hash = sha256File(path);
  const bytes = statSync(path).size;
  console.log("wrote", file, `(${bytes} B, sha256=${hash.slice(0, 12)}…)`);
  return {
    file,
    screen,
    viewport: { width: DESK.width, height: DESK.height },
    fixture,
    player,
    assertions: passed,
    assertionSummary: passed.join("; "),
    ok: true,
    sha256: hash,
    bytes,
  };
}

async function qaDevServerReady() {
  try {
    const origin = new URL(BASE).origin;
    const [appRes, govRes, instRes] = await Promise.all([
      fetch(BASE, { signal: AbortSignal.timeout(4_000) }),
      fetch(`${origin}/__qa/fixtures/phase17a-government.json`, {
        signal: AbortSignal.timeout(4_000),
      }),
      fetch(`${origin}/__qa/fixtures/institutions.json`, {
        signal: AbortSignal.timeout(4_000),
      }),
    ]);
    return appRes.ok && govRes.ok && instRes.ok;
  } catch {
    return false;
  }
}

function ensureGovFixture() {
  if (existsSync(GOV_FIXTURE)) return;
  console.log("Generating phase17a-government fixture …");
  execSync(
    "node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/create-phase17a-government-qa-save.ts",
    { cwd: ROOT, stdio: "inherit" },
  );
}

async function maybeStartDevServer() {
  if (await qaDevServerReady()) return null;
  console.log(`Starting Vite dev server on ${DEV_PORT} …`);
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@lorsain/game",
      "exec",
      "vite",
      "--port",
      String(DEV_PORT),
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_BASE_PATH: "/Lorsain-project/" },
      stdio: "pipe",
      shell: true,
    },
  );
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1_000));
    if (await qaDevServerReady()) return child;
  }
  child.kill();
  throw new Error(`Vite QA dev not ready at ${BASE} after 90s`);
}

/** @type {{ file: string; screen: string; query: Record<string, string>; prepare?: (page: import('playwright').Page) => Promise<void>; assert: (page: import('playwright').Page, shotId: string) => Promise<string | string[]> }[]} */
const SHOTS = [
  {
    file: "17b2-government-executive-1280.png",
    screen: "government-executive",
    query: {
      qaFixture: "phase17a-government",
      qaScreen: "executive",
      qaPlayer: GOV_PLAYER,
    },
    async prepare(page) {
      await clickTab(page, "Executive");
    },
    async assert(page, shotId) {
      const titleOk = await page
        .getByText(/^Government$/)
        .first()
        .isVisible()
        .catch(() => false);
      if (!titleOk) throw new Error(`[${shotId}] Government page title not visible`);
      const strip = await page
        .getByText(/Regulation/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!strip) throw new Error(`[${shotId}] Executive power strip missing`);
      const qa = await page.locator("#lorsain-browser-qa-state").getAttribute("data-ready");
      if (qa !== "true") throw new Error(`[${shotId}] QA state not ready`);
      return ["Government visible", "Executive power strip", "qa-ready"];
    },
  },
  {
    file: "17b2-foreign-overview-1280.png",
    screen: "foreign-overview",
    query: { qaFixture: "institutions", qaScreen: "foreign", qaPlayer: INST_PLAYER },
    async prepare(page) {
      try {
        await clickTab(page, "Overview");
      } catch {
        /* already on overview */
      }
    },
    async assert(page, shotId) {
      const fa = await page.locator('[data-qa="foreign-affairs"]').count();
      if (fa < 1) throw new Error(`[${shotId}] foreign-affairs root missing`);
      const strip = await page.locator('[data-qa="fa-summary-strip"]').count();
      if (strip !== 1) throw new Error(`[${shotId}] expected fa-summary-strip once (got ${strip})`);
      return ["data-qa=foreign-affairs", "fa-summary-strip×1"];
    },
  },
  {
    file: "17b2-courts-bench-1280.png",
    screen: "courts-bench",
    query: { qaFixture: "institutions", qaScreen: "courts", qaPlayer: INST_PLAYER },
    async assert(page, shotId) {
      const title = await page
        .getByText(/Constitutional Court/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!title) throw new Error(`[${shotId}] Constitutional Court header missing`);
      const bench = await page.locator(".bench-chart").count();
      if (bench < 1) throw new Error(`[${shotId}] bench chart missing`);
      return ["Constitutional Court", "nine-seat bench chart"];
    },
  },
  {
    file: "17b2-news-front-1280.png",
    screen: "news-front",
    query: { qaFixture: "institutions", qaScreen: "news", qaPlayer: INST_PLAYER },
    async assert(page, shotId) {
      const paper = await page.locator(".news-paper").count();
      if (paper < 1) throw new Error(`[${shotId}] news-paper layout missing`);
      const outlets = await page.locator(".news-outlet-switcher").count();
      if (outlets < 1) throw new Error(`[${shotId}] outlet switcher missing`);
      return ["news-paper", "outlet switcher"];
    },
  },
  {
    file: "17b2-campaign-hq-1280.png",
    screen: "campaign-hq",
    query: { qaFixture: "active-campaign", qaScreen: "campaign", qaPlayer: "NPC009" },
    async assert(page, shotId) {
      const notIdle = await page.getByText(/You are not running an active campaign/i).count();
      if (notIdle > 0) {
        throw new Error(`[${shotId}] active-campaign fixture did not load an active race`);
      }
      const calendar = await page.getByText(/Campaign calendar/i).count();
      const actions = await page.getByText(/Actions/i).count();
      if (calendar < 1 && actions < 1) {
        throw new Error(`[${shotId}] campaign HQ sections missing`);
      }
      return ["active campaign (not idle)", "campaign sections visible"];
    },
  },
];

async function main() {
  ensureGovFixture();
  const devChild = await maybeStartDevServer();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const shots = [];
  const failures = [];

  try {
    for (const spec of SHOTS) {
      try {
        await gotoFixture(page, spec.query);
        await dismissOverlays(page);
        if (spec.prepare) await spec.prepare(page);
        shots.push(
          await captureShot(page, {
            file: spec.file,
            screen: spec.screen,
            fixture: spec.query.qaFixture,
            player: spec.query.qaPlayer,
            assert: () => spec.assert(page, spec.file),
          }),
        );
      } catch (err) {
        const msg = err?.message ?? String(err);
        console.error(`FAIL: ${spec.screen} — ${msg}`);
        failures.push(`${spec.screen}: ${msg}`);
      }
    }
  } finally {
    await browser.close();
    if (devChild) devChild.kill();
  }

  const manifest = {
    phase: "phase17b2-representative",
    commitSha,
    buildTimestamp,
    generatedAt: new Date().toISOString(),
    base: BASE,
    shots: shots.map((s) => ({
      file: s.file,
      screen: s.screen,
      viewport: s.viewport,
      fixture: s.fixture,
      player: s.player,
      assertions: s.assertions,
      assertionSummary: s.assertionSummary,
      ok: s.ok,
      sha256: s.sha256,
      bytes: s.bytes,
    })),
    failures,
  };

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("manifest →", MANIFEST, `(${shots.length} shots, ${failures.length} failures)`);

  if (failures.length > 0) {
    console.warn(`Phase 17B.2 QA failures:\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
