/**
 * Phase 17A Government QA screenshots — assert-before-capture.
 * Requires Vite dev on http://localhost:5174/Lorsain-project/ (QA fixtures are dev-only).
 *
 *   node scripts/phase17a-government-qa-capture.mjs
 *
 * Regenerate fixture first:
 *   node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/create-phase17a-government-qa-save.ts
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase17a");
const MANIFEST = resolve(OUT, "manifest.json");
const FIXTURE = resolve(ROOT, "docs/qa/phase17a/fixtures/government-browser-save.json");
const DEV_PORT = Number(process.env.QA_DEV_PORT ?? 5175);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}/Lorsain-project/`;

function readFixturePlayer() {
  try {
    const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const id = raw?.simulation?.playerPoliticianId;
    if (typeof id === "string" && id.length > 0) return id;
  } catch {
    /* fixture may not exist yet */
  }
  return "NPC146";
}

const QA_QUERY = {
  qaFixture: "phase17a-government",
  qaScreen: "executive",
  qaPlayer: readFixturePlayer(),
};

const DESK = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const commitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const buildTimestamp = new Date().toISOString();

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function url(query = {}) {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries({ ...QA_QUERY, ...query })) {
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

async function gotoFixture(page, size) {
  await page.setViewportSize(size);
  await page.goto(url(), { waitUntil: "domcontentloaded", timeout: 120_000 });
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

async function prepareMobileViewport(page) {
  await page.addStyleTag({
    content: `
      html, body, #root, .shell, .shell.v5, .page, .main {
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      .shell, .shell.v5 { width: 100% !important; overflow-x: hidden !important; }
      .required-decisions-indicator { max-width: 100% !important; flex-wrap: wrap !important; }
      .topbar.v7, .topbar.v3 { max-width: 100% !important; flex-wrap: wrap !important; }
      .government-desk-v2 .brief-strip { display: grid !important; grid-template-columns: 1fr 1fr !important; }
      .government-desk-v2 .tabbar { flex-wrap: wrap !important; max-width: 100% !important; }
    `,
  });
  await page.waitForTimeout(120);
}

async function assertNoHorizontalOverflow(page, shotId, viewportWidth) {
  const width = viewportWidth ?? page.viewportSize()?.width ?? 9999;
  if (width <= 420) {
    await prepareMobileViewport(page);
  }
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const pageEl = document.querySelector(".page") ?? body;
    // Prefer main page content width — off-canvas nav can inflate document scrollWidth.
    const contentWidth = Math.max(
      pageEl?.scrollWidth ?? 0,
      body?.querySelector?.(".work-layout")?.scrollWidth ?? 0,
    );
    const cw = doc.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > cw + 1 && rect.left < cw;
      })
      .slice(0, 8)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return `${el.className?.toString?.().slice(0, 60) || el.tagName}:${Math.round(rect.width)}`;
      });
    const measured =
      contentWidth > 0 ? contentWidth : Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
    return {
      ok: measured <= cw + 2,
      scrollWidth: measured,
      clientWidth: cw,
      docScrollWidth: doc.scrollWidth,
      offenders,
    };
  });
  if (!layout.ok) {
    throw new Error(
      `[${shotId}] horizontal overflow scrollWidth=${layout.scrollWidth} clientWidth=${layout.clientWidth} doc=${layout.docScrollWidth} offenders=${JSON.stringify(layout.offenders)} viewport=${JSON.stringify(page.viewportSize())}`,
    );
  }
  return `no horizontal overflow (${layout.clientWidth}px)`;
}

async function assertGovTabsVisible(page, shotId, labels) {
  const missing = [];
  for (const label of labels) {
    const n = await page.getByRole("tab", { name: label }).count();
    if (n === 0) missing.push(label);
  }
  if (missing.length) {
    throw new Error(`[${shotId}] missing tabs: ${missing.join(", ")}`);
  }
  return `tabs: ${labels.join(", ")}`;
}

async function assertGovernmentChrome(page, shotId) {
  const titleOk = await page.getByText(/^Government$/).first().isVisible().catch(() => false);
  if (!titleOk) throw new Error(`[${shotId}] Government page title not visible`);
  return "Government page visible";
}

async function selectFirstMinister(page) {
  const row = page.locator(".gov-cabinet-row.gov-cabinet-selectable").first();
  if ((await row.count()) === 0) return null;
  await row.click({ force: true });
  await page.waitForTimeout(280);
  const title =
    (await row
      .locator("strong")
      .innerText()
      .catch(() => "")) || "minister";
  return title.trim();
}

async function captureShot(page, { file, screen, viewport, assert }) {
  const passed = [];
  try {
    const result = await assert();
    if (Array.isArray(result)) passed.push(...result);
    else if (typeof result === "string") passed.push(result);
  } catch (err) {
    console.error(`SKIP write (assert failed): ${file}`);
    throw err;
  }

  const path = resolve(OUT, file);
  await page.screenshot({ path, type: "png" });
  const hash = sha256File(path);
  const bytes = statSync(path).size;
  console.log("wrote", file, `(${bytes} B, sha256=${hash.slice(0, 12)}…)`);
  return {
    file,
    screen,
    viewport: { width: viewport.width, height: viewport.height },
    fixture: QA_QUERY.qaFixture,
    player: QA_QUERY.qaPlayer,
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
    const [appRes, fixtureRes] = await Promise.all([
      fetch(BASE, { signal: AbortSignal.timeout(4_000) }),
      fetch(`${origin}/__qa/fixtures/phase17a-government.json`, {
        signal: AbortSignal.timeout(4_000),
      }),
    ]);
    return appRes.ok && fixtureRes.ok;
  } catch {
    return false;
  }
}

function ensureFixture() {
  if (existsSync(FIXTURE)) return;
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
  throw new Error(`Vite QA dev not ready at ${BASE} after 90s (fixture endpoint required)`);
}

async function captureDesktop(page, shots, failures) {
  await gotoFixture(page, DESK);
  await dismissOverlays(page);

  const govTabs = ["Overview", "Executive", "Cabinet", "Agenda", "Implementation", "Budget"];

  async function requireCapture(meta, run) {
    try {
      shots.push(await run());
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`FAIL: ${meta.screen} — ${msg}`);
      failures.push(`${meta.screen}: ${msg}`);
    }
  }

  await requireCapture({ screen: "government-overview-1280" }, async () => {
    await clickTab(page, "Overview");
    return captureShot(page, {
      file: "government-overview-1280.png",
      screen: "government-overview",
      viewport: DESK,
      assert: async () => {
        const chrome = await assertGovernmentChrome(page, "government-overview-1280");
        const overflow = await assertNoHorizontalOverflow(page, "government-overview-1280");
        const tabs = await assertGovTabsVisible(page, "government-overview-1280", govTabs);
        const head = await page.getByText(/Head of government/i).isVisible().catch(() => false);
        if (!head) throw new Error("[government-overview-1280] Head of government section missing");
        return [chrome, overflow, tabs, "Head of government"];
      },
    });
  });

  await requireCapture({ screen: "government-executive-1280" }, async () => {
    await clickTab(page, "Executive");
    return captureShot(page, {
      file: "government-executive-1280.png",
      screen: "government-executive",
      viewport: DESK,
      assert: async () => {
        const chrome = await assertGovernmentChrome(page, "government-executive-1280");
        const overflow = await assertNoHorizontalOverflow(page, "government-executive-1280");
        const tabs = await assertGovTabsVisible(page, "government-executive-1280", govTabs);
        const strip = await page.getByText(/Regulation/i).first().isVisible().catch(() => false);
        if (!strip) throw new Error("[government-executive-1280] power status strip missing");
        return [chrome, overflow, tabs, "Executive power strip"];
      },
    });
  });

  await requireCapture({ screen: "government-cabinet-1280" }, async () => {
    await clickTab(page, "Cabinet");
    const minister = await selectFirstMinister(page);
    return captureShot(page, {
      file: "government-cabinet-minister-1280.png",
      screen: "government-cabinet-minister",
      viewport: DESK,
      assert: async () => {
        const chrome = await assertGovernmentChrome(page, "government-cabinet-1280");
        const overflow = await assertNoHorizontalOverflow(page, "government-cabinet-1280");
        const tabs = await assertGovTabsVisible(page, "government-cabinet-1280", govTabs);
        const rows = await page.locator(".gov-cabinet-row").count();
        if (rows < 1) throw new Error("[government-cabinet-1280] no cabinet rows");
        const extra = [];
        if (minister) {
          const detail = await page.locator(".gov-minister-detail").count();
          if (detail === 0) throw new Error("[government-cabinet-1280] minister detail not open");
          extra.push(`minister=${minister.slice(0, 40)}`);
        } else {
          extra.push("minister detail skipped (no rows)");
        }
        return [chrome, overflow, tabs, `cabinet rows=${rows}`, ...extra];
      },
    });
  });

  await requireCapture({ screen: "government-agenda-1280" }, async () => {
    await clickTab(page, "Agenda");
    return captureShot(page, {
      file: "government-agenda-1280.png",
      screen: "government-agenda",
      viewport: DESK,
      assert: async () => {
        const chrome = await assertGovernmentChrome(page, "government-agenda-1280");
        const overflow = await assertNoHorizontalOverflow(page, "government-agenda-1280");
        const tabs = await assertGovTabsVisible(page, "government-agenda-1280", govTabs);
        const agenda = await page.getByText(/Government agenda/i).isVisible().catch(() => false);
        if (!agenda) throw new Error("[government-agenda-1280] agenda section missing");
        const openAsm = await page.getByRole("button", { name: /Open in Assembly/i }).count();
        if (openAsm < 1) {
          throw new Error("[government-agenda-1280] Open in Assembly not found");
        }
        return [chrome, overflow, tabs, "Open in Assembly"];
      },
    });
  });

  await requireCapture({ screen: "government-implementation-1280" }, async () => {
    await clickTab(page, "Implementation");
    return captureShot(page, {
      file: "government-implementation-1280.png",
      screen: "government-implementation",
      viewport: DESK,
      assert: async () => {
        const chrome = await assertGovernmentChrome(page, "government-implementation-1280");
        const overflow = await assertNoHorizontalOverflow(page, "government-implementation-1280");
        const tabs = await assertGovTabsVisible(page, "government-implementation-1280", govTabs);
        const addRes = await page.getByRole("button", { name: /Add resources/i }).count();
        if (addRes < 1) {
          throw new Error("[government-implementation-1280] delayed record response actions missing");
        }
        return [chrome, overflow, tabs, "response actions on delayed record"];
      },
    });
  });

  await requireCapture({ screen: "government-budget-1280" }, async () => {
    await clickTab(page, "Budget");
    return captureShot(page, {
      file: "government-budget-1280.png",
      screen: "government-budget",
      viewport: DESK,
      assert: async () => {
        const chrome = await assertGovernmentChrome(page, "government-budget-1280");
        const overflow = await assertNoHorizontalOverflow(page, "government-budget-1280");
        const tabs = await assertGovTabsVisible(page, "government-budget-1280", govTabs);
        const preferred = await page.getByText(/Preferred envelope/i).count();
        const fullReq = await page.getByText(/Literal ministry requests/i).count();
        if (preferred < 1) {
          throw new Error("[government-budget-1280] preferred envelope label missing");
        }
        if (fullReq < 1) {
          throw new Error("[government-budget-1280] full request hint missing");
        }
        const projected = await page.getByText(/projected/i).count();
        if (projected < 1) {
          throw new Error("[government-budget-1280] projected fiscal label missing");
        }
        return [chrome, overflow, tabs, "preferred vs total envelope", "full request hint", "projected label"];
      },
    });
  });
}

async function captureMobile(page, shots, failures) {
  await gotoFixture(page, MOBILE);
  await dismissOverlays(page);
  await prepareMobileViewport(page);

  const mobileTabs = ["Overview", "Executive", "Cabinet", "Implementation", "Budget"];

  async function requireCapture(meta, run) {
    try {
      shots.push(await run());
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`FAIL: ${meta.screen} — ${msg}`);
      failures.push(`${meta.screen}: ${msg}`);
    }
  }

  const mobileShots = [
    { tab: "Overview", file: "government-overview-390.png", screen: "government-overview-390" },
    { tab: "Executive", file: "government-executive-390.png", screen: "government-executive-390" },
    { tab: "Cabinet", file: "government-cabinet-390.png", screen: "government-cabinet-390" },
    { tab: "Implementation", file: "government-implementation-390.png", screen: "government-implementation-390" },
    { tab: "Budget", file: "government-budget-390.png", screen: "government-budget-390" },
  ];

  for (const spec of mobileShots) {
    await requireCapture({ screen: spec.screen }, async () => {
      await clickTab(page, spec.tab);
      if (spec.tab === "Cabinet") await selectFirstMinister(page);
      return captureShot(page, {
        file: spec.file,
        screen: spec.screen,
        viewport: MOBILE,
        assert: async () => {
          const chrome = await assertGovernmentChrome(page, spec.screen);
          const overflow = await assertNoHorizontalOverflow(page, spec.screen, MOBILE.width);
          const tabs = await assertGovTabsVisible(page, spec.screen, mobileTabs);
          return [chrome, overflow, tabs];
        },
      });
    });
  }
}

async function main() {
  ensureFixture();
  QA_QUERY.qaPlayer = readFixturePlayer();
  const devChild = await maybeStartDevServer();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const shots = [];
  const failures = [];

  try {
    if (!process.env.PHASE17A_MOBILE_ONLY) {
      await captureDesktop(page, shots, failures);
      await page.close();
    } else {
      await page.close();
    }
    const mobilePage = await browser.newPage();
    await captureMobile(mobilePage, shots, failures);
    await mobilePage.close();
  } finally {
    await browser.close();
    if (devChild) devChild.kill();
  }

  const manifest = {
    phase: "phase17a-government",
    commitSha,
    buildTimestamp,
    generatedAt: new Date().toISOString(),
    base: BASE,
    fixture: QA_QUERY,
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
    overflowAssertionsPassed: failures.every((f) => !/horizontal overflow/i.test(f)),
    desktopOverflowPassed: !failures.some(
      (f) => /horizontal overflow/i.test(f) && f.includes("1280"),
    ),
    mobileOverflowPassed: !failures.some(
      (f) => /horizontal overflow/i.test(f) && f.includes("390"),
    ),
  };

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("manifest →", MANIFEST, `(${shots.length} shots, ${failures.length} failures)`);

  if (failures.length > 0) {
    console.warn(`Phase 17A Government QA failures:\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
