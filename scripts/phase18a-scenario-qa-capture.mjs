/**
 * Phase 18A Scenario Editor QA screenshots — assert-before-capture.
 *
 *   node scripts/phase18a-scenario-qa-capture.mjs
 *
 * Starts Vite on QA_DEV_PORT (default 5176) if needed.
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
    for (const width of [1280, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 800 },
      });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page
        .getByText("Import scenario", { exact: false })
        .first()
        .waitFor({ timeout: 30_000 });
      await shot(page, `menu-${width}`);

      await page.getByText("Scenario editor", { exact: false }).first().click();
      await page.getByText("Overview", { exact: false }).first().waitFor();
      // Overview tab should be active with editable name field.
      await page.locator(".scenario-form, .scenario-screen").first().waitFor();
      await shot(page, `editor-overview-${width}`);

      await page.getByRole("button", { name: /Constitution/i }).click();
      await shot(page, `editor-constitution-${width}`);

      await page.getByRole("button", { name: /Parties/i }).click();
      await shot(page, `editor-parties-${width}`);

      await page.getByRole("button", { name: /Validation/i }).click();
      await shot(page, `editor-validation-${width}`);

      await page
        .getByText("Import scenario", { exact: false })
        .first()
        .click()
        .catch(() => null);
      // Return to menu via back if present.
      const back = page.getByRole("button", { name: /back|main menu|cancel/i }).first();
      if (await back.count()) await back.click();
      await page.getByText("Import scenario", { exact: false }).first().click();
      await page.setInputFiles('input[type="file"]', FIXTURE);
      await page
        .getByText("Alphaven Federation", { exact: false })
        .first()
        .waitFor({ timeout: 15_000 });
      const play = page.getByRole("button", { name: /Play/i }).first();
      const playDisabled = await play.isDisabled().catch(() => false);
      if (playDisabled) throw new Error("Valid import PLAY should be enabled");
      await shot(page, `import-valid-${width}`);

      // Invalid: empty JSON object via file chooser alternative — paste through evaluate if needed.
      await page.evaluate(() => {
        /* keep page on import summary */
      });
      await page.close();
    }

    // Invalid import flow on desktop only
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByText("Import scenario", { exact: false }).first().click();
    const badPath = resolve(OUT, "_invalid.lorsain.json");
    writeFileSync(
      badPath,
      JSON.stringify({ format: "lorsain-scenario", formatVersion: 1 }),
      "utf8",
    );
    await page.setInputFiles('input[type="file"]', badPath);
    await page
      .getByText(/error|missing|cannot/i)
      .first()
      .waitFor({ timeout: 15_000 });
    const playBad = page.getByRole("button", { name: /Play/i }).first();
    if (!(await playBad.isDisabled())) throw new Error("Invalid import PLAY must be disabled");
    await shot(page, "import-invalid-1280");
    await page.close();

    writeFileSync(
      resolve(OUT, "manifest.json"),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), fixture: "custom-mini-world" }, null, 2)}\n`,
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
