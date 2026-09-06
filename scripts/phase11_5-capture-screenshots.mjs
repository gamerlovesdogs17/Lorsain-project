/**
 * Phase 11.5 / 11.x cleanup screenshot capture.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase11_5/final");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:5174/Lorsain-project/";
mkdirSync(OUT, { recursive: true });

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
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, name), type: "png" });
  console.log("wrote", name);
}

async function gotoFixture(page, query, size) {
  await page.setViewportSize(size);
  await page.goto(url(query), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitReady(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "home-1440.png");

  await page.keyboard.press("Control+K");
  await page.waitForTimeout(500);
  await shot(page, "global-search-1440.png");
  await page.keyboard.type("Labour");
  await page.waitForTimeout(400);
  await shot(page, "search-party-1440.png");
  await page.keyboard.press("Escape");

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
  await shot(page, "politician-profile-1440.png");
  await page
    .waitForSelector(".inspector-drawer, .entity-inspector, [class*='inspector']", {
      timeout: 10_000,
    })
    .catch(() => null);
  await page.waitForTimeout(400);
  await shot(page, "inspector-1440.png");

  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "party",
      qaPlayer: "NPC003",
      qaFocusKind: "Party",
      qaFocusId: "PARTY_LABOUR",
      qaOpenInspector: "1",
    },
    desk,
  );
  await shot(page, "party-dossier-1440.png");
  await shot(page, "inspector-party-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "terena", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "province-dossier-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "situation-room-political-1440.png");
  await page.evaluate(() => {
    const path = document.querySelector(
      "svg path[data-kind='province'], svg .province-path, svg path",
    );
    path?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await shot(page, "situation-room-province-selected-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "assembly-1440.png");
  const whyBtn = await page.locator("button.why-panel-toggle").first();
  if (await whyBtn.count()) {
    await whyBtn.click();
    await page.waitForTimeout(300);
    await shot(page, "why-bill-vote-1440.png");
  }

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "elections", qaPlayer: "NPC001" },
    desk,
  );
  await shot(page, "elections-calendar-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "news", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "news-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    mobile,
  );
  await shot(page, "home-390.png");

  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "career",
      qaPlayer: "NPC003",
      qaFocusKind: "Politician",
      qaFocusId: "NPC003",
    },
    mobile,
  );
  await shot(page, "profile-390.png");

  await browser.close();
  console.log("Phase 11.x screenshots complete →", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
