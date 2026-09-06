/**
 * Phase 12 screenshot capture.
 * Requires Vite on http://localhost:5174/Lorsain-project/
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase12/final");
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
  await page.waitForTimeout(500);
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
  await shot(page, "politician-dossier-1440.png");
  await shot(page, "inspector-open-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "party", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "party-internal-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "executive", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "cabinet-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "organizations", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "organizations-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "assembly-why-1440.png");
  const why = page.locator("button.why-panel-toggle").first();
  if (await why.count()) {
    await why.click();
    await page.waitForTimeout(300);
    await shot(page, "why-bill-expanded-1440.png");
  }

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "situation", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "situation-political-1440.png");
  await page
    .locator("svg path")
    .first()
    .click({ force: true })
    .catch(() => null);
  await page.waitForTimeout(400);
  await shot(page, "situation-province-selected-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    mobile,
  );
  await shot(page, "home-390.png");

  await browser.close();
  console.log("Phase 12 screenshots →", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
