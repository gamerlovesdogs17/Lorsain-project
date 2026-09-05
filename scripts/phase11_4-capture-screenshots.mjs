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
    const el = globalThis.document.getElementById("lorsain-browser-qa-state");
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
    { qaFixture: "active-campaign", qaScreen: "campaign", qaPlayer: "NPC009" },
    desk,
  );
  await shot(page, "campaign-hq-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "election-night-partial", qaScreen: "elections", qaPlayer: "NPC001" },
    desk,
  );
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll("button,[role='tab']")].find((el) =>
      /National Assembly/i.test((el.textContent || "").replace(/\s+/g, " ")),
    );
    tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some(
        (o) => /2030/.test(o.textContent || "") || String(o.value).includes("2030"),
      ),
    );
    const opt = sel
      ? [...sel.options].find(
          (o) => /2030/.test(o.textContent || "") || String(o.value).includes("2030"),
        )
      : null;
    if (sel && opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.waitForTimeout(900);
  await shot(page, "elections-1440.png");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((el) =>
      /Election Night|Replay Election Night|Instant/i.test(
        (el.textContent || "").replace(/\s+/g, " "),
      ),
    );
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  await shot(page, "election-night-1440.png");

  await gotoFixture(
    page,
    { qaFixture: "institutions", qaScreen: "assembly", qaPlayer: "NPC003" },
    desk,
  );
  await shot(page, "assembly-1440.png");
  const lawTabClicked = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      /Law/i.test((el.textContent || "").replace(/\s+/g, " ")),
    );
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (!lawTabClicked) throw new Error("Law & Constitution tab not found");
  await page.waitForSelector(".constitution-browser", { timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.locator(".constitution-browser").scrollIntoViewIfNeeded();
  await shot(page, "constitution-1440.png");

  // Article VII — party system + one-party preview
  const article7Clicked = await page.evaluate(() => {
    const article = [...document.querySelectorAll(".constitution-toc button")].find((el) =>
      /Article\s+VII|Elections|Political Parties/i.test(el.textContent || ""),
    );
    if (!article) return false;
    article.click();
    return true;
  });
  if (!article7Clicked) throw new Error("Constitution Article VII TOC entry not found");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const clause = [...document.querySelectorAll("button.constitution-clause")].find((el) =>
      /Amendable subject/i.test(el.textContent || ""),
    );
    clause?.click();
  });
  await page.waitForTimeout(300);
  await shot(page, "constitution-article-vii-1440.png");
  const onePartySelected = await page.evaluate(() => {
    const selects = [...document.querySelectorAll(".constitution-annotation select")];
    const altSelect = selects[1];
    if (!altSelect) return false;
    const opt = [...altSelect.options].find((o) =>
      /Single designated legal party/i.test(o.textContent || ""),
    );
    if (!opt) return false;
    altSelect.value = opt.value;
    altSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  if (!onePartySelected) throw new Error("One-party alternative not found");
  await page.waitForSelector(".constitution-text-diff", { timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.locator(".constitution-annotation").scrollIntoViewIfNeeded();
  await shot(page, "constitution-one-party-1440.png");
  await shot(page, "constitution-diff-1440.png");

  // Article XII amendment process
  await page.evaluate(() => {
    const article = [...document.querySelectorAll(".constitution-toc button")].find((el) =>
      /Article\s+XII|Amendment/i.test(el.textContent || ""),
    );
    article?.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const clause = [...document.querySelectorAll("button.constitution-clause")].find((el) =>
      /Amendable subject/i.test(el.textContent || ""),
    );
    clause?.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const selects = [...document.querySelectorAll(".constitution-annotation select")];
    const altSelect = selects[1];
    if (!altSelect) return;
    const opt = [...altSelect.options].find((o) => o.value && o.value !== altSelect.value);
    if (opt) {
      altSelect.value = opt.value;
      altSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.waitForTimeout(400);
  await shot(page, "constitution-article-xii-1440.png");

  // Multi-change package staging
  await page.evaluate(() => {
    const add = [...document.querySelectorAll("button")].find((el) =>
      /Add constitutional change to package/i.test(el.textContent || ""),
    );
    add?.click();
  });
  await page.waitForTimeout(300);
  await shot(page, "constitution-package-1440.png");

  // Draft legislation — assembly-worker fixture is a sitting MP
  await gotoFixture(
    page,
    { qaFixture: "assembly-worker", qaScreen: "assembly" },
    desk,
  );
  const draftTabClicked = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"],button')].find((el) =>
      /Introduce/i.test((el.textContent || "").replace(/\s+/g, " ").trim()),
    );
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (draftTabClicked) {
    await page.waitForTimeout(500);
    await shot(page, "bill-builder-1440.png");
    await page.evaluate(() => {
      const select = document.querySelector(".draft-category select");
      if (!select) return;
      const opt = [...select.options].find((o) =>
        /Rail|Bargaining|Child|Housing|Clean/i.test(o.textContent || ""),
      );
      if (opt) {
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.waitForTimeout(400);
    await shot(page, "bill-builder-categorical-1440.png");
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const add = [...document.querySelectorAll("button")].find((el) =>
          /Add provision/i.test(el.textContent || ""),
        );
        add?.click();
      });
      await page.waitForTimeout(200);
    }
    await shot(page, "bill-builder-complex-1440.png");
  } else {
    console.warn("Introduce tab not available for bill-builder screenshots");
  }

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
