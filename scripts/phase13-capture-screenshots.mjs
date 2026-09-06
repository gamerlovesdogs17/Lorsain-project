/**
 * Phase 12 completion + Phase 13 + map-selection QA screenshots.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT12 = resolve(ROOT, "docs/qa/phase12/final");
const OUT13 = resolve(ROOT, "docs/qa/phase13/final");
const OUTMAP = resolve(ROOT, "docs/qa/map-selection/final");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
for (const d of [OUT12, OUT13, OUTMAP]) mkdirSync(d, { recursive: true });

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
  await page.waitForTimeout(500);
}

async function shot(page, dir, name) {
  await page.screenshot({ path: resolve(dir, name), type: "png" });
  console.log("wrote", dir.includes("phase13") ? "p13" : dir.includes("map") ? "map" : "p12", name);
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
  await page.waitForTimeout(150);
}

async function endTurn(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await dismissOverlays(page);
    const end = page.locator("button.btn-end-turn").first();
    if ((await end.count()) === 0) {
      const alt = page.locator("button", { hasText: "End Turn" }).first();
      if ((await alt.count()) === 0) return;
      await alt.click({ force: true });
    } else {
      await end.click({ force: true });
    }
    await page.waitForTimeout(1400);
    await waitReady(page);
    await dismissOverlays(page);
  }
}

async function selectProvince(page) {
  // Click only — avoid programmatic focus(), which can still paint SVG user-space rings
  // in some Chromium builds even when CSS outline is none.
  await page.evaluate(() => {
    const path = document.querySelector(
      "svg.terena-map path.map-province, svg path[data-kind='province'], svg .map-province, svg path",
    );
    path?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };

  // --- Map selection (shared fix) ---
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await selectProvince(page);
  await shot(page, OUTMAP, "situation-province-selected-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "elections", qaPlayer: "NPC001" },
    desk,
  );
  await selectProvince(page);
  await shot(page, OUTMAP, "elections-region-selected-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "electionNight", qaPlayer: "NPC001" },
    desk,
  );
  await selectProvince(page);
  await shot(page, OUTMAP, "election-night-selected-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    mobile,
  );
  await selectProvince(page);
  await shot(page, OUTMAP, "situation-selected-mobile-390.png");

  // Zoom attempt on situation
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await page.evaluate(() => {
    const svg = document.querySelector("svg.terena-map, .terena-map svg, svg");
    svg?.dispatchEvent(new WheelEvent("wheel", { deltaY: -400, bubbles: true }));
  });
  await page.waitForTimeout(300);
  await selectProvince(page);
  await shot(page, OUTMAP, "situation-selected-zoomed-1440.png");

  // --- Phase 12 surfaces ---
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUT12, "home-governing-brief-1440.png");

  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "career",
      qaPlayer: "NPC003",
      qaFocusKind: "Politician",
      qaFocusId: "NPC003",
      qaOpenInspector: "1",
    },
    desk,
  );
  await shot(page, OUT12, "politician-ambition-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUT12, "party-lifecycle-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUT12, "assembly-1440.png");
  const whyBtn = page.locator("button.why-panel-toggle").first();
  if ((await whyBtn.count()) > 0) {
    await whyBtn.click();
    await page.waitForTimeout(300);
    await shot(page, OUT12, "legislative-why-real-engine-1440.png");
  }

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "executive", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUT12, "cabinet-executive-1440.png");

  // Advance a few months so Phase 13 fiscal/agenda have real values
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await endTurn(page, 3);
  await shot(page, OUT13, "home-agenda-fiscal-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "economy", qaPlayer: "NPC003" },
    desk,
  );
  await endTurn(page, 3);
  await shot(page, OUT13, "fiscal-summary-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUT13, "lawbook-implementation-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "executive", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUT13, "cabinet-performance-context-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    mobile,
  );
  await shot(page, OUT13, "home-governing-mobile-390.png");

  // Re-capture map after stronger focus CSS
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await selectProvince(page);
  await shot(page, OUTMAP, "situation-province-selected-1440.png");
  await page
    .locator("button", { hasText: "+" })
    .first()
    .click()
    .catch(() => null);
  await page
    .locator("button", { hasText: "+" })
    .first()
    .click()
    .catch(() => null);
  await page.waitForTimeout(300);
  await selectProvince(page);
  await shot(page, OUTMAP, "situation-selected-zoomed-1440.png");

  await browser.close();
  console.log("phase13 capture complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
