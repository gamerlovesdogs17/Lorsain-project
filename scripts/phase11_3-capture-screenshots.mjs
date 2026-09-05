/**
 * Phase 11.3 current-HEAD browser screenshot capture.
 * Requires a running Vite game server (default http://localhost:5174/Lorsain-project/).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase11_3/final");
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
  await page.waitForTimeout(800);
}

async function shot(page, name, opts = {}) {
  const path = resolve(OUT, name);
  await page.screenshot({ path, fullPage: Boolean(opts.fullPage), type: "png" });
  console.log("wrote", name);
}

async function gotoFixture(page, query, size) {
  await page.setViewportSize(size);
  await page.goto(url(query), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitReady(page);
}

async function clickText(page, re) {
  const handle = await page.evaluateHandle((pattern) => {
    const rx = new RegExp(pattern, "i");
    return [...document.querySelectorAll("button,a,[role='tab'],[role='button']")].find((el) =>
      rx.test((el.textContent || "").replace(/\s+/g, " ")),
    );
  }, re.source);
  const el = handle.asElement();
  if (el) await el.click();
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1 title
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(1500);
  await shot(page, "title-1440.png");

  // 2–3 home / shell (governor)
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    { width: 1440, height: 900 },
  );
  await shot(page, "governor-home-1440.png");
  await shot(page, "global-shell-1440.png");
  await shot(page, "mp-home-1440.png"); // will overwrite with MP next

  // MP home
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC018" },
    { width: 1440, height: 900 },
  );
  await shot(page, "mp-home-1440.png");

  // 4 mobile nav
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "home", qaPlayer: "NPC003" },
    { width: 390, height: 844 },
  );
  await clickText(page, /Open navigation|☰/);
  await page.waitForTimeout(400);
  await shot(page, "mobile-menu-390.png");

  // 5 assembly 1440 / 900
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC018" },
    { width: 1440, height: 900 },
  );
  await shot(page, "assembly-chamber-1440.png");
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(400);
  await shot(page, "assembly-900.png");

  // 6–9 party / caucus / leadership
  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "party",
      qaPlayer: "NPC018",
      qaFocusKind: "Party",
      qaFocusId: "PARTY_CR",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "party-leader-1440.png");

  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "party",
      qaPlayer: "NPC018",
      qaFocusKind: "Caucus",
      qaFocusId: "FAC_CR_LIB",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "caucus-1440.png");

  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "party",
      qaPlayer: "NPC019",
      qaFocusKind: "Caucus",
      qaFocusId: "FAC_CR_MOD",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "caucus-chair-1440.png");

  // 10 assembly delegation (same assembly shot already shows floor/whip)
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC018" },
    { width: 1440, height: 900 },
  );
  await shot(page, "assembly-delegation-leadership-1440.png");

  // 11 campaign modes
  await gotoFixture(
    page,
    { qaFixture: "judicial", qaScreen: "campaign", qaPlayer: "NPC005" },
    { width: 1440, height: 900 },
  );
  await shot(page, "campaign-hq-1440.png");
  for (const [label, file] of [
    ["Forecast", "campaign-forecast-1440.png"],
    ["Polling", "campaign-polling-1440.png"],
    ["Ground Game", "campaign-ground-game-1440.png"],
    ["Previous", "campaign-previous-1440.png"],
  ]) {
    await clickText(page, new RegExp(`^${label}$|${label}`));
    await page.waitForTimeout(700);
    await shot(page, file);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot(page, "campaign-390.png");

  // 12 map selection + drawer
  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "terena",
      qaPlayer: "NPC001",
      qaFocusKind: "Province",
      qaFocusId: "P08",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "map-inspector-selected-1440.png");
  await clickText(page, /View full|full result|Open details|Details/);
  await page.waitForTimeout(600);
  await shot(page, "map-inspector-drawer-1440.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot(page, "mobile-map-selected-390.png");

  // 13–16 elections
  await gotoFixture(
    page,
    {
      qaFixture: "election-results",
      qaScreen: "elections",
      qaPlayer: "NPC001",
      qaFocusKind: "Election",
      qaFocusId: "ELEC_PRES_2030",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "election-night-presidential-rcv.png");
  await clickText(page, /Step|Play|1×|1x/);
  await page.waitForTimeout(800);
  await shot(page, "election-night-presidential-later.png");

  await gotoFixture(
    page,
    {
      qaFixture: "assembly-worker",
      qaScreen: "elections",
      qaPlayer: "NPC146",
      qaFocusKind: "Election",
      qaFocusId: "ELEC_ASM_2030",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "election-night-assembly-partial.png");

  await gotoFixture(
    page,
    {
      qaFixture: "election-results",
      qaScreen: "elections",
      qaPlayer: "NPC001",
      qaFocusKind: "Election",
      qaFocusId: "ELEC_ASM_2030",
    },
    { width: 1440, height: 900 },
  );
  await clickText(page, /Instant|Certified|Final/);
  await page.waitForTimeout(700);
  await shot(page, "election-night-assembly-certified.png");

  await gotoFixture(
    page,
    {
      qaFixture: "election-results",
      qaScreen: "elections",
      qaPlayer: "NPC018",
      qaFocusKind: "Election",
      qaFocusId: "ELEC_GOV_P08_2029",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "election-night-governors.png");

  await gotoFixture(
    page,
    {
      qaFixture: "election-results",
      qaScreen: "elections",
      qaPlayer: "NPC001",
      qaFocusKind: "Election",
      qaFocusId: "ELEC_PASM_P08_2029",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "election-night-provincial-assemblies.png");

  // 17–20 archive / news / constitution
  await gotoFixture(
    page,
    { qaFixture: "election-results", qaScreen: "archive", qaPlayer: "NPC001" },
    { width: 1440, height: 900 },
  );
  await clickText(page, /2029|Year 2029|year/);
  await page.waitForTimeout(800);
  await shot(page, "history-wiki-year.png");
  await clickText(page, /Assembly election|National Assembly|ELEC_ASM|2030 Assembly/);
  await page.waitForTimeout(800);
  await shot(page, "history-wiki-assembly-election.png");
  await clickText(page, /Governor|gubernatorial|2029/);
  await page.waitForTimeout(800);
  await shot(page, "history-wiki-governor-election.png");
  await clickText(page, /Constitution|constitutional document/);
  await page.waitForTimeout(800);
  await shot(page, "constitution-reader.png");

  await gotoFixture(
    page,
    { qaFixture: "election-results", qaScreen: "news", qaPlayer: "NPC001" },
    { width: 1440, height: 900 },
  );
  await shot(page, "news-front-populated.png");
  await clickText(page, /All Press|outlet|Herald|Chronicle|Times|MED_/);
  await page.waitForTimeout(600);
  await shot(page, "news-outlet-front.png");
  await clickText(page, /Read|Open|article|headline/i);
  // click first article-looking button/link
  await page.evaluate(() => {
    const art = [...document.querySelectorAll("button,a,article")].find((el) =>
      /story|read|coverage|headline/i.test(el.className + " " + (el.textContent || "")),
    );
    art?.click();
  });
  await page.waitForTimeout(700);
  await shot(page, "news-article-reader.png");

  // 21 bill
  await gotoFixture(
    page,
    {
      qaFixture: "institutions",
      qaScreen: "assembly",
      qaPlayer: "NPC018",
      qaFocusKind: "Bill",
      qaFocusId: "BILL000001",
    },
    { width: 1440, height: 900 },
  );
  await shot(page, "bill-workspace-1440.png");

  // amendment drafting via constitution UI if present
  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "archive", qaPlayer: "NPC001" },
    { width: 1440, height: 900 },
  );
  await clickText(page, /Constitution|Amend/);
  await page.waitForTimeout(700);
  await shot(page, "constitution-amendment-clause.png");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
