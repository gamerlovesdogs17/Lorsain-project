/**
 * Tablet interaction smoke (not full visual suite).
 * Requires Vite QA fixtures.
 *
 *   node scripts/final-tablet-interaction.mjs
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DEV_PORT = Number(process.env.QA_DEV_PORT ?? 5176);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}/`;
const OUT = resolve(ROOT, "docs/qa/final-redesign/tablet-interaction.json");
const commitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();

function qaUrl(screen, fixture = "institutions", player = "NPC003") {
  const u = new URL(BASE);
  u.searchParams.set("qaFixture", fixture);
  u.searchParams.set("qaScreen", screen);
  u.searchParams.set("qaPlayer", player);
  return u.toString();
}

async function waitReady(page) {
  await page.waitForSelector("#lorsain-browser-qa-state", { state: "attached", timeout: 120_000 });
  await page.waitForFunction(() => {
    const el = globalThis.document.getElementById("lorsain-browser-qa-state");
    return el?.getAttribute("data-ready") === "true";
  });
}

async function noOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
  );
}

async function main() {
  let server = null;
  const results = [];
  try {
    if (!process.env.QA_BASE_URL) {
      server = spawn(
        "pnpm",
        [
          "--filter",
          "@lorsain/game",
          "exec",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          String(DEV_PORT),
        ],
        { cwd: ROOT, shell: true, stdio: "pipe" },
      );
      for (let i = 0; i < 40; i++) {
        try {
          const r = await fetch(BASE);
          if (r.ok || r.status === 404) break;
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const browser = await chromium.launch({ headless: true });
    for (const vp of [
      { name: "tabletPortrait", width: 834, height: 1194 },
      { name: "tabletLandscape", width: 1024, height: 768 },
    ]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const cases = [
        { id: "nav-home-assembly", screen: "home" },
        { id: "assembly-tabs", screen: "assembly" },
        { id: "government", screen: "executive" },
        { id: "party", screen: "party" },
        { id: "courts", screen: "courts" },
        { id: "elections", screen: "elections" },
        { id: "foreign", screen: "foreign" },
      ];
      for (const c of cases) {
        await page.goto(qaUrl(c.screen), { waitUntil: "domcontentloaded", timeout: 120_000 });
        await waitReady(page);
        const titleBad = (await page.locator("button", { hasText: /^New Game$/i }).count()) > 0;
        const overflowOk = await noOverflow(page);
        // Try open More / drawer if present
        const more = page.locator("button", { hasText: /^More$/i }).first();
        if ((await more.count()) > 0) {
          await more.click({ force: true }).catch(() => null);
          await page.waitForTimeout(200);
          await page.keyboard.press("Escape").catch(() => null);
        }
        // Tab tap if TabBar present
        const tab = page.locator("[role='tab'], .tabbar button, .final-tabbar button").nth(1);
        if ((await tab.count()) > 0) {
          await tab.click({ force: true }).catch(() => null);
          await page.waitForTimeout(150);
        }
        results.push({
          viewport: vp.name,
          case: c.id,
          screen: c.screen,
          notTitle: !titleBad,
          noPageOverflow: overflowOk,
          ok: !titleBad && overflowOk,
        });
      }
      await page.close();
    }
    await browser.close();
    const ok = results.every((r) => r.ok);
    mkdirSync(resolve(ROOT, "docs/qa/final-redesign"), { recursive: true });
    writeFileSync(
      OUT,
      JSON.stringify({ commitSha, capturedAt: new Date().toISOString(), ok, results }, null, 2),
    );
    console.log(ok ? "tablet interaction OK" : "tablet interaction FAILED", OUT);
    if (!ok) process.exitCode = 1;
  } finally {
    if (server) server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
