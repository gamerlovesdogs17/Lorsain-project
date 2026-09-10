/**
 * Pre–Phase 17 QA screenshots — assert-before-capture.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 *
 * Never writes a PNG unless DOM assertions for that shot pass.
 * All listed shots are required: assertion failure exits 1.
 * Duplicate PNG content across required distinct shots fails QA (exit 1)
 * unless the pair is listed in ALLOW_DUPES.
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/prephase17/final");
const MANIFEST = resolve(ROOT, "docs/qa/prephase17/manifest.json");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
mkdirSync(OUT, { recursive: true });

/** Pairs of filenames allowed to share sha256 (sorted "a::b"). Empty by default. */
const ALLOW_DUPES = new Set([]);

const commitSha = execSync("git rev-parse HEAD", {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
const buildTimestamp = new Date().toISOString();

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function url(query = {}) {
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

async function gotoFixture(page, query, size) {
  await page.setViewportSize(size);
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
    await page.waitForTimeout(280);
    return;
  }
  const byButton = page.getByRole("button", { name: label });
  if ((await byButton.count()) > 0) {
    await byButton.first().click({ force: true });
    await page.waitForTimeout(280);
    return;
  }
  throw new Error(`Tab/button not found: ${label}`);
}

async function assertAny(page, checks, shotId) {
  const failed = [];
  for (const c of checks) {
    try {
      if (await c.check()) return c.description;
    } catch (err) {
      failed.push(`${c.description}: ${err?.message ?? err}`);
    }
  }
  const detail = failed.length ? ` (${failed.join("; ")})` : "";
  throw new Error(
    `[${shotId}] assertion failed — expected one of: ${checks.map((c) => c.description).join(" | ")}${detail}`,
  );
}

async function assertNoneVisible(page, patterns, shotId) {
  const body =
    (await page
      .locator("body")
      .innerText()
      .catch(() => "")) || "";
  for (const pattern of patterns) {
    if (pattern.test(body)) {
      throw new Error(`[${shotId}] negative assertion failed — found: ${pattern}`);
    }
  }
}

function textVisible(page, pattern, options = {}) {
  return async () => {
    const loc = page.getByText(pattern, { exact: options.exact ?? false });
    const n = await loc.count();
    if (n === 0) return false;
    for (let i = 0; i < Math.min(n, 8); i++) {
      if (
        await loc
          .nth(i)
          .isVisible()
          .catch(() => false)
      )
        return true;
    }
    return false;
  };
}

function locatorVisible(page, selector) {
  return async () => {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) return false;
    return loc.isVisible().catch(() => false);
  };
}

async function selectedBillInViewport(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-qa="selected-bill"]');
    if (!el) return { ok: false, reason: "missing selected-bill" };
    const r = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      r.width > 0 &&
      r.height > 0 &&
      r.top < window.innerHeight &&
      r.bottom > 0;
    const looksLikeBottomDock =
      r.top > window.innerHeight * 0.72 && r.height < window.innerHeight * 0.45;
    return {
      ok: visible,
      reason: visible ? "in viewport" : `top=${r.top.toFixed(0)} h=${window.innerHeight}`,
      looksLikeBottomDock,
      title:
        el.querySelector(".section-card-title, h2, h3, .entity-row-title")?.textContent?.trim() ??
        "",
    };
  });
}

async function assertAssemblySummaryUnique(page, shotId) {
  const stripCount = await page.locator('[data-qa="assembly-summary-strip"]').count();
  if (stripCount !== 1) {
    throw new Error(`[${shotId}] expected assembly-summary-strip count === 1 (got ${stripCount})`);
  }
  const dupes = await page.evaluate(() => {
    const strip = document.querySelector('[data-qa="assembly-summary-strip"]');
    const overview = document.querySelector('[data-qa="assembly-overview"]');
    const kickersIn = (root) =>
      [...(root?.querySelectorAll(".brief-strip-item .kicker") ?? [])].map((el) =>
        (el.textContent ?? "").trim(),
      );
    const inStrip = kickersIn(strip);
    const sittingInStrip = inStrip.filter((t) => /^Sitting$/i.test(t)).length;
    const majorityInStrip = inStrip.filter((t) => /^Majority$/i.test(t)).length;
    // Overview must not host a second Sitting/Majority BriefStrip.
    const overviewStrips = [...(overview?.querySelectorAll(".brief-strip") ?? [])].filter(
      (el) => !strip?.contains(el),
    );
    let sittingOutside = 0;
    let majorityOutside = 0;
    for (const s of overviewStrips) {
      for (const k of kickersIn(s)) {
        if (/^Sitting$/i.test(k)) sittingOutside += 1;
        if (/^Majority$/i.test(k)) majorityOutside += 1;
      }
    }
    return { sittingInStrip, majorityInStrip, sittingOutside, majorityOutside };
  });
  if (dupes.sittingInStrip !== 1 || dupes.majorityInStrip !== 1) {
    throw new Error(
      `[${shotId}] assembly-summary-strip missing Sitting/Majority (sitting=${dupes.sittingInStrip}, majority=${dupes.majorityInStrip})`,
    );
  }
  if (dupes.sittingOutside > 0 || dupes.majorityOutside > 0) {
    throw new Error(
      `[${shotId}] duplicate Sitting/Majority overview strip (sittingOutside=${dupes.sittingOutside}, majorityOutside=${dupes.majorityOutside})`,
    );
  }
  return [
    "assembly-summary-strip count===1",
    "Sitting/Majority once in header strip",
    "no Overview Sitting/Majority duplicate",
  ];
}

async function assertMobileBillTabClear(page, shotId) {
  const layout = await page.evaluate(() => {
    const content =
      document.querySelector('[data-qa="bill-amendments"]') ??
      document.querySelector(".bill-tab-body") ??
      document.querySelector('[data-qa="selected-bill"]');
    const nav = document.querySelector(".mobile-command-bar");
    if (!content) return { ok: false, reason: "missing bill tab content" };
    content.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = content.getBoundingClientRect();
    const overflowX =
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    if (overflowX) return { ok: false, reason: "horizontal page overflow" };
    if (!nav) {
      return {
        ok: r.width > 0 && r.height > 0 && r.top < window.innerHeight,
        reason: "no mobile-command-bar; content visible",
      };
    }
    const nr = nav.getBoundingClientRect();
    const visibleAboveNav = Math.min(r.bottom, nr.top) - Math.max(r.top, 0);
    if (visibleAboveNav < 24) {
      return {
        ok: false,
        reason: `bill tab covered by bottom nav (visibleAboveNav=${visibleAboveNav.toFixed(0)})`,
      };
    }
    // Substantial overlap of content rect under the nav bar is a fail.
    const overlap = Math.max(0, Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top));
    if (overlap > 12 && r.bottom > nr.top + 12 && visibleAboveNav < 48) {
      return { ok: false, reason: `bottom nav overlaps content (${overlap.toFixed(0)}px)` };
    }
    return { ok: true, reason: "tab visible above bottom nav, no overflow" };
  });
  if (!layout.ok) throw new Error(`[${shotId}] ${layout.reason}`);
  return layout.reason;
}

/**
 * Capture only after assertions pass. Never writes on failure.
 */
async function captureShot(page, { file, screen, viewport, assertions, assert }) {
  const passed = [];
  try {
    const result = await assert();
    if (Array.isArray(result)) passed.push(...result);
    else if (typeof result === "string") passed.push(result);
    else passed.push(...assertions);
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
    assertions: passed.length ? passed : assertions,
    assertionSummary: (passed.length ? passed : assertions).join("; "),
    ok: true,
    sha256: hash,
    bytes,
  };
}

function failDuplicateShots(shots) {
  const byHash = new Map();
  for (const s of shots) {
    const list = byHash.get(s.sha256) ?? [];
    list.push(s.file);
    byHash.set(s.sha256, list);
  }
  const problems = [];
  for (const [hash, files] of byHash) {
    if (files.length < 2) continue;
    const unique = [...new Set(files)].sort();
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = `${unique[i]}::${unique[j]}`;
        if (ALLOW_DUPES.has(key)) continue;
        problems.push(`${unique[i]} ≡ ${unique[j]} (sha256=${hash.slice(0, 16)}…)`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `QA duplicate screenshots (required distinct shots share content):\n  - ${problems.join("\n  - ")}`,
    );
  }
}

async function openFirstBill(page) {
  await clickTab(page, "Legislation").catch(() => null);
  const billsTab = page.getByRole("tab", { name: /^Bills$/i });
  if ((await billsTab.count()) > 0) {
    await billsTab
      .first()
      .click({ force: true })
      .catch(() => null);
    await page.waitForTimeout(200);
  }
  const firstBill = page.locator(".legislation-workspace .master-detail-list .entity-row").first();
  if ((await firstBill.count()) === 0) {
    const fallback = page.locator(".legislation-workspace .entity-row").first();
    if ((await fallback.count()) === 0) throw new Error("no bill row to click");
    const title =
      (await fallback
        .locator(".entity-row-title")
        .innerText()
        .catch(() => "")) || (await fallback.innerText().catch(() => ""));
    await fallback.click({ force: true });
    await page.waitForTimeout(320);
    return title;
  }
  const billTitle =
    (await firstBill
      .locator(".entity-row-title")
      .innerText()
      .catch(() => "")) || (await firstBill.innerText().catch(() => ""));
  await firstBill.click({ force: true });
  await page.waitForTimeout(320);
  return billTitle;
}

async function assertSelectedBill(page, shotId, billTitle) {
  const viewport = await selectedBillInViewport(page);
  if (!viewport.ok) {
    throw new Error(`[${shotId}] not in viewport (${viewport.reason})`);
  }
  if (viewport.looksLikeBottomDock) {
    throw new Error(`[${shotId}] old bottom-inspector pattern suspected`);
  }
  await assertNoneVisible(page, [/bill-bottom-sheet/i, /bottom-bill-inspector/i], shotId);
  const titleOk =
    (billTitle && (await textVisible(page, billTitle.trim().slice(0, 40))())) ||
    (await page.locator('[data-qa="selected-bill"] .bill-inspector').count()) > 0 ||
    (await textVisible(page, /Version|Sponsor|Committee|Provisions|Procedure/i)());
  if (!titleOk) throw new Error(`[${shotId}] bill title / inspector body not visible`);
  return [
    "data-qa selected-bill in viewport",
    billTitle ? `title~${billTitle.trim().slice(0, 48)}` : "inspector body",
    "opens immediately / bottom dock absent",
  ];
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  /** @type {Array<{ file: string, screen: string, viewport: { width: number, height: number }, assertions: string[], assertionSummary: string, ok: true, sha256: string, bytes: number }>} */
  const shots = [];
  /** @type {string[]} */
  const failures = [];

  async function requireCapture(meta, run) {
    try {
      shots.push(await run());
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.error(`FAIL: ${meta.screen} — ${msg}`);
      failures.push(`${meta.screen}: ${msg}`);
    }
  }

  // —— SETTINGS (in-play via qaScreen=settings; also prove via title path if needed) ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "settings", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  await page.waitForSelector('[data-qa="settings-page"]', { timeout: 30_000 });

  await requireCapture({ screen: "settings-accessibility" }, async () => {
    await clickTab(page, "Accessibility");
    return captureShot(page, {
      file: "settings-accessibility-1440.png",
      screen: "settings-accessibility",
      viewport: desk,
      assertions: ["Accessibility", "Reduced Motion once"],
      assert: async () => {
        const section = await assertAny(
          page,
          [
            { description: "text Accessibility", check: textVisible(page, /Accessibility/i) },
            {
              description: "data-qa settings-page",
              check: locatorVisible(page, '[data-qa="settings-page"]'),
            },
          ],
          "settings-accessibility",
        );
        const reduced = page.getByText(/Reduced [Mm]otion/i);
        const n = await reduced.count();
        if (n !== 1) {
          throw new Error(
            `[settings-accessibility] Expected Reduced Motion exactly once (got ${n})`,
          );
        }
        if (
          !(await reduced
            .first()
            .isVisible()
            .catch(() => false))
        ) {
          throw new Error("[settings-accessibility] Reduced Motion not visible");
        }
        return [section, "Reduced Motion appears once"];
      },
    });
  });

  await requireCapture({ screen: "settings-notifications" }, async () => {
    await clickTab(page, "Notifications");
    return captureShot(page, {
      file: "settings-notifications-1440.png",
      screen: "settings-notifications",
      viewport: desk,
      assertions: ["Notifications section"],
      assert: async () =>
        assertAny(
          page,
          [
            {
              description: "SectionCard Notifications",
              check: textVisible(page, /^Notifications$/i),
            },
            {
              description: "notifications copy",
              check: textVisible(page, /Broad attention categories|Notifications/i),
            },
          ],
          "settings-notifications",
        ),
    });
  });

  await requireCapture({ screen: "settings-advanced" }, async () => {
    await clickTab(page, "Advanced");
    return captureShot(page, {
      file: "settings-advanced-1440.png",
      screen: "settings-advanced",
      viewport: desk,
      assertions: ["Advanced", "Debug Mode"],
      assert: async () => {
        const advanced = await assertAny(
          page,
          [
            { description: "text Advanced", check: textVisible(page, /Advanced/i) },
            {
              description: "data-qa settings-debug-toggle",
              check: locatorVisible(page, '[data-qa="settings-debug-toggle"]'),
            },
          ],
          "settings-advanced",
        );
        if (!(await textVisible(page, /Debug Mode/i)())) {
          throw new Error("[settings-advanced] Debug Mode not present");
        }
        return [advanced, "Debug Mode present"];
      },
    });
  });

  // Debug Mode must not appear on Archive / History (settings-only; assertion only, no PNG).
  try {
    await gotoFixture(
      page,
      { qaFixture: "institutions", qaScreen: "archive", qaPlayer: "NPC003" },
      desk,
    );
    await dismissOverlays(page);
    await assertAny(
      page,
      [
        { description: "text History", check: textVisible(page, /History/i) },
        { description: "History of Terena", check: textVisible(page, /History of Terena/i) },
      ],
      "settings-not-in-archive",
    );
    const debugToggle = await page.locator('[data-qa="settings-debug-toggle"]').count();
    if (debugToggle > 0) {
      throw new Error("[settings-not-in-archive] settings-debug-toggle present on Archive");
    }
    const debugModeAsControl = await page.evaluate(() => {
      const body = document.body?.innerText ?? "";
      if (!/Debug Mode/i.test(body)) return false;
      return Boolean(
        document.querySelector('[data-qa="settings-page"]') ||
        [...document.querySelectorAll("strong, label")].some((el) =>
          /^Debug Mode$/i.test((el.textContent ?? "").trim()),
        ),
      );
    });
    if (debugModeAsControl) {
      throw new Error("[settings-not-in-archive] Debug Mode control found on Archive");
    }
    console.log("ok: Debug Mode not in Archive");
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error(`FAIL: settings-not-in-archive — ${msg}`);
    failures.push(`settings-not-in-archive: ${msg}`);
  }

  // —— ASSEMBLY DESKTOP ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);

  await requireCapture({ screen: "assembly-overview" }, async () => {
    try {
      await clickTab(page, "Overview");
    } catch {
      /* default may already be Overview */
    }
    return captureShot(page, {
      file: "assembly-overview-1440.png",
      screen: "assembly-overview",
      viewport: desk,
      assertions: ["assembly-summary-strip×1", "no Sitting/Majority duplicate"],
      assert: async () => {
        await assertAny(
          page,
          [
            {
              description: "data-qa assembly-overview",
              check: locatorVisible(page, '[data-qa="assembly-overview"]'),
            },
            {
              description: "text National Assembly",
              check: textVisible(page, /National Assembly/i),
            },
          ],
          "assembly-overview",
        );
        return assertAssemblySummaryUnique(page, "assembly-overview");
      },
    });
  });

  await requireCapture({ screen: "legislation-list" }, async () => {
    await clickTab(page, "Legislation");
    return captureShot(page, {
      file: "legislation-list-1440.png",
      screen: "legislation-list",
      viewport: desk,
      assertions: ["legislation-workspace", "bill rows"],
      assert: async () => {
        const ok = await assertAny(
          page,
          [
            {
              description: "data-qa legislation-workspace",
              check: locatorVisible(page, '[data-qa="legislation-workspace"]'),
            },
            { description: "text Legislation", check: textVisible(page, /Legislation/i) },
            { description: "text Bills", check: textVisible(page, /Bills|Search bills/i) },
          ],
          "legislation-list",
        );
        const rows = await page.locator(".legislation-workspace .entity-row").count();
        if (rows < 1) throw new Error("[legislation-list] no bill rows in workspace");
        return [ok, `bill rows=${rows}`];
      },
    });
  });

  await requireCapture({ screen: "selected-bill" }, async () => {
    const billTitle = await openFirstBill(page);
    return captureShot(page, {
      file: "selected-bill-1440.png",
      screen: "selected-bill",
      viewport: desk,
      assertions: ["selected-bill in viewport", "not bottom dock"],
      assert: async () => assertSelectedBill(page, "selected-bill", billTitle),
    });
  });

  // —— ASSEMBLY MOBILE ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    mobile,
  );
  await dismissOverlays(page);

  await requireCapture({ screen: "assembly-overview-390" }, async () => {
    try {
      await clickTab(page, "Overview");
    } catch {
      /* already overview */
    }
    return captureShot(page, {
      file: "assembly-overview-390.png",
      screen: "assembly-overview-390",
      viewport: mobile,
      assertions: ["assembly-summary-strip×1", "no Sitting/Majority duplicate"],
      assert: async () => {
        await assertAny(
          page,
          [
            {
              description: "data-qa assembly-overview",
              check: locatorVisible(page, '[data-qa="assembly-overview"]'),
            },
            {
              description: "text National Assembly",
              check: textVisible(page, /National Assembly/i),
            },
          ],
          "assembly-overview-390",
        );
        return assertAssemblySummaryUnique(page, "assembly-overview-390");
      },
    });
  });

  await requireCapture({ screen: "legislation-list-390" }, async () => {
    await clickTab(page, "Legislation");
    return captureShot(page, {
      file: "legislation-list-390.png",
      screen: "legislation-list-390",
      viewport: mobile,
      assertions: ["legislation-workspace"],
      assert: async () => {
        const ok = await assertAny(
          page,
          [
            {
              description: "data-qa legislation-workspace",
              check: locatorVisible(page, '[data-qa="legislation-workspace"]'),
            },
            { description: "text Legislation", check: textVisible(page, /Legislation|Bills/i) },
          ],
          "legislation-list-390",
        );
        const rows = await page.locator(".legislation-workspace .entity-row").count();
        if (rows < 1) throw new Error("[legislation-list-390] no bill rows");
        return [ok, `bill rows=${rows}`];
      },
    });
  });

  await requireCapture({ screen: "selected-bill-390" }, async () => {
    const billTitle = await openFirstBill(page);
    return captureShot(page, {
      file: "selected-bill-390.png",
      screen: "selected-bill-390",
      viewport: mobile,
      assertions: ["selected-bill in viewport", "not bottom dock"],
      assert: async () => assertSelectedBill(page, "selected-bill-390", billTitle),
    });
  });

  await requireCapture({ screen: "selected-bill-tab-390" }, async () => {
    // Ensure a bill is selected, then switch to Amendments (or a later tab).
    if ((await page.locator('[data-qa="selected-bill"]').count()) === 0) {
      await openFirstBill(page);
    }
    const laterTabs = ["Amendments", "Support", "Procedure", "History"];
    let switched = null;
    for (const label of laterTabs) {
      try {
        await clickTab(page, label);
        switched = label;
        break;
      } catch {
        /* try next */
      }
    }
    if (!switched) throw new Error("[selected-bill-tab-390] could not switch to Amendments+ tab");
    await page.waitForTimeout(250);
    return captureShot(page, {
      file: "selected-bill-tab-390.png",
      screen: "selected-bill-tab-390",
      viewport: mobile,
      assertions: ["Amendments+ tab visible", "no overflow", "bottom nav clear"],
      assert: async () => {
        const tabOk =
          (switched === "Amendments" &&
            ((await locatorVisible(page, '[data-qa="bill-amendments"]')()) ||
              (await textVisible(page, /No amendments|Amendment/i)()))) ||
          (await textVisible(page, new RegExp(switched, "i"))()) ||
          (await locatorVisible(page, ".bill-tab-body")());
        if (!tabOk) {
          throw new Error(`[selected-bill-tab-390] tab ${switched} not visible/reachable`);
        }
        const clear = await assertMobileBillTabClear(page, "selected-bill-tab-390");
        return [`tab=${switched}`, "visible/reachable", clear];
      },
    });
  });

  // —— FOREIGN AFFAIRS ——
  await requireCapture({ screen: "fa-overview" }, async () => {
    await gotoFixture(
      page,
      { qaFixture: "institutions", qaScreen: "foreign", qaPlayer: "NPC003" },
      desk,
    );
    await dismissOverlays(page);
    try {
      await clickTab(page, "Overview");
    } catch {
      /* already on overview */
    }
    return captureShot(page, {
      file: "fa-overview-1440.png",
      screen: "fa-overview",
      viewport: desk,
      assertions: ["fa-summary-strip×1", "top-level nav once"],
      assert: async () => {
        const positive = await assertAny(
          page,
          [
            {
              description: "data-qa fa-overview",
              check: locatorVisible(page, '[data-qa="fa-overview"]'),
            },
            {
              description: "data-qa foreign-affairs",
              check: locatorVisible(page, '[data-qa="foreign-affairs"]'),
            },
            { description: "text Foreign Affairs", check: textVisible(page, /Foreign Affairs/i) },
          ],
          "fa-overview",
        );
        const stripCount = await page.locator('[data-qa="fa-summary-strip"]').count();
        if (stripCount !== 1) {
          throw new Error(
            `[fa-overview] expected fa-summary-strip exactly once (got ${stripCount})`,
          );
        }
        const nav = await page.evaluate(() => {
          const root = document.querySelector('[data-qa="foreign-affairs"]') ?? document.body;
          const tablists = [...root.querySelectorAll('[role="tablist"], .tabbar, .tab-bar')];
          // Top-level: first tablist under foreign-affairs page (not nested in panels).
          const top = tablists[0];
          const labels = [...(top?.querySelectorAll('[role="tab"], button') ?? [])].map((el) =>
            (el.textContent ?? "").trim(),
          );
          const overviewNested = document.querySelectorAll(
            '[data-qa="fa-overview"] [role="tablist"], [data-qa="fa-overview"] .tabbar',
          ).length;
          const topLevelCount = tablists.filter((tl) => {
            const text = (tl.textContent ?? "").trim();
            return /Overview/i.test(text) && /Relations/i.test(text);
          }).length;
          return {
            labels,
            hasOverview: labels.some((t) => /Overview/i.test(t)),
            hasRelations: labels.some((t) => /Relations/i.test(t)),
            hasTreaties: labels.some((t) => /Treaties/i.test(t)),
            overviewNested,
            topLevelCount,
          };
        });
        if (!(nav.hasOverview && nav.hasRelations && nav.hasTreaties)) {
          throw new Error(
            `[fa-overview] expected Overview/Relations/Treaties nav (got: ${nav.labels.join(", ")})`,
          );
        }
        if (nav.topLevelCount !== 1) {
          throw new Error(
            `[fa-overview] expected top-level FA nav exactly once (got ${nav.topLevelCount})`,
          );
        }
        if (nav.overviewNested > 0) {
          throw new Error(
            `[fa-overview] nested duplicate nav inside fa-overview (${nav.overviewNested})`,
          );
        }
        return [positive, "fa-summary-strip exactly once", "top-level nav once"];
      },
    });
  });

  await browser.close();

  if (failures.length > 0) {
    throw new Error(`Prephase17 QA shot failures:\n  - ${failures.join("\n  - ")}`);
  }

  if (shots.length === 0) {
    throw new Error("Prephase17 QA produced zero shots");
  }

  failDuplicateShots(shots);

  const manifest = {
    phase: "prephase17",
    commitSha,
    buildTimestamp,
    generatedAt: new Date().toISOString(),
    base: BASE,
    shots: shots.map((s) => ({
      file: s.file,
      screen: s.screen,
      viewport: s.viewport,
      assertions: s.assertions,
      assertionSummary: s.assertionSummary,
      ok: s.ok,
      sha256: s.sha256,
      bytes: s.bytes,
    })),
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("prephase17 capture complete →", OUT);
  console.log("manifest →", MANIFEST, `(${shots.length} shots)`);
  console.log(`commitSha=${commitSha.slice(0, 12)}… buildTimestamp=${buildTimestamp}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
