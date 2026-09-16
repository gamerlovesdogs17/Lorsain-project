/**
 * Phase 18 Scenario Studio QA screenshots — assert-before-capture.
 *
 *   node scripts/phase18-studio-qa-capture.mjs
 *
 * Desktop 1280 + tablet 834. Quick Build + key tabs.
 */
/* eslint-disable no-undef */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/qa/phase18/screenshots");
const FIXTURE = resolve(ROOT, "docs/qa/phase18/fixtures/custom-mini-world.lorsain.json");
const DEV_PORT = Number(process.env.QA_DEV_PORT ?? 5176);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}/Lorsain-project/`;

mkdirSync(OUT, { recursive: true });

async function waitForServer(url, ms = 120_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Dev server not ready: ${url}`);
}

async function ensureDevServer() {
  try {
    const res = await fetch(BASE);
    if (res.ok || res.status === 404) return null;
  } catch {
    /* start */
  }
  const child = spawn(
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
    {
      cwd: ROOT,
      env: { ...process.env, VITE_BASE_PATH: "/Lorsain-project/" },
      shell: true,
      stdio: "ignore",
    },
  );
  await waitForServer(BASE);
  return child;
}

async function shot(page, name) {
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, type: "png" });
  console.log("wrote", path);
}

async function openStudioHub(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByText("Scenario Studio", { exact: false }).first().waitFor({ timeout: 30_000 });
  await page.getByText("Scenario Studio", { exact: false }).first().click();
  await page.getByText("Quick Build", { exact: false }).first().waitFor({ timeout: 15_000 });
}

async function main() {
  if (!existsSync(FIXTURE)) throw new Error(`Missing fixture ${FIXTURE}`);
  const fixtureText = readFileSync(FIXTURE, "utf8");
  const fixture = JSON.parse(fixtureText);
  if (fixture.countryName !== "Alphaven Federation") {
    throw new Error("Fixture countryName assertion failed");
  }

  const child = await ensureDevServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 834]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 834 ? 900 : 800 },
      });
      await openStudioHub(page);
      await shot(page, `studio-hub-${width}`);

      await page.getByText("Quick Build", { exact: false }).first().click();
      await page.getByRole("heading", { name: /Quick Build/i }).waitFor();
      await shot(page, `studio-quick-build-${width}`);

      await page.getByRole("button", { name: /Generate/i }).click();
      await page
        .getByText("SCENARIO STUDIO", { exact: false })
        .first()
        .waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: /Overview/i }).waitFor();
      await shot(page, `studio-editor-overview-${width}`);

      await page.getByRole("button", { name: /^Parties$/i }).click();
      await shot(page, `studio-editor-parties-${width}`);

      await page.getByRole("button", { name: /^People$/i }).click();
      await shot(page, `studio-editor-people-${width}`);

      await page.getByRole("button", { name: /Validation/i }).click();
      await shot(page, `studio-editor-validation-${width}`);

      await page.close();
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByText("Scenario Studio", { exact: false }).first().click();
    await page.getByText("Import JSON", { exact: false }).first().click();
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await page
      .getByText("Alphaven Federation", { exact: false })
      .first()
      .waitFor({ timeout: 15_000 });
    const play = page.getByRole("button", { name: /Play scenario/i }).first();
    if (await play.isDisabled()) throw new Error("Valid import PLAY should be enabled");
    await shot(page, "studio-import-valid-1280");
    await page.close();

    writeFileSync(
      resolve(OUT, "manifest-studio.json"),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), script: "phase18-studio-qa-capture" }, null, 2)}\n`,
    );
  } finally {
    await browser.close();
    if (child) child.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
