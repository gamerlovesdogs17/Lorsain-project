import type { MediaCategory, MediaStory } from "./types.js";

/** Narrative shapes for article copy (Phase 17B.2 variety pass). */
export const ARTICLE_STRUCTURES = [
  "straight",
  "conflict",
  "accountability",
  "analysis",
  "reaction",
  "legal",
  "diplomatic",
  /** Legacy ids kept for older saves / deterministic fallbacks */
  "consequence_first",
  "event_first",
  "institutional",
  "political_reaction",
  "regional",
] as const;
export type ArticleBodyStructure = (typeof ARTICLE_STRUCTURES)[number];

const PRIMARY_SHAPES: readonly ArticleBodyStructure[] = [
  "straight",
  "conflict",
  "accountability",
  "analysis",
  "reaction",
  "legal",
  "diplomatic",
];

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

function shapesForEvent(
  factEventType: string | undefined,
  category: MediaCategory | string,
): ArticleBodyStructure[] {
  const type = factEventType ?? "";
  if (type.includes("COURT") || type.includes("JUDGE") || type.includes("IMPEACH")) {
    return ["legal", "accountability", "analysis", "straight"];
  }
  if (
    type.includes("TREATY") ||
    type.includes("DIPLOMATIC") ||
    type.includes("SANCTION") ||
    type.includes("CRISIS") ||
    type.includes("FOREIGN") ||
    type.includes("INTERNATIONAL") ||
    category === "foreign"
  ) {
    return ["diplomatic", "conflict", "analysis", "reaction"];
  }
  if (type === "POLITICAL_SCANDAL_ALLEGATION" || type.includes("SERVICE_DELIVERY")) {
    return ["accountability", "conflict", "reaction", "analysis"];
  }
  if (type.includes("DEBATE") || type.includes("ELECTION") || type.includes("CAMPAIGN")) {
    return ["reaction", "conflict", "straight", "analysis"];
  }
  if (
    type.includes("BILL") ||
    type.includes("LAW") ||
    type.includes("BUDGET") ||
    type.includes("VETO")
  ) {
    return ["analysis", "accountability", "conflict", "straight"];
  }
  if (category === "economy") return ["analysis", "straight", "reaction"];
  if (category === "organizations") return ["reaction", "conflict", "straight"];
  if (category === "government") return ["accountability", "analysis", "straight", "conflict"];
  return [...PRIMARY_SHAPES];
}

/** Deterministic structure pick from story identity (works for old saves). */
export function articleStructureFor(
  story: Pick<MediaStory, "id" | "category" | "framing" | "outletId"> & {
    factEventType?: string;
  },
): ArticleBodyStructure {
  const candidates = shapesForEvent(story.factEventType, story.category);
  const key = `${story.id}:${story.outletId}:${story.category}:${story.framing}:${story.factEventType ?? ""}`;
  const idx = hashKey(key) % candidates.length;
  return candidates[idx]!;
}

export type ArticleBodyInput = {
  structure: ArticleBodyStructure;
  headline: string;
  date: string;
  category: MediaCategory | string;
  framing: MediaStory["framing"];
  provinceHint?: string | null;
  outletName?: string | null;
  facts?: string[];
};

function factClause(facts: string[]): string {
  if (facts.length === 0) return "";
  const cleaned = facts.slice(0, 3).map((f) => f.replace(/^[^:]+:\s*/, "").trim());
  return ` Recorded details include ${cleaned.join("; ")}.`;
}

/**
 * Short multi-paragraph article copy with structural variety.
 * Keep prose tight — two to three sentences total across paragraphs.
 */
export function buildArticleBody(input: ArticleBodyInput): string[] {
  const facts = input.facts ?? [];
  const province = input.provinceHint?.trim() || null;
  const desk = input.outletName?.trim() || "the press";
  const head = input.headline.replace(/\.$/, "");
  const extra = factClause(facts);

  switch (input.structure) {
    case "straight":
      return [`${head}.`, `The underlying development was recorded on ${input.date}.${extra}`];
    case "conflict":
      return [
        `Rival camps are already trading blame over the latest ${input.category} filing.`,
        `${head} — logged ${input.date} — gives each side a fresh line of attack.${extra}`,
      ];
    case "accountability":
      return [
        `Oversight voices want a clearer account of who signed off and what happens next.`,
        `${head} is now part of that ${input.category} record as of ${input.date}.${extra}`,
      ];
    case "analysis":
      return [
        `${desk} reads the move as one signal in a wider ${input.category} pattern, not an isolated procedural step.`,
        `${head} was entered on ${input.date}.${extra}`,
      ];
    case "reaction":
      return [
        `Parties and public figures are already framing responses to the latest ${input.category} development.`,
        `${head} — filed ${input.date} — is the hook for that argument.${extra}`,
      ];
    case "legal":
      return [
        `Counsel and constitutional desks treat the item as a precedent question as much as a headline.`,
        `${head} was docketed on ${input.date}.${extra}`,
      ];
    case "diplomatic":
      return [
        `Foreign desks emphasize alliance signaling and escalation risk alongside the bare facts.`,
        `${head} was noted in diplomatic coverage on ${input.date}.${extra}`,
      ];
    case "consequence_first":
      return [
        `The immediate effect is already being weighed across Terenan politics.${extra}`,
        `${head} entered the public record on ${input.date}, with ${desk} stressing what follows rather than the procedural step alone.`,
      ];
    case "event_first":
      return [`${head}.`, `The underlying development was recorded on ${input.date}.${extra}`];
    case "institutional":
      return [
        `Institutions now have a concrete item on the ${input.category} docket: ${head.toLowerCase()}.`,
        `Official channels logged the matter on ${input.date}.${extra}`,
      ];
    case "political_reaction":
      return [
        `Parties and public figures are already framing responses to the latest ${input.category} development.`,
        `${head} — filed ${input.date} — is the hook for that argument.${extra}`,
      ];
    case "regional":
      return [
        province
          ? `In ${province}, the story reads as a local stake in a wider ${input.category} fight.`
          : `Regional desks are treating the item as more than a capital-only ${input.category} beat.`,
        `${head} was recorded on ${input.date}.${extra}`,
      ];
    default:
      return [`${head}.`, `Recorded on ${input.date}.${extra}`];
  }
}
