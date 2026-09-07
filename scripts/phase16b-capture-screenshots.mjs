/**
 * Phase 16b / institutional completion QA screenshots — assert-before-capture.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 *
 * Never writes a PNG unless DOM assertions for that shot pass.
 * Negative assertions fail the shot when wrong-mode / placeholder copy is visible.
 * Duplicate PNG content across required distinct shots fails QA (exit 1)
 * unless the pair is listed in ALLOW_DUPES.
 *
 * Optional shots WARN and skip when unproven.
 * Critical shots (settings, assembly legislation, bill selection) FAIL the run.
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/institutional/final");
const MANIFEST = resolve(ROOT, "docs/qa/institutional/manifest.json");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
mkdirSync(OUT, { recursive: true });

const ALLOW_DUPES = new Set([]);

const CRITICAL = new Set([
  "settings-page",
  "settings-debug-off",
  "legislation-list",
  "selected-bill",
  "candidate-primary-map",
]);

const QUALITATIVE_SHARE = new RegExp(
  [
    "a clear majority",
    "majority",
    "nearly half",
    "around two-fifths",
    "around one-third",
    "roughly one quarter",
    "20–30%",
    "around one-fifth",
    "about one-tenth",
    "a small share",
    "marginal",
    "Dominant",
    "Strong",
    "Moderate",
    "Limited",
    "Marginal",
  ].join("|"),
  "i",
);

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

async function waitTitle(page) {
  await page.waitForSelector(".political-title-screen, .title-actions, #lorsain-title", {
    timeout: 120_000,
  });
  await page
    .getByRole("button", { name: /Settings/i })
    .first()
    .waitFor({
      state: "visible",
      timeout: 60_000,
    });
  await page.waitForTimeout(300);
}

async function gotoFixture(page, query, size) {
  await page.setViewportSize(size);
  await page.goto(url(query), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitReady(page);
}

async function gotoTitle(page, size) {
  await page.setViewportSize(size);
  await page.goto(url({}), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitTitle(page);
}

async function dismissOverlays(page) {
  const backdrop = page.locator("button.shell-drawer-backdrop");
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

async function captureShot(page, { file, screen, assertions, assert }) {
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
    assertions: passed.length ? passed : assertions,
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  /** @type {Array<{ file: string, screen: string, assertions: string[], ok: true, sha256: string, bytes: number }>} */
  const shots = [];
  /** @type {string[]} */
  const criticalFailures = [];
  /** @type {string[]} */
  const warnings = [];

  async function tryCapture(meta, run) {
    try {
      shots.push(await run());
    } catch (err) {
      const msg = err?.message ?? String(err);
      if (CRITICAL.has(meta.screen)) {
        console.error(`CRITICAL FAIL: ${meta.screen} — ${msg}`);
        criticalFailures.push(`${meta.screen}: ${msg}`);
      } else {
        console.warn(`WARN skip ${meta.screen}: ${msg}`);
        warnings.push(`${meta.screen}: ${msg}`);
      }
    }
  }

  // —— SETTINGS (title mode; no qaFixture) ——
  await gotoTitle(page, desk);
  await page
    .getByRole("button", { name: /Settings/i })
    .first()
    .click();
  await page.waitForSelector('[data-qa="settings-page"]', { timeout: 30_000 });
  await page.waitForTimeout(250);

  await tryCapture({ screen: "settings-page" }, async () =>
    captureShot(page, {
      file: "settings-page-1440.png",
      screen: "settings-page",
      assertions: ["settings-page|Settings", "Debug Mode", "not Archive"],
      assert: async () => {
        await assertNoneVisible(page, [/History of Terena/i, /\bArchive\b/i], "settings-page");
        const settingsOk = await assertAny(
          page,
          [
            {
              description: "data-qa settings-page",
              check: locatorVisible(page, '[data-qa="settings-page"]'),
            },
            { description: "text Settings", check: textVisible(page, /^Settings$/i) },
            { description: "text Settings (loose)", check: textVisible(page, /Settings/i) },
          ],
          "settings-page",
        );
        // Prove Debug Mode exists on Advanced, then return to Game so this shot stays distinct.
        await clickTab(page, "Advanced");
        const debugOk = await textVisible(page, /Debug Mode/i)();
        if (!debugOk) throw new Error("[settings-page] Debug Mode text not found on Advanced");
        await clickTab(page, "Game");
        await page.waitForTimeout(200);
        return [settingsOk, "Debug Mode proven on Advanced", "Game section for capture"];
      },
    }),
  );

  await tryCapture({ screen: "settings-debug-off" }, async () => {
    await clickTab(page, "Advanced");
    return captureShot(page, {
      file: "settings-debug-off-1440.png",
      screen: "settings-debug-off",
      assertions: ["Advanced", "Debug Mode", "Player view / off"],
      assert: async () => {
        await assertNoneVisible(page, [/History of Terena/i], "settings-debug-off");
        const advanced = await assertAny(
          page,
          [
            { description: "text Advanced", check: textVisible(page, /Advanced/i) },
            {
              description: "data-qa settings-debug-toggle",
              check: locatorVisible(page, '[data-qa="settings-debug-toggle"]'),
            },
          ],
          "settings-debug-off",
        );
        if (!(await textVisible(page, /Debug Mode/i)())) {
          throw new Error("[settings-debug-off] Debug Mode not visible");
        }
        const toggle = page.locator('[data-qa="settings-debug-toggle"] input[type="checkbox"]');
        if ((await toggle.count()) > 0 && (await toggle.isChecked())) {
          await toggle.click({ force: true });
          await page.waitForTimeout(200);
        }
        const offOk =
          (await textVisible(page, /Player view/i)()) ||
          ((await toggle.count()) > 0 && !(await toggle.isChecked()));
        if (!offOk) throw new Error("[settings-debug-off] expected debug off / Player view");
        return [advanced, "Debug Mode", "debug off"];
      },
    });
  });

  // —— ASSEMBLY ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);

  await tryCapture({ screen: "assembly-overview" }, async () => {
    try {
      await clickTab(page, "Overview");
    } catch {
      /* default tab may already be Overview */
    }
    return captureShot(page, {
      file: "assembly-overview-1440.png",
      screen: "assembly-overview",
      assertions: ["assembly-overview|Overview|chamber"],
      assert: async () =>
        assertAny(
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
            { description: "text Overview", check: textVisible(page, /Overview/i) },
            { description: "text Sitting", check: textVisible(page, /Sitting|chamber|Majority/i) },
          ],
          "assembly-overview",
        ),
    });
  });

  await tryCapture({ screen: "legislation-list" }, async () => {
    await clickTab(page, "Legislation");
    return captureShot(page, {
      file: "legislation-list-1440.png",
      screen: "legislation-list",
      assertions: ["legislation-workspace"],
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

  await tryCapture({ screen: "selected-bill" }, async () => {
    // Ensure Legislation / Bills list is active.
    await clickTab(page, "Legislation").catch(() => null);
    const billsTab = page.getByRole("tab", { name: /^Bills$/i });
    if ((await billsTab.count()) > 0) {
      await billsTab
        .first()
        .click({ force: true })
        .catch(() => null);
      await page.waitForTimeout(200);
    }
    const firstBill = page
      .locator(".legislation-workspace .master-detail-list .entity-row")
      .first();
    if ((await firstBill.count()) === 0) {
      throw new Error("[selected-bill] no bill row to click");
    }
    const billTitle =
      (await firstBill
        .locator(".entity-row-title")
        .innerText()
        .catch(() => "")) || (await firstBill.innerText().catch(() => ""));
    await firstBill.click({ force: true });
    await page.waitForTimeout(320);

    return captureShot(page, {
      file: "selected-bill-1440.png",
      screen: "selected-bill",
      assertions: ["selected-bill in viewport", "bill title", "not bottom dock"],
      assert: async () => {
        const viewport = await selectedBillInViewport(page);
        if (!viewport.ok) {
          throw new Error(`[selected-bill] not in viewport (${viewport.reason})`);
        }
        if (viewport.looksLikeBottomDock) {
          throw new Error("[selected-bill] old bottom-inspector pattern suspected");
        }
        // Prefer master-detail inspector (side panel), not a bottom sheet class if present.
        await assertNoneVisible(
          page,
          [/bill-bottom-sheet/i, /bottom-bill-inspector/i],
          "selected-bill",
        );
        const titleOk =
          (billTitle && (await textVisible(page, billTitle.trim().slice(0, 40))())) ||
          (await page.locator('[data-qa="selected-bill"] .bill-inspector').count()) > 0 ||
          (await textVisible(page, /Version|Sponsor|Committee|Provisions|Procedure/i)());
        if (!titleOk) throw new Error("[selected-bill] bill title / inspector body not visible");
        return [
          "data-qa selected-bill in viewport",
          billTitle ? `title~${billTitle.trim().slice(0, 48)}` : "inspector body",
          "bottom dock absent",
        ];
      },
    });
  });

  await tryCapture({ screen: "committees-panel" }, async () => {
    await clickTab(page, "Committees");
    return captureShot(page, {
      file: "committees-panel-1440.png",
      screen: "committees-panel",
      assertions: ["committees-panel|Committees"],
      assert: async () =>
        assertAny(
          page,
          [
            {
              description: "data-qa committees-panel",
              check: locatorVisible(page, '[data-qa="committees-panel"]'),
            },
            { description: "text Committees", check: textVisible(page, /Committees/i) },
          ],
          "committees-panel",
        ),
    });
  });

  await tryCapture({ screen: "whip-desk" }, async () => {
    await clickTab(page, "Delegation");
    return captureShot(page, {
      file: "whip-desk-1440.png",
      screen: "whip-desk",
      assertions: ["whip-desk|Whip"],
      assert: async () =>
        assertAny(
          page,
          [
            {
              description: "data-qa whip-desk",
              check: locatorVisible(page, '[data-qa="whip-desk"]'),
            },
            { description: "text Whip", check: textVisible(page, /Whip/i) },
            {
              description: "text Delegation",
              check: textVisible(page, /Delegation|Floor leader/i),
            },
          ],
          "whip-desk",
        ),
    });
  });

  // —— PARTY (optional) ——
  await tryCapture({ screen: "party-leadership" }, async () => {
    await gotoFixture(
      page,
      { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
      desk,
    );
    await dismissOverlays(page);
    await clickTab(page, "Leadership");
    const leadershipOk = await locatorVisible(page, '[data-qa="party-leadership"]')();
    if (!leadershipOk && !(await textVisible(page, /National Chair|Leadership/i)())) {
      throw new Error("[party-leadership] Leadership panel not proven");
    }
    // Qualitative shares live on Caucuses when debug internals are off.
    let shareSource = "leadership";
    if (!(await textVisible(page, QUALITATIVE_SHARE)())) {
      await clickTab(page, "Caucuses");
      shareSource = "caucuses";
    }
    return captureShot(page, {
      file: "party-leadership-1440.png",
      screen: "party-leadership",
      assertions: ["party-leadership", "qualitative shares"],
      assert: async () => {
        const shareOk = await textVisible(page, QUALITATIVE_SHARE)();
        if (!shareOk) {
          throw new Error("[party-leadership] qualitative share labels not found");
        }
        // Prefer qualitative bands over exact one-decimal percents when possible.
        return [
          leadershipOk ? "data-qa party-leadership" : "Leadership visited",
          `qualitative shares (${shareSource})`,
        ];
      },
    });
  });

  // —— PRIMARY POLL MAP (critical) ——
  await tryCapture({ screen: "candidate-primary-map" }, async () => {
    const primaryMeta = JSON.parse(
      readFileSync(
        resolve(ROOT, "docs/qa/institutional/fixtures/labour-primary-poll-meta.json"),
        "utf8",
      ),
    );
    const primaryPercents = primaryMeta.nationalShares.map((row) => row.percentLabel);
    await gotoFixture(
      page,
      {
        qaFixture: "labour-primary-poll",
        qaScreen: "campaign",
        qaPlayer: primaryMeta.playerPoliticianId,
      },
      desk,
    );
    await dismissOverlays(page);
    const pollingBtn = page.getByRole("button", { name: /Polling|Primary polling/i }).first();
    if ((await pollingBtn.count()) > 0) {
      await pollingBtn.click({ force: true }).catch(() => null);
      await page.waitForTimeout(280);
    }
    return captureShot(page, {
      file: "candidate-primary-map-1440.png",
      screen: "candidate-primary-map",
      assertions: ["Primary polling", "Published sample", ...primaryPercents],
      assert: async () => {
        await assertNoneVisible(
          page,
          [
            /No race poll yet/i,
            /You are not running an active campaign/i,
            /No open nomination contest/i,
          ],
          "candidate-primary-map",
        );
        for (const pct of primaryPercents) {
          if (!(await textVisible(page, new RegExp(pct.replace(".", "\\.")))())) {
            throw new Error(`[candidate-primary-map] missing published share ${pct}`);
          }
        }
        // Candidate names from the published sample line must be present.
        for (const name of ["Ulric Linden", "Jonah Ravel"]) {
          if (!(await textVisible(page, new RegExp(name))())) {
            throw new Error(`[candidate-primary-map] missing candidate ${name}`);
          }
        }
        if (!(await textVisible(page, /Primary polling/i)())) {
          throw new Error("[candidate-primary-map] missing Primary polling");
        }
        if (!(await textVisible(page, /Published sample/i)())) {
          throw new Error("[candidate-primary-map] missing Published sample");
        }
        return ["primary poll shares", "candidate names", "Published sample", "negatives absent"];
      },
    });
  });

  // —— FOREIGN AFFAIRS (optional) ——
  await tryCapture({ screen: "fa-overview" }, async () => {
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
      assertions: ["fa-overview", "single nav"],
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
        const nav = await page.evaluate(() => {
          const root = document.querySelector('[data-qa="foreign-affairs"]') ?? document.body;
          const topTabs = [
            ...root.querySelectorAll(
              ':scope > .tab-bar [role="tab"], :scope > [role="tablist"] [role="tab"]',
            ),
          ];
          // Fallback: first tablist under foreign-affairs
          const tablist = root.querySelector('[role="tablist"], .tab-bar');
          const labels = [...(tablist?.querySelectorAll('[role="tab"], button') ?? [])].map((el) =>
            (el.textContent ?? "").trim(),
          );
          const overviewNested = document.querySelectorAll(
            '[data-qa="fa-overview"] [role="tab"], [data-qa="fa-overview"] .tab-bar button',
          ).length;
          const hasOverview = labels.some((t) => /Overview/i.test(t));
          const hasRelations = labels.some((t) => /Relations/i.test(t));
          const hasTreaties = labels.some((t) => /Treaties/i.test(t));
          return {
            labels,
            hasOverview,
            hasRelations,
            hasTreaties,
            overviewNested,
            topTabCount: topTabs.length || labels.length,
          };
        });
        if (!(nav.hasOverview && nav.hasRelations && nav.hasTreaties)) {
          throw new Error(
            `[fa-overview] expected Overview/Relations/Treaties nav (got: ${nav.labels.join(", ")})`,
          );
        }
        if (nav.overviewNested > 0) {
          throw new Error(
            `[fa-overview] nested duplicate nav inside fa-overview (${nav.overviewNested} tabs)`,
          );
        }
        return [positive, "Overview|Relations|Treaties single nav", "no nested duplicate"];
      },
    });
  });

  // —— MOBILE ASSEMBLY (optional) ——
  await tryCapture({ screen: "mobile-assembly" }, async () => {
    await gotoFixture(
      page,
      { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
      mobile,
    );
    await dismissOverlays(page);
    await clickTab(page, "Legislation");
    const listOnly = page.locator(
      ".legislation-workspace.assembly-mobile-list-only, .legislation-workspace",
    );
    await listOnly
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => null);
    const row = page.locator(".legislation-workspace .entity-row").first();
    if ((await row.count()) > 0) {
      await row.click({ force: true }).catch(() => null);
      await page.waitForTimeout(280);
    }
    return captureShot(page, {
      file: "mobile-assembly-390.png",
      screen: "mobile-assembly",
      assertions: ["narrow legislation list/detail"],
      assert: async () =>
        assertAny(
          page,
          [
            {
              description: "legislation-workspace",
              check: locatorVisible(page, '[data-qa="legislation-workspace"]'),
            },
            {
              description: "selected-bill",
              check: locatorVisible(page, '[data-qa="selected-bill"]'),
            },
            {
              description: "text Legislation",
              check: textVisible(page, /Legislation|Bills|National Assembly/i),
            },
          ],
          "mobile-assembly",
        ),
    });
  });

  await browser.close();

  if (criticalFailures.length > 0) {
    throw new Error(
      `Institutional QA critical shot failures:\n  - ${criticalFailures.join("\n  - ")}`,
    );
  }

  failDuplicateShots(shots);

  const manifest = {
    phase: "16b-institutional",
    generatedAt: new Date().toISOString(),
    base: BASE,
    warnings,
    shots,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("institutional capture complete →", OUT);
  console.log("manifest →", MANIFEST, `(${shots.length} shots)`);
  if (warnings.length) {
    console.log(`warnings (${warnings.length}):`);
    for (const w of warnings) console.log("  -", w);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
