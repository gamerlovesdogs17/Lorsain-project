/**
 * Phase 11.4 current-HEAD presentation screenshot capture.
 * Requires a running Vite game server (default http://localhost:5174/Lorsain-project/).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase11_4/final");
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
  await page.waitForSelector("#lorsain-browser-qa-state", {
    state: "attached",
    timeout: 120_000,
  });
  await page.waitForFunction(() => {
    const el = document.getElementById("lorsain-browser-qa-state");
    return el?.getAttribute("data-ready") === "true";
  });
  await page.waitForTimeout(700);
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
  const narrow = { width: 900, height: 900 };
  const mobile = { width: 390, height: 844 };

  await page.setViewportSize(desk);
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(1200);
  await shot(page, "title-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "home-desk-1440.png");
  await shot(page, "shell-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "campaign", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "campaign-hq-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "election-results", qaScreen: "elections", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "elections-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "election-results", qaScreen: "elections", qaPlayer: "NPC003", qaTab: "assembly" },
    desk,
  );
  await shot(page, "election-night-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "assembly-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "news", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "news-front-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "archive", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "history-wiki-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "party-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "organizations", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "organizations-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "courts", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "courts-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "economy", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "economy-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "terena", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "map-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    narrow,
  );
  await shot(page, "home-900.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    mobile,
  );
  await shot(page, "home-390.png");

  await browser.close();
  console.log("Phase 11.4 screenshots complete →", OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
