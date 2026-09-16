/**
 * Shared Assembly chamber helpers for constitutional amendments.
 * Amendments are not ordinary bills; they reuse whip/stance/persuasion subject keys
 * and LegislativeVoteRecord roll-call UX while keeping the special ratification lifecycle.
 */
import type { SimState } from "../types.js";
import { constitutionSubjectById, CONSTITUTION_CHANGE_SUBJECTS } from "./constitutionChanges.js";
import { isEntrenchedArticle } from "./constitutionalOrder.js";
import type { ConstitutionalAmendment } from "./types.js";

export function amendmentTouchesCore(amendment: ConstitutionalAmendment): boolean {
  const packageTouchesCore = (amendment.packageChanges ?? []).some((c) => {
    const subject = constitutionSubjectById(c.subjectId);
    return subject && isEntrenchedArticle(subject.articleId);
  });
  const documentTouchesCore = amendment.documentClauseId
    ? CONSTITUTION_CHANGE_SUBJECTS.some(
        (subject) =>
          subject.targetClauseId === amendment.documentClauseId &&
          isEntrenchedArticle(subject.articleId),
      )
    : false;
  return packageTouchesCore || documentTouchesCore;
}

export function amendmentAffectedArticleIds(amendment: ConstitutionalAmendment): string[] {
  const ids = new Set<string>();
  for (const change of amendment.packageChanges ?? []) {
    const subject = constitutionSubjectById(change.subjectId);
    if (subject) ids.add(subject.articleId);
  }
  if (amendment.documentClauseId) {
    for (const subject of CONSTITUTION_CHANGE_SUBJECTS) {
      if (subject.targetClauseId === amendment.documentClauseId) ids.add(subject.articleId);
    }
  }
  if (ids.size === 0 && amendment.ruleId) {
    const byRule = CONSTITUTION_CHANGE_SUBJECTS.find((s) =>
      s.alternatives.some((alt) => alt.rulePatch && amendment.ruleId! in alt.rulePatch),
    );
    if (byRule) ids.add(byRule.articleId);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function formatArticleLabel(articleId: string): string {
  const match = /^ARTICLE_([IVX]+)$/.exec(articleId);
  return match ? `Article ${match[1]}` : articleId.replace(/_/g, " ");
}

export function amendmentArticleSummary(amendment: ConstitutionalAmendment): string {
  const ids = amendmentAffectedArticleIds(amendment);
  if (ids.length === 0) {
    if (amendment.ruleId) return amendment.ruleId.replace(/_/g, " ");
    return "Constitutional provision";
  }
  return ids.map(formatArticleLabel).join(", ");
}

/** Exact seat threshold copy, e.g. "280 of 420". */
export function formatConstitutionalAssemblyThreshold(
  requiredYes: number,
  seatCount: number,
): string {
  return `${requiredYes} of ${seatCount}`;
}

export function pendingConstitutionalAmendment(
  state: SimState,
  amendmentId: string,
): ConstitutionalAmendment | null {
  const amendment = state.provincialRuntime.constitutionalAmendments[amendmentId];
  if (!amendment || amendment.status !== "proposed") return null;
  return amendment;
}

/** Chamber subjects that share whip / party-position / persuasion storage with bills. */
export function isWhipableChamberSubject(state: SimState, subjectId: string): boolean {
  if (state.legislatureRuntime.bills[subjectId]) return true;
  return pendingConstitutionalAmendment(state, subjectId) != null;
}

export function amendmentRatificationStepsRemaining(
  amendment: ConstitutionalAmendment,
  provincesRequired: number,
  referendumRequired: boolean,
): string[] {
  const steps: string[] = [];
  if (amendment.status === "proposed") {
    steps.push("National Assembly vote");
    if (provincesRequired > 0) {
      steps.push(`Provincial ratification (${provincesRequired} of 21)`);
    }
    if (referendumRequired) steps.push("National referendum");
    return steps;
  }
  if (amendment.status === "ratifying") {
    if (referendumRequired && amendment.referendumHeldDate == null) {
      steps.push("National referendum");
    }
    if (provincesRequired > 0) {
      const have = amendment.ratifiedProvinceIds.length;
      if (have < provincesRequired) {
        steps.push(`Provincial ratification (${have} / ${provincesRequired})`);
      }
    }
    if (steps.length === 0) steps.push("Finalization pending");
    return steps;
  }
  if (amendment.status === "ratified") return [];
  return [`Closed · ${amendment.status.replace(/_/g, " ")}`];
}
