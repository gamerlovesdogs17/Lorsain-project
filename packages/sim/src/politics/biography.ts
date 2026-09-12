import { activeTermsForPolitician } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";

const OFFICE_KIND_LABELS: Record<string, string> = {
  president: "President",
  governor: "Governor",
  minister: "Cabinet minister",
  assembly_member: "Assembly member",
  mayor: "Mayor",
  speaker: "Speaker of the Assembly",
  constitutional_court_justice: "Constitutional Court justice",
};

const BACKGROUNDS = [
  "community organizer",
  "regional prosecutor",
  "trade-union negotiator",
  "small-business owner",
  "public-health administrator",
  "municipal civil servant",
  "journalist covering provincial politics",
  "legal aid clinic director",
] as const;

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function priorOfficeKinds(world: KernelWorld, state: SimState, politicianId: string): string[] {
  const kinds = new Set<string>();
  for (const term of Object.values(state.officeTerms)) {
    if (term.holderId !== politicianId) continue;
    const kind = world.offices[term.officeId]?.kind;
    if (kind) kinds.add(kind);
  }
  const rank = (k: string) =>
    k === "president"
      ? 0
      : k === "governor"
        ? 1
        : k === "minister"
          ? 2
          : k === "assembly_member"
            ? 3
            : 9;
  return [...kinds].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Public-facing biography using office history when terms exist. */
export function refreshPoliticianPublicBiography(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): string {
  const pol = state.politicians[politicianId];
  if (!pol) return "";
  const name = pol.displayName ?? politicianId;
  const history = priorOfficeKinds(world, state, politicianId);
  const active = activeTermsForPolitician(state, politicianId)
    .map((t) => world.offices[t.officeId]?.kind)
    .filter(Boolean) as string[];

  if (history.length >= 2) {
    const labels = history
      .slice(0, 3)
      .map((k) => OFFICE_KIND_LABELS[k] ?? k.replace(/_/g, " "))
      .join(", then ");
    return `${name} previously served as ${labels}, and remains active in national politics.`;
  }
  if (active.length === 1) {
    const label = OFFICE_KIND_LABELS[active[0]!] ?? active[0]!.replace(/_/g, " ");
    return `${name} currently holds office as ${label}.`;
  }
  if (history.length === 1) {
    const label = OFFICE_KIND_LABELS[history[0]!] ?? history[0]!.replace(/_/g, " ");
    return `${name} entered public life after serving as ${label}.`;
  }

  const background = BACKGROUNDS[stableHash(`${politicianId}:bio`) % BACKGROUNDS.length]!;
  const province = pol.homeProvinceId ? ` in ${pol.homeProvinceId}` : "";
  return `${name} came to politics from work as a ${background}${province}.`;
}

export function applyPoliticianPublicBiography(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): void {
  const pol = state.politicians[politicianId];
  if (!pol) return;
  pol.description = refreshPoliticianPublicBiography(world, state, politicianId);
}
