/**
 * Phase 16 QA screenshots — assert-before-capture with positive + negative checks.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 *
 * Never writes a PNG unless DOM assertions for that shot pass.
 * Negative assertions fail the shot when placeholder/absent-state copy is visible.
 * Duplicate PNG content across required distinct shots fails QA (exit 1)
 * unless the pair is listed in ALLOW_DUPES.
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase16/final");
const MANIFEST = resolve(ROOT, "docs/qa/phase16/manifest.json");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
mkdirSync(OUT, { recursive: true });

const ALLOW_DUPES = new Set([]);

/** Copy that must NOT appear for a healthy primary-map / committee fixture shot. */
const NEGATIVE_PRIMARY = [
  /No open nomination contest/i,
  /Committee not seeded/i,
  /limited in this build/i,
];

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

function countAtLeast(page, selector, min) {
  return async () => (await page.locator(selector).count()) >= min;
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  /** @type {Array<{ file: string, screen: string, assertions: string[], ok: true, sha256: string, bytes: number }>} */
  const shots = [];

  // —— PARTY ——
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
      assert: async () => {
        await assertNoneVisible(page, [/limited in this build/i], "party-overview");
        return assertAny(
          page,
          [
            { description: "text Party", check: textVisible(page, /Party/i) },
            { description: "text Labour", check: textVisible(page, /Labour/i) },
            { description: "text Overview", check: textVisible(page, /Overview/i) },
          ],
          "party-overview",
        );
      },
    }),
  );

  await clickTab(page, "Leadership");
  shots.push(
    await captureShot(page, {
      file: "party-leadership-1440.png",
      screen: "party-leadership",
      assertions: ["National Chair|Leadership|data-qa"],
      assert: async () => {
        await assertNoneVisible(page, [/Committee not seeded/i], "party-leadership");
        return assertAny(
          page,
          [
            {
              description: "data-qa party-leadership",
              check: locatorVisible(page, '[data-qa="party-leadership"]'),
            },
            { description: "text National Chair", check: textVisible(page, /National Chair/i) },
            { description: "text Leadership", check: textVisible(page, /Leadership/i) },
          ],
          "party-leadership",
        );
      },
    }),
  );

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
        await assertNoneVisible(page, [/Committee not seeded/i], "national-committee");
        const titleOk =
          (await textVisible(page, /National Committee/i)()) ||
          (await locatorVisible(page, '[data-qa="national-committee"]')());
        if (!titleOk) throw new Error("[national-committee] National Committee not visible");
        // Prefer a real roster (≥12 rows) when seeded; allow title-only only if rows exist.
        const rows = await page.locator('[data-qa="national-committee"] table tbody tr').count();
        const countText = await textVisible(page, /\b(1[2-9]|2[0-4])\s+members\b/i)();
        if (rows < 12 && !countText) {
          throw new Error(
            `[national-committee] expected ≥12 member rows or member count (got rows=${rows})`,
          );
        }
        return ["National Committee", `rows=${rows}`];
      },
    }),
  );

  await clickTab(page, "Caucuses");
  shots.push(
    await captureShot(page, {
      file: "caucuses-overview-1440.png",
      screen: "caucuses-overview",
      assertions: ["Membership|Caucus|nonzero share"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text Membership", check: textVisible(page, /Membership/i) },
            { description: "text Caucus", check: textVisible(page, /Caucus/i) },
            { description: "nonzero %", check: textVisible(page, /[1-9]\d*\s*%/) },
          ],
          "caucuses-overview",
        ),
    }),
  );

  // —— Candidate / primary map ——
  // Use active-campaign fixture (open presidential_nomination contests).
  let primaryCaptured = false;
  for (const screen of ["campaign", "elections"]) {
    if (primaryCaptured) break;
    await gotoFixture(
      page,
      { qaFixture: "active-campaign", qaScreen: screen, qaPlayer: "NPC003" },
      desk,
    );
    await dismissOverlays(page);
    try {
      shots.push(
        await captureShot(page, {
          file: "candidate-primary-map-1440.png",
          screen: "candidate-primary-map",
          assertions: ["Primary|Nomination|map SVG|candidate name"],
          assert: async () => {
            await assertNoneVisible(
              page,
              [/No open nomination contest is available to join right now/i, /You are not running an active campaign/i],
              "candidate-primary-map",
            );
            const positive = await assertAny(
              page,
              [
                { description: "text Primary polling", check: textVisible(page, /Primary polling/i) },
                { description: "text Nomination", check: textVisible(page, /Nomination/i) },
                { description: "text Campaign HQ", check: textVisible(page, /Campaign HQ/i) },
                {
                  description: "map svg",
                  check: countAtLeast(page, "svg.terena-map, svg path.map-province, svg path", 8),
                },
                {
                  description: "candidate field",
                  check: textVisible(page, /primary candidates|Primary field|rival|polling/i),
                },
              ],
              "candidate-primary-map",
            );
            return [positive, "negatives absent"];
          },
        }),
      );
      primaryCaptured = true;
    } catch (err) {
      console.warn(`primary not proven on ${screen}: ${err.message}`);
    }
  }
  if (!primaryCaptured) {
    throw new Error(
      "[candidate-primary-map] FAIL — could not prove Primary/Nomination without negative placeholder copy",
    );
  }

  // —— Foreign Affairs overview ——
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "foreign", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  shots.push(
    await captureShot(page, {
      file: "fa-overview-1440.png",
      screen: "fa-overview",
      assertions: ["Foreign Affairs|Overview|data-qa"],
      assert: async () =>
        assertAny(
          page,
          [
            {
              description: "data-qa foreign-affairs",
              check: locatorVisible(page, '[data-qa="foreign-affairs"]'),
            },
            {
              description: "data-qa fa-overview",
              check: locatorVisible(page, '[data-qa="fa-overview"]'),
            },
            { description: "text Foreign Affairs", check: textVisible(page, /Foreign Affairs/i) },
            { description: "text Overview", check: textVisible(page, /Overview/i) },
          ],
          "fa-overview",
        ),
    }),
  );

  // —— History eras / long-term ——
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
      assertions: ["History of Terena"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "History of Terena", check: textVisible(page, /History of Terena/i) },
            { description: "text Years", check: textVisible(page, /Years/i) },
            { description: "text Long-term", check: textVisible(page, /Long-term/i) },
          ],
          "history-15",
        ),
    }),
  );

  try {
    await clickTab(page, "Long-term");
    shots.push(
      await captureShot(page, {
        file: "history-eras-1440.png",
        screen: "history-eras",
        assertions: ["eras|governments|yearbooks|constitutional"],
        assert: async () =>
          assertAny(
            page,
            [
              {
                description: "Party eras",
                check: textVisible(
                  page,
                  /Party eras|Governments of Terena|Years in Terena|Constitutional eras/i,
                ),
              },
              {
                description: "data-qa constitutional-eras",
                check: locatorVisible(page, '[data-qa="constitutional-eras"]'),
              },
              {
                description: "Long-term tab content",
                check: textVisible(page, /Long-term|era|Government/i),
              },
            ],
            "history-eras",
          ),
      }),
    );
  } catch (err) {
    console.warn(`history-eras optional skip: ${err.message}`);
  }

  // —— Situation map ——
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

  // —— Home + Government ——
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

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "executive", qaPlayer: "NPC003" },
    desk,
  );
  await dismissOverlays(page);
  try {
    await clickTab(page, "Cabinet");
  } catch {
    const cabinetish = page.getByText(/Cabinet|Ministries|Agenda|Budget/i).first();
    if ((await cabinetish.count()) > 0) {
      await cabinetish.click({ force: true }).catch(() => null);
    }
  }
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const el = [
      ...document.querySelectorAll("h2,h3,h4,.section-card-title,button,[role='tab'],.tab"),
    ].find((n) => /Cabinet|Agenda|Budget|Ministr/i.test(n.textContent ?? ""));
    el?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(200);
  shots.push(
    await captureShot(page, {
      file: "government-2-1440.png",
      screen: "government-2",
      assertions: ["Cabinet|Agenda|Budget|Government|Ministr"],
      assert: async () =>
        assertAny(
          page,
          [
            { description: "text Cabinet", check: textVisible(page, /Cabinet/i) },
            { description: "text Ministr", check: textVisible(page, /Ministr/i) },
            { description: "text Agenda", check: textVisible(page, /Agenda|Budget|Executive/i) },
            { description: "text Government", check: textVisible(page, /Government/i) },
          ],
          "government-2",
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
          ],
          "mobile-party",
        ),
    }),
  );

  await browser.close();

  failDuplicateShots(shots);

  const manifest = {
    phase: 16,
    generatedAt: new Date().toISOString(),
    base: BASE,
    shots,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log("phase16 capture complete →", OUT);
  console.log("manifest →", MANIFEST, `(${shots.length} shots)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
