import { activeTermsForPolitician } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import { ensurePoliticsRuntime } from "./state.js";
import { ensurePartyOrgRuntime } from "../partyOrg/state.js";

const OFFICE_KIND_LABELS: Record<string, string> = {
  president: "President",
  governor: "Governor",
  minister: "Cabinet minister",
  assembly_member: "Assembly member",
  mayor: "Mayor",
  speaker: "Speaker of the Assembly",
  constitutional_court_justice: "Constitutional Court justice",
};

/** Stable background archetypes — not ideology. Prefer stored metadata when present. */
export const BACKGROUND_ARCHETYPES = [
  "labor attorney",
  "teacher",
  "union organizer",
  "physician",
  "nurse",
  "civil servant",
  "economist",
  "business owner",
  "engineer",
  "journalist",
  "academic",
  "military officer",
  "farmer",
  "nonprofit leader",
  "local elected official",
  "provincial official",
  "activist",
] as const;

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function yearOf(date: string | null | undefined): string | null {
  if (!date || date.length < 4) return null;
  return date.slice(0, 4);
}

function ministryLabel(world: KernelWorld, officeId: string): string {
  const office = world.offices[officeId];
  if (!office) return "a ministry";
  const title = office.title ?? office.id;
  return title.replace(/^Minister of\s+/i, "").trim() || title;
}

export type CareerMilestone = {
  kind: string;
  label: string;
  startYear: string | null;
  endYear: string | null;
};

/** Extract ordered career milestones from office terms, Party posts, and scandals. */
export function extractCareerMilestones(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): CareerMilestone[] {
  const milestones: CareerMilestone[] = [];
  const terms = Object.values(state.officeTerms)
    .filter((t) => t.holderId === politicianId)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  for (const term of terms) {
    const office = world.offices[term.officeId];
    if (!office) continue;
    const startYear = yearOf(term.startDate);
    const endYear =
      yearOf(term.endedDate) ?? (term.status === "active" ? null : yearOf(term.endDate));
    if (office.kind === "minister") {
      milestones.push({
        kind: "minister",
        label: `Minister of ${ministryLabel(world, term.officeId)}`,
        startYear,
        endYear,
      });
    } else if (office.kind === "governor") {
      milestones.push({
        kind: "governor",
        label: "Governor",
        startYear,
        endYear,
      });
    } else if (office.kind === "president") {
      milestones.push({
        kind: "president",
        label: "President",
        startYear,
        endYear,
      });
    } else if (office.kind === "assembly_member") {
      milestones.push({
        kind: "assembly_member",
        label: "Assembly member",
        startYear,
        endYear,
      });
    } else if (office.kind === "speaker") {
      milestones.push({
        kind: "speaker",
        label: "Speaker of the Assembly",
        startYear,
        endYear,
      });
    }
  }

  const pol = state.politicians[politicianId];
  const partyId = pol?.partyId;
  if (partyId) {
    const party = state.partyStates[partyId];
    if (party?.leaderId === politicianId) {
      milestones.push({
        kind: "party_leader",
        label: "Party leader",
        startYear: null,
        endYear: null,
      });
    }
    try {
      const org = ensurePartyOrgRuntime(state);
      const chair = org.officers[partyId]?.chair?.politicianId;
      if (chair === politicianId) {
        milestones.push({
          kind: "party_chair",
          label: "National Party Chair",
          startYear: null,
          endYear: null,
        });
      }
    } catch {
      /* party org optional on sparse fixtures */
    }
  }

  const politics = ensurePoliticsRuntime(state);
  for (const scandal of Object.values(politics.scandals ?? {})) {
    if (scandal.targetPoliticianId !== politicianId) continue;
    if (scandal.outcome === "exonerated" || scandal.outcome === "unsubstantiated") {
      milestones.push({
        kind: "scandal_cleared",
        label: "cleared after public investigation",
        startYear: yearOf(scandal.allegationDate),
        endYear: null,
      });
    } else if (scandal.outcome === "substantiated") {
      milestones.push({
        kind: "scandal_substantiated",
        label: "faced a substantiated ethics finding",
        startYear: yearOf(scandal.allegationDate),
        endYear: null,
      });
    }
  }

  // Deduplicate consecutive identical labels.
  const deduped: CareerMilestone[] = [];
  for (const m of milestones) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.label === m.label && prev.startYear === m.startYear) continue;
    deduped.push(m);
  }
  return deduped;
}

export function backgroundForPolitician(state: SimState, politicianId: string): string {
  const pol = state.politicians[politicianId] as
    (SimState["politicians"][string] & { background?: string; profession?: string }) | undefined;
  const stored =
    (typeof pol?.background === "string" && pol.background) ||
    (typeof pol?.profession === "string" && pol.profession) ||
    (typeof (pol as { metadata?: { background?: string } } | undefined)?.metadata?.background ===
      "string" &&
      (pol as { metadata?: { background?: string } }).metadata!.background);
  if (stored && stored.trim().length > 0) return stored.trim();
  return BACKGROUND_ARCHETYPES[
    stableHash(`${politicianId}:background`) % BACKGROUND_ARCHETYPES.length
  ]!;
}

function formatMilestone(m: CareerMilestone): string {
  if (m.startYear && m.endYear && m.startYear !== m.endYear) {
    return `${m.label} (${m.startYear}–${m.endYear})`;
  }
  if (m.startYear) return `${m.label} from ${m.startYear}`;
  return m.label;
}

/** Public-facing biography using background + real career milestones. */
export function refreshPoliticianPublicBiography(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): string {
  const pol = state.politicians[politicianId];
  if (!pol) return "";
  const name = pol.displayName ?? politicianId;
  const background = backgroundForPolitician(state, politicianId);
  const milestones = extractCareerMilestones(world, state, politicianId).filter(
    (m) => m.kind !== "scandal_cleared" && m.kind !== "scandal_substantiated",
  );
  const scandalNote = extractCareerMilestones(world, state, politicianId).find(
    (m) => m.kind === "scandal_cleared" || m.kind === "scandal_substantiated",
  );

  const careerBits = milestones
    .filter((m) => m.kind !== "assembly_member" || milestones.length <= 2)
    .slice(0, 4)
    .map(formatMilestone);

  let bio = `Before entering national politics, ${name} worked as a ${background}.`;
  if (careerBits.length >= 2) {
    const head = careerBits.slice(0, -1).join(", ");
    const tail = careerBits[careerBits.length - 1]!;
    bio = `Before entering national politics, ${name} worked as a ${background}. ${name.split(" ").slice(-1)[0]} later served as ${head}, and ${tail}.`;
  } else if (careerBits.length === 1) {
    bio = `Before entering national politics, ${name} worked as a ${background}, and later became ${careerBits[0]}.`;
  } else {
    const active = activeTermsForPolitician(state, politicianId)
      .map((t) => world.offices[t.officeId]?.kind)
      .filter(Boolean) as string[];
    if (active[0]) {
      const label = OFFICE_KIND_LABELS[active[0]] ?? active[0].replace(/_/g, " ");
      bio = `Before entering national politics, ${name} worked as a ${background}. ${name.split(" ").slice(-1)[0]} currently serves as ${label}.`;
    }
  }

  if (scandalNote?.kind === "scandal_cleared") {
    bio += ` A later investigation left the allegation unproven.`;
  } else if (scandalNote?.kind === "scandal_substantiated") {
    bio += ` A public investigation later produced a substantiated ethics finding.`;
  }

  pol.description = bio;
  return bio;
}
