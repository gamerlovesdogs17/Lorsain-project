import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../styles.css");

function readCssVar(css: string, name: string): number {
  const match = css.match(
    new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(\\d+)`),
  );
  if (!match) throw new Error(`Missing CSS variable ${name}`);
  return Number(match[1]);
}

function readRuleZIndex(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?z-index:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing z-index for ${selector}`);
  return match[1]!.trim();
}

describe("overlay stacking hierarchy", () => {
  it("keeps confirmation modals above action drawers", () => {
    const css = readFileSync(stylesPath, "utf8");
    const sticky = readCssVar(css, "--z-sticky");
    const menuBackdrop = readCssVar(css, "--z-menu-backdrop");
    const menu = readCssVar(css, "--z-menu");
    const mobileNav = readCssVar(css, "--z-mobile-nav");
    const drawer = readCssVar(css, "--z-drawer");
    const modal = readCssVar(css, "--z-modal");
    const urgent = readCssVar(css, "--z-urgent");

    expect(sticky).toBeLessThan(menuBackdrop);
    expect(menuBackdrop).toBeLessThan(menu);
    expect(menu).toBeLessThan(mobileNav);
    expect(mobileNav).toBeLessThan(drawer);
    expect(drawer).toBeLessThan(modal);
    expect(modal).toBeLessThan(urgent);

    expect(readRuleZIndex(css, ".action-drawer-backdrop")).toBe("var(--z-drawer)");
    expect(readRuleZIndex(css, ".modal-backdrop")).toBe("var(--z-modal)");
  });
});
