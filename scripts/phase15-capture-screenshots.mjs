/**
 * Phase 15 QA screenshots — assert-before-capture.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 *
 * Never writes a PNG unless DOM assertions for that shot pass.
 * Duplicate PNG content across required distinct shots fails QA (exit 1)
 * unless the pair is listed in ALLOW_DUPES.
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase15/final");
const MANIFEST = resolve(ROOT, "docs/qa/phase15/manifest.json");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
mkdirSync(OUT, { recursive: true });

/** Pairs of filenames allowed to share sha256 (sorted "a::b"). Empty by default. */
const ALLOW_DUPES = new Set([
  // e.g. "party-overview-1440.png::mobile-party-390.png" if intentionally identical
]);

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

async function gotoFixture(page, query, size) {
  await page.setViewportSize(size);
  await page.goto(url(query), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitReady(page);
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

async function selectProvince(page) {
  await page.evaluate(() => {
    const path = document.querySelector(
      "svg.terena-map path.map-province, svg path[data-kind='province'], svg .map-province, svg path",
    );
    path?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(350);
}

/**
 * Assert that at least one locator/text check passes.
 * @param {import('playwright').Page} page
 * @param {Array<{ description: string, check: () => Promise<boolean> }>} checks
 * @param {string} shotId
 */
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

function countAtLeast(page, selector, min) {
  return async () => (await page.locator(selector).count()) >= min;
}

/**
 * Capture only after assertions pass. Never writes on failure.
 * @returns {{ file: string, screen: string, assertions: string[], ok: true, sha256: string, bytes: number }}
 */
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  /** @type {Array<{ file: string, screen: string, assertions: string[], ok: true, sha256: string, bytes: number }>} */
  const shots = [];

  // —— PARTY (shared fixture navigation) ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);

  shots.push(
    await captureShot(page, {
      file: "party-overview-1440.png",
      screen: "party-overview",
      assertions: ["Party|Labour|Overview"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text Party", check: textVisible(page, /Party/i) },
            { description: "text Labour", check: textVisible(page, /Labour/i) },
            { description: "text Overview", check: textVisible(page, /Overview/i) },
          ],
          "party-overview",
        ),
    }),
  );

  await clickTab(page, "Leadership");
  shots.push(
    await captureShot(page, {
      file: "party-leadership-1440.png",
      screen: "party-leadership",
      assertions: ["National Chair|Leadership"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text National Chair", check: textVisible(page, /National Chair/i) },
            { description: "text Leadership", check: textVisible(page, /Leadership/i) },
          ],
          "party-leadership",
        ),
    }),
  );

  // Scroll National Committee into view so this shot is visually distinct.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("h2,h3,h4,.section-card-title,dt,strong")].find((n) =>
      /National Committee/i.test(n.textContent ?? ""),
    );
    el?.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(300);
  shots.push(
    await captureShot(page, {
      file: "national-committee-1440.png",
      screen: "national-committee",
      assertions: ["National Committee"],
      assert: async () => {
        const ok = await textVisible(page, /National Committee/i)();
        if (!ok) throw new Error("[national-committee] National Committee not visible");
        return ["National Committee"];
      },
    }),
  );

  await clickTab(page, "Caucuses");
  shots.push(
    await captureShot(page, {
      file: "caucuses-overview-1440.png",
      screen: "caucuses-overview",
      assertions: ["Membership|Caucus|share %"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text Membership", check: textVisible(page, /Membership/i) },
            { description: "text Caucus", check: textVisible(page, /Caucus/i) },
            { description: "share %", check: textVisible(page, /\d+\s*%/) },
          ],
          "caucuses-overview",
        ),
    }),
  );

  await page.evaluate(() => {
    const el = [...document.querySelectorAll("h2,h3,h4,.section-card-title,strong,p")].find((n) =>
      /Assembly Delegation/i.test(n.textContent ?? ""),
    );
    el?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(350);
  shots.push(
    await captureShot(page, {
      file: "assembly-delegation-1440.png",
      screen: "assembly-delegation",
      assertions: ["Assembly Delegation"],
      assert: async () => {
        const ok = await textVisible(page, /Assembly Delegation/i)();
        if (!ok) {
          throw new Error("[assembly-delegation] Assembly Delegation heading not visible");
        }
        return ["Assembly Delegation"];
      },
    }),
  );

  // —— Whip desk (Assembly) ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  shots.push(
    await captureShot(page, {
      file: "whip-desk-1440.png",
      screen: "whip-desk",
      assertions: ["Whip desk|position controls|chamber"],
      assert: async () => {
        const whipControls = await assertAny(
          page,
          [
            { description: "Whip desk", check: textVisible(page, /Whip desk/i) },
            {
              description: "whip position controls",
              check: locatorVisible(
                page,
                ".whip-position-controls, .rail-whip-controls, .whip-rail-panel",
              ),
            },
            { description: "text Whip", check: textVisible(page, /\bWhip\b/) },
          ],
          "whip-desk",
        ).catch(() => null);
        if (whipControls) return whipControls;
        return assertAny(
          page,
          [
            {
              description: "National Assembly chamber",
              check: textVisible(page, /National Assembly chamber/i),
            },
            {
              description: "chamber aria",
              check: countAtLeast(page, "[aria-label*='chamber' i], .assembly-chamber-stage", 1),
            },
            { description: "text Chamber", check: textVisible(page, /Chamber/i) },
          ],
          "whip-desk",
        );
      },
    }),
  );

  // —— Candidate / primary map (Campaign, then Elections) ——
  let primaryCaptured = false;
  for (const screen of ["campaign", "elections"]) {
    if (primaryCaptured) break;
    await gotoFixture(
      page,
      {
        qaFixture: "institutions",
        qaScreen: screen,
        qaPlayer: screen === "campaign" ? "NPC001" : "NPC001",
      },
      desk,
    );
    await dismissOverlays(page);
    try {
      shots.push(
        await captureShot(page, {
          file: "candidate-primary-map-1440.png",
          screen: "candidate-primary-map",
          assertions: ["Primary|Nomination|candidate polling"],
          assert: async () =>
            assertAny(
              page,
              [
                { description: "text Primary", check: textVisible(page, /Primary/i) },
                { description: "text Nomination", check: textVisible(page, /Nomination/i) },
                {
                  description: "candidate polling",
                  check: textVisible(
                    page,
                    /Primary polling|Nomination poll|primary candidates|Primary field/i,
                  ),
                },
              ],
              "candidate-primary-map",
            ),
        }),
      );
      primaryCaptured = true;
    } catch (err) {
      console.warn(`primary not proven on ${screen}: ${err.message}`);
    }
  }
  if (!primaryCaptured) {
    throw new Error(
      "[candidate-primary-map] FAIL — could not prove Primary/Nomination/candidate polling on Campaign or Elections (refusing to fake)",
    );
  }

  // —— Home 2.0 ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  shots.push(
    await captureShot(page, {
      file: "home-2-1440.png",
      screen: "home-2",
      assertions: ["Action|Briefing"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text Action", check: textVisible(page, /Action/i) },
            { description: "text Briefing", check: textVisible(page, /Briefing/i) },
          ],
          "home-2",
        ),
    }),
  );

  // —— Government 2.0 ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "executive", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  shots.push(
    await captureShot(page, {
      file: "government-2-1440.png",
      screen: "government-2",
      assertions: ["Government tabs"],
      assert: async () => {
        const gov = await textVisible(page, /Government/i)();
        if (!gov) throw new Error("[government-2] missing Government text");
        const tabsOk = await assertAny(
          page,
          [
            {
              description: "tab Cabinet",
              check: async () => (await page.getByRole("tab", { name: "Cabinet" }).count()) > 0,
            },
            {
              description: "tab Agenda",
              check: async () => (await page.getByRole("tab", { name: "Agenda" }).count()) > 0,
            },
            {
              description: "tab Budget",
              check: async () => (await page.getByRole("tab", { name: "Budget" }).count()) > 0,
            },
            {
              description: "tab Implementation",
              check: async () =>
                (await page.getByRole("tab", { name: "Implementation" }).count()) > 0,
            },
          ],
          "government-2",
        );
        return ["Government", tabsOk];
      },
    }),
  );

  // —— History (archive) ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "archive", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  shots.push(
    await captureShot(page, {
      file: "history-15-1440.png",
      screen: "history-15",
      assertions: ["History"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text History", check: textVisible(page, /History/i) },
            { description: "History of Terena", check: textVisible(page, /History of Terena/i) },
          ],
          "history-15",
        ),
    }),
  );

  // —— Situation map selected (no bullseye requirement) ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  await selectProvince(page);
  shots.push(
    await captureShot(page, {
      file: "situation-map-selected-1440.png",
      screen: "situation-map-selected",
      assertions: ["selected province dossier"],
      assert: async () =>
        assertAny(
          page,
          [
            {
              description: "data-qa situation-province-selected",
              check: locatorVisible(page, '[data-qa="situation-province-selected"]'),
            },
            {
              description: "situation-province-card",
              check: locatorVisible(page, ".situation-province-card"),
            },
            { description: "dossier Governor", check: textVisible(page, /Governor/i) },
          ],
          "situation-map-selected",
        ),
    }),
  );

  // —— Mobile party ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    mobile,
  );
  await dismissOverlays(page);
  shots.push(
    await captureShot(page, {
      file: "mobile-party-390.png",
      screen: "mobile-party",
      assertions: ["Party|Labour|Overview"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text Party", check: textVisible(page, /Party/i) },
            { description: "text Labour", check: textVisible(page, /Labour/i) },
            { description: "text Overview", check: textVisible(page, /Overview/i) },
          ],
          "mobile-party",
        ),
    }),
  );

  await browser.close();

  failDuplicateShots(shots);

  const manifest = { shots };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("phase15 capture complete →", OUT);
  console.log("manifest →", MANIFEST, `(${shots.length} shots)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
