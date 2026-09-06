/**
 * Canonical Constitution target validation.
 * Ensures every amendment subject points at a real Article/Section/Clause
 * and that founding baselines match the current enacted clause text.
 */
import type { KernelWorld } from "../types.js";
import {
  CONSTITUTION_CHANGE_SUBJECTS,
  type ConstitutionChangeSubject,
} from "./constitutionChanges.js";
import { currentConstitutionalClauseText } from "./constitutional.js";
import type { SimState } from "../types.js";

export type ConstitutionClauseRef = {
  articleId: string;
  /** Canonical document section id (ARTICLE_X_SECTION_N). */
  sectionId: string;
  clauseId: string;
  text: string;
};

export type ConstitutionCatalogIndex = {
  articles: Set<string>;
  sections: Map<string, string>; // sectionId (canonical or short alias) -> articleId
  clauses: Map<string, ConstitutionClauseRef>;
};

/** Document section IDs use ARTICLE_X_SECTION_N; short alias is ART_X_SN. */
export function shortSectionId(documentSectionId: string): string {
  const m = documentSectionId.match(/^ARTICLE_([IVX]+)_SECTION_(\d+)$/);
  if (!m) return documentSectionId;
  return `ART_${m[1]}_S${m[2]}`;
}

/** Prefer canonical ARTICLE_X_SECTION_N; resolve short ART_X_SN aliases. */
export function canonicalSectionId(sectionId: string): string {
  const short = sectionId.match(/^ART_([IVX]+)_S(\d+)$/);
  if (short) return `ARTICLE_${short[1]}_SECTION_${short[2]}`;
  return sectionId;
}

export function buildConstitutionCatalogIndex(
  world: KernelWorld | { constitutionalDocument?: KernelWorld["constitutionalDocument"] },
): ConstitutionCatalogIndex {
  const articles = new Set<string>();
  const sections = new Map<string, string>();
  const clauses = new Map<string, ConstitutionClauseRef>();
  const doc = world.constitutionalDocument;
  if (!doc?.articles) return { articles, sections, clauses };
  for (const article of doc.articles) {
    articles.add(article.id);
    for (const section of article.sections) {
      const short = shortSectionId(section.id);
      // Prefer canonical keys; keep short form as alias resolver only.
      sections.set(section.id, article.id);
      if (short !== section.id) sections.set(short, article.id);
      for (const clause of section.clauses) {
        clauses.set(clause.id, {
          articleId: article.id,
          sectionId: section.id,
          clauseId: clause.id,
          text: clause.text,
        });
      }
    }
  }
  return { articles, sections, clauses };
}

export type ConstitutionSubjectValidationError = {
  subjectId: string;
  code:
    | "MISSING_ARTICLE"
    | "MISSING_SECTION"
    | "MISSING_CLAUSE"
    | "SECTION_ARTICLE_MISMATCH"
    | "CLAUSE_SECTION_MISMATCH"
    | "CLAUSE_ARTICLE_MISMATCH"
    | "FOUNDING_ALT_MISSING"
    | "FOUNDING_BASELINE_MISMATCH"
    | "DUPLICATE_TARGET_METADATA"
    | "NON_CANONICAL_SECTION_ID";
  message: string;
};

export function validateConstitutionChangeSubject(
  subject: ConstitutionChangeSubject,
  index: ConstitutionCatalogIndex,
  options?: { requireFoundingBaselineMatch?: boolean; currentTexts?: Record<string, string> },
): ConstitutionSubjectValidationError[] {
  const errors: ConstitutionSubjectValidationError[] = [];
  if (!index.articles.has(subject.articleId)) {
    errors.push({
      subjectId: subject.id,
      code: "MISSING_ARTICLE",
      message: `Article ${subject.articleId} does not exist`,
    });
  }
  const canonicalSubjectSection = canonicalSectionId(subject.sectionId);
  if (canonicalSubjectSection !== subject.sectionId) {
    errors.push({
      subjectId: subject.id,
      code: "NON_CANONICAL_SECTION_ID",
      message: `Section ${subject.sectionId} should use canonical id ${canonicalSubjectSection}`,
    });
  }
  const sectionArticle =
    index.sections.get(subject.sectionId) ?? index.sections.get(canonicalSubjectSection);
  if (!sectionArticle) {
    errors.push({
      subjectId: subject.id,
      code: "MISSING_SECTION",
      message: `Section ${subject.sectionId} does not exist`,
    });
  } else if (sectionArticle !== subject.articleId) {
    errors.push({
      subjectId: subject.id,
      code: "SECTION_ARTICLE_MISMATCH",
      message: `Section ${subject.sectionId} belongs to ${sectionArticle}, not ${subject.articleId}`,
    });
  }
  const clause = index.clauses.get(subject.targetClauseId);
  if (!clause) {
    errors.push({
      subjectId: subject.id,
      code: "MISSING_CLAUSE",
      message: `Clause ${subject.targetClauseId} does not exist`,
    });
  } else {
    if (clause.sectionId !== canonicalSubjectSection) {
      errors.push({
        subjectId: subject.id,
        code: "CLAUSE_SECTION_MISMATCH",
        message: `Clause ${subject.targetClauseId} belongs to ${clause.sectionId}, not ${subject.sectionId}`,
      });
    }
    if (clause.articleId !== subject.articleId) {
      errors.push({
        subjectId: subject.id,
        code: "CLAUSE_ARTICLE_MISMATCH",
        message: `Clause ${subject.targetClauseId} belongs to ${clause.articleId}, not ${subject.articleId}`,
      });
    }
  }
  const founding = subject.alternatives.find((a) => a.id === subject.foundingAlternativeId);
  if (!founding) {
    errors.push({
      subjectId: subject.id,
      code: "FOUNDING_ALT_MISSING",
      message: `Founding alternative ${subject.foundingAlternativeId} missing`,
    });
  } else if (options?.requireFoundingBaselineMatch !== false && clause) {
    const expected = options?.currentTexts?.[subject.targetClauseId] ?? clause.text;
    if (
      normalizeConstitutionText(founding.proposedClauseText) !== normalizeConstitutionText(expected)
    ) {
      errors.push({
        subjectId: subject.id,
        code: "FOUNDING_BASELINE_MISMATCH",
        message: `Founding baseline for ${subject.id} does not match canonical/current clause ${subject.targetClauseId}`,
      });
    }
  }
  return errors;
}

export function normalizeConstitutionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function validateAllConstitutionChangeSubjects(
  world: KernelWorld | { constitutionalDocument?: KernelWorld["constitutionalDocument"] },
  options?: { requireFoundingBaselineMatch?: boolean; currentTexts?: Record<string, string> },
): ConstitutionSubjectValidationError[] {
  const index = buildConstitutionCatalogIndex(world);
  const errors: ConstitutionSubjectValidationError[] = [];
  const seenTargets = new Map<string, string>();
  for (const subject of CONSTITUTION_CHANGE_SUBJECTS) {
    errors.push(...validateConstitutionChangeSubject(subject, index, options));
    const key = `${subject.articleId}|${subject.sectionId}|${subject.targetClauseId}|${subject.id}`;
    const prior = seenTargets.get(subject.targetClauseId);
    // Multiple subjects may share a clause only if intentionally distinct; duplicate identical metadata is flagged.
    if (prior && prior === key) {
      errors.push({
        subjectId: subject.id,
        code: "DUPLICATE_TARGET_METADATA",
        message: `Duplicate subject metadata for ${subject.targetClauseId}`,
      });
    }
    seenTargets.set(subject.targetClauseId, key);
  }
  return errors;
}

/** Development/runtime check: throws if any subject is invalid. */
export function assertConstitutionChangeCatalogValid(
  world: KernelWorld | { constitutionalDocument?: KernelWorld["constitutionalDocument"] },
): void {
  const errors = validateAllConstitutionChangeSubjects(world, {
    requireFoundingBaselineMatch: true,
  });
  if (errors.length === 0) return;
  const summary = errors
    .slice(0, 12)
    .map((e) => `${e.subjectId}: ${e.code} — ${e.message}`)
    .join("\n");
  throw new Error(
    `Constitution change catalog invalid (${errors.length} errors):\n${summary}${
      errors.length > 12 ? `\n…and ${errors.length - 12} more` : ""
    }`,
  );
}

/** Baseline for amendment diffs: live clause text (enacted overrides first). */
export function currentBaselineForSubject(
  world: KernelWorld,
  state: SimState,
  subjectId: string,
): string | null {
  const subject = CONSTITUTION_CHANGE_SUBJECTS.find((s) => s.id === subjectId);
  if (!subject) return null;
  return currentConstitutionalClauseText(world, state, subject.targetClauseId);
}
