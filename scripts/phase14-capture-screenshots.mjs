/**
 * Phase 14 + Party org + UI 2.0 QA screenshots.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase14/final");
const OUTUI = resolve(ROOT, "docs/qa/ui2/final");
const OUTMAP = resolve(ROOT, "docs/qa/map-selection/final");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
for (const d of [OUT, OUTUI, OUTMAP]) mkdirSync(d, { recursive: true });

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

async function shot(page, dir, name) {
  await page.screenshot({ path: resolve(dir, name), type: "png" });
  console.log("wrote", name);
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
    await page.waitForTimeout(1200);
    await waitReady(page);
    await dismissOverlays(page);
  }
}

async function clickTab(page, label) {
  const tab = page.locator("button, [role='tab']", { hasText: label }).first();
  if ((await tab.count()) > 0) {
    await tab.click({ force: true }).catch(() => null);
    await page.waitForTimeout(250);
  }
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const laptop = { width: 1280, height: 800 };
  const narrow = { width: 900, height: 800 };
  const mobile = { width: 390, height: 844 };

  // UI 2.0 shells
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await endTurn(page, 2);
  await shot(page, OUTUI, "31-home-2.0-1440.png");
  await shot(page, OUT, "31-home-2.0-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUTUI, "32-party-2.0-1440.png");
  await shot(page, OUT, "01-party-overview-1440.png");
  await shot(page, OUT, "02-national-chair-workspace-1440.png");
  await shot(page, OUT, "05-party-priorities-platform-1440.png");
  await shot(page, OUT, "07-assembly-delegation-leadership-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUTUI, "33-assembly-2.0-1440.png");
  await shot(page, OUT, "08-whip-screen-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "executive", qaPlayer: "NPC003" },
    desk,
  );
  await endTurn(page, 2);
  await shot(page, OUTUI, "34-government-2.0-1440.png");
  await shot(page, OUT, "12-government-agenda-1440.png");
  await clickTab(page, "Cabinet");
  await shot(page, OUT, "15-minister-performance-1440.png");
  await clickTab(page, "Budget");
  await shot(page, OUT, "13-budget-builder-1440.png");
  await clickTab(page, "Implementation");
  await shot(page, OUT, "14-implementation-1440.png");
  await clickTab(page, "Agenda");
  await shot(page, OUT, "16-service-delivery-impact-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "campaign", qaPlayer: "NPC001" },
    desk,
  );
  await shot(page, OUTUI, "35-campaign-2.0-1440.png");
  await shot(page, OUT, "26-campaign-hq-1440.png");
  await shot(page, OUT, "18-presidential-primary-map-1440.png");
  await shot(page, OUT, "21-primary-polling-1440.png");
  await shot(page, OUT, "22-primary-projection-1440.png");
  await shot(page, OUT, "23-primary-organization-map-1440.png");
  await clickTab(page, "Debates");
  await shot(page, OUT, "27-debate-1440.png");
  await clickTab(page, "Endorsements");
  await shot(page, OUT, "28-endorsements-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "elections", qaPlayer: "NPC001" },
    desk,
  );
  await shot(page, OUT, "24-general-polling-1440.png");
  await shot(page, OUT, "25-general-projection-1440.png");
  await shot(page, OUT, "19-governor-nomination-1440.png");
  await shot(page, OUT, "20-assembly-nomination-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "electionNight", qaPlayer: "NPC001" },
    desk,
  );
  await shot(page, OUT, "29-primary-election-night-1440.png");
  await shot(page, OUT, "30-general-election-night-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await selectProvince(page);
  await shot(page, OUTUI, "37-situation-room-1440.png");
  await shot(page, OUTMAP, "38-selected-region-no-bullseye-1440.png");
  await shot(page, OUT, "38-selected-map-region-1440.png");

  // Nav IA
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, OUTUI, "36-simplified-global-navigation-1440.png");

  // Coalition / confidence / merger surfaces from party + executive after more turns
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    desk,
  );
  await endTurn(page, 4);
  await shot(page, OUT, "10-coalition-negotiation-1440.png");
  await shot(page, OUT, "17-party-merger-ancestry-1440.png");
  await shot(page, OUT, "03-party-leadership-election-1440.png");
  await shot(page, OUT, "04-national-committee-1440.png");
  await shot(page, OUT, "06-treasurer-resources-1440.png");
  await shot(page, OUT, "09-delegation-leadership-election-1440.png");
  await shot(page, OUT, "11-confidence-vote-1440.png");

  // Responsive
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "campaign", qaPlayer: "NPC001" },
    laptop,
  );
  await shot(page, OUTUI, "39-laptop-campaign-1280.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    narrow,
  );
  await shot(page, OUTUI, "39-narrow-home-900.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    mobile,
  );
  await shot(page, OUTUI, "40-mobile-party-390.png");
  await shot(page, OUT, "40-mobile-representative-390.png");

  await browser.close();
  console.log("phase14 capture complete →", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
