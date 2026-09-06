import type { MediaCategory, MediaStory } from "./types.js";

export const ARTICLE_STRUCTURES = [
  "consequence_first",
  "event_first",
  "institutional",
  "political_reaction",
  "regional",
] as const;
export type ArticleBodyStructure = (typeof ARTICLE_STRUCTURES)[number];

/** Deterministic structure pick from story identity (works for old saves). */
export function articleStructureFor(
  story: Pick<MediaStory, "id" | "category" | "framing" | "outletId">,
): ArticleBodyStructure {
  let h = 0;
  const key = `${story.id}:${story.outletId}:${story.category}:${story.framing}`;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ARTICLE_STRUCTURES[h % ARTICLE_STRUCTURES.length]!;
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
