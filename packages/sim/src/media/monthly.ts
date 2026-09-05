import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import { clampUnit } from "../elections/policy.js";
import { allocateMediaStoryId } from "./state.js";
import type { MediaCategory, MediaStory } from "./types.js";

const EVENT_CATEGORY: Record<string, MediaCategory> = {
  BILL_INTRODUCED: "government",
  BILL_PASSED: "government",
  LAW_ENACTED: "government",
  VETO: "government",
  PRESIDENT_VETO: "government",
  COURT_DECISION: "courts",
  JUDGE_NOMINATED: "courts",
  JUDGE_CONFIRMED: "courts",
  IMPEACHMENT_INTRODUCED: "courts",
  PRESIDENT_IMPEACHED: "courts",
  EMERGENCY_DECLARED: "government",
  CAMPAIGN_LAUNCHED: "elections",
  DEBATE_HELD: "elections",
  ELECTION_RESOLVED: "elections",
  PRESIDENTIAL_ELECTION_RESOLVED: "elections",
  ORGANIZATION_ACTION: "organizations",
  ORGANIZATION_ENDORSEMENT: "organizations",
  ECONOMY_MONTH: "economy",
  ECONOMIC_SHOCK: "economy",
  MINISTER_APPOINTED: "government",
  CABINET_CHANGE: "government",
  DIPLOMATIC_OUTREACH: "foreign",
  DIPLOMATIC_SUMMIT: "foreign",
  DIPLOMATIC_WARNING: "foreign",
  SANCTIONS_IMPOSED: "foreign",
  SANCTIONS_LIFTED: "foreign",
  TREATY_PROPOSED: "foreign",
  TREATY_RATIFIED: "foreign",
  TREATY_REJECTED: "foreign",
  INTERNATIONAL_CONFLICT_STARTED: "foreign",
  CRISIS_MEDIATION: "foreign",
  MILITARY_POSTURE_CHANGED: "foreign",
  TERENA_POSTURE_CHANGED: "foreign",
  FOREIGN_OUTREACH: "foreign",
  FOREIGN_LEADERSHIP_CHANGE: "foreign",
  TRADE_NEGOTIATION: "foreign",
  ALLIANCE_CONSULTATION: "foreign",
  FOREIGN_CRISIS_INCIDENT: "foreign",
  FOREIGN_CRISIS_ESCALATED: "foreign",
  FOREIGN_CRISIS_DEESCALATED: "foreign",
  FOREIGN_CRISIS_SETTLED: "foreign",
  INTERNATIONAL_CONFLICT_ENDED: "foreign",
  MILITARY_EXERCISES: "foreign",
};

function categoryOf(type: string): MediaCategory {
  if (EVENT_CATEGORY[type]) return EVENT_CATEGORY[type]!;
  if (type.includes("ELEC") || type.includes("CAMPAIGN") || type.includes("POLL"))
    return "elections";
  if (type.includes("COURT") || type.includes("JUDGE") || type.includes("IMPEACH")) return "courts";
  if (type.includes("ORG")) return "organizations";
  if (type.includes("ECON")) return "economy";
  if (
    type.includes("DIPLOMATIC") ||
    type.includes("SANCTION") ||
    type.includes("TREATY") ||
    type.includes("CRISIS") ||
    type.includes("FOREIGN") ||
    type.includes("INTERNATIONAL") ||
    type.includes("POSTURE") ||
    type.includes("ALLIANCE")
  ) {
    return "foreign";
  }
  return "politics";
}

function headlineFor(
  type: string,
  framing: MediaStory["framing"],
  payload?: Record<string, unknown>,
): string {
  const sensational = framing === "sensational";
  if (type === "FOREIGN_CRISIS_ESCALATED" || type === "FOREIGN_CRISIS_INCIDENT") {
    return sensational ? "Border crisis erupts abroad" : "International crisis escalates";
  }
  if (type === "FOREIGN_CRISIS_DEESCALATED" || type === "FOREIGN_CRISIS_SETTLED") {
    return sensational ? "Diplomats pull back from the brink" : "International tensions ease";
  }
  if (type === "INTERNATIONAL_CONFLICT_STARTED") {
    return sensational ? "War fears grip the Meridian basin" : "International conflict begins";
  }
  if (type === "INTERNATIONAL_CONFLICT_ENDED") {
    const outcome = payload?.outcome;
    return sensational
      ? "Ceasefire shock after foreign clash"
      : `International conflict ends${outcome ? `: ${outcome}` : ""}`;
  }
  if (type === "SANCTIONS_IMPOSED") {
    return sensational ? "Sanctions hammer trade partners" : "New sanctions imposed";
  }
  if (type === "SANCTIONS_LIFTED") {
    return sensational ? "Sanctions lifted in surprise move" : "Sanctions lifted";
  }
  if (type === "TREATY_PROPOSED" || type === "TREATY_RATIFIED") {
    return sensational ? "Diplomatic breakthrough in the wings" : "Treaty diplomacy advances";
  }
  if (
    type === "MILITARY_EXERCISES" ||
    type === "MILITARY_POSTURE_CHANGED" ||
    type === "TERENA_POSTURE_CHANGED"
  ) {
    return sensational ? "Military posturing raises alarms" : "Military posture shift reported";
  }
  if (type.includes("COURT") || type === "COURT_DECISION") {
    return sensational
      ? "Court bombshell upends the rules"
      : "Constitutional Court issues a decision";
  }
  if (type.includes("ELEC") || type.includes("CAMPAIGN")) {
    return sensational ? "Campaign turmoil rocks the race" : "Campaign and election developments";
  }
  if (type.includes("ECON")) {
    return sensational ? "Economy on a knife-edge" : "Economic conditions update";
  }
  if (type.includes("ORG")) {
    return sensational ? "Pressure groups make a scene" : "Organizations weigh in";
  }
  if (type.includes("VETO") || type.includes("BILL") || type.includes("LAW")) {
    return sensational ? "Capitol showdown over a bill" : "Government legislative action";
  }
  return sensational ? "Political storm in Valen" : "Political developments";
}

export function processMediaMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.mediaRuntime.lastMonthProcessed === month) return [];
  void commandId;
  for (const effect of state.mediaRuntime.lingering) {
    if (effect.politicianId) {
      const standing = ensureCandidateStanding(world, state, effect.politicianId);
      standing.favorability = clampUnit(standing.favorability + effect.favorabilityDelta);
      standing.momentum = clampUnit(standing.momentum + effect.momentumDelta);
    }
    if (effect.issueId && world.issueIds.includes(effect.issueId)) {
      const cur = state.electoralEnvironment.issueClimateShift[effect.issueId] ?? 0;
      state.electoralEnvironment.issueClimateShift[effect.issueId] = Math.max(
        -1,
        Math.min(1, cur + effect.salienceDelta),
      );
    }
  }
  state.mediaRuntime.lingering = state.mediaRuntime.lingering
    .map((e) => ({ ...e, remainingMonths: e.remainingMonths - 1 }))
    .filter((e) => e.remainingMonths > 0);

  const pool = state.history.filter(
    (e) =>
      e.date === state.currentDate &&
      e.visibility === "public" &&
      e.importance >= 0.32 &&
      e.type !== "TURN_COMPLETED" &&
      e.type !== "ECONOMY_MONTH",
  );
  const outlets = Object.values(world.mediaOutlets).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const outlet of outlets) {
    const scored = pool
      .map((ev) => {
        const cat = categoryOf(ev.type);
        let score = ev.importance;
        if (outlet.audience.includes("labor") && (cat === "organizations" || cat === "economy")) {
          score += 0.12;
        }
        if (outlet.audience.includes("business") && cat === "economy") score += 0.12;
        if (outlet.audience.includes("populist") && cat === "politics") score += 0.1;
        if (cat === "courts") score += (outlet.factualReputation - 0.5) * 0.15;
        score += (rng.float01("flavor") - 0.5) * 0.08 * (1 - outlet.factualReputation);
        const econLean =
          ev.type.includes("ECON") || ev.type.includes("ORG") ? outlet.ideology * -0.04 : 0;
        score += econLean;
        return { ev, cat, score };
      })
      .sort((a, b) => b.score - a.score || (a.ev.id < b.ev.id ? -1 : 1));
    const picks = scored.slice(0, outlet.factualReputation > 0.85 ? 2 : 1);
    for (const pick of picks) {
      if (pick.score < 0.28) continue;
      const framing: MediaStory["framing"] =
        outlet.factualReputation < 0.65
          ? "sensational"
          : outlet.ideology > 0.3
            ? "critical"
            : outlet.ideology < -0.3
              ? "sympathetic"
              : "restrained";
      const id = allocateMediaStoryId(state);
      const story: MediaStory = {
        id,
        outletId: outlet.id,
        date: state.currentDate,
        sourceEventIds: [pick.ev.id],
        subjectIds: [...pick.ev.actorIds].sort(),
        issueIds: [],
        category: pick.cat,
        importance: Math.min(1, pick.ev.importance),
        framing,
        headlineKey: headlineFor(pick.ev.type, framing, pick.ev.payload as Record<string, unknown>),
        summaryKey: pick.ev.type,
        factEventType: pick.ev.type,
        publicEffects: { framing },
      };
      state.mediaRuntime.stories[id] = story;
      const subject = story.subjectIds[0] ?? null;
      const scale = 0.008 * (1.15 - outlet.factualReputation * 0.4);
      const salienceIssue =
        pick.cat === "economy"
          ? world.issueIds.includes("ISS_WELFARE")
            ? "ISS_WELFARE"
            : world.issueIds.includes("ISS_HOUSING")
              ? "ISS_HOUSING"
              : null
          : pick.cat === "courts"
            ? world.issueIds.includes("ISS_EXEC")
              ? "ISS_EXEC"
              : world.issueIds.includes("ISS_COURTS")
                ? "ISS_COURTS"
                : null
            : null;
      state.mediaRuntime.lingering.push({
        storyId: id,
        remainingMonths: 2,
        politicianId: subject && state.politicians[subject] ? subject : null,
        favorabilityDelta: framing === "sympathetic" ? scale : framing === "critical" ? -scale : 0,
        momentumDelta: framing === "sensational" ? scale * 0.4 : 0,
        issueId: salienceIssue,
        salienceDelta: salienceIssue ? 0.012 * outlet.factualReputation : 0,
      });
    }
  }
  state.mediaRuntime.lastMonthProcessed = month;
  return [];
}

export function storiesChronological(state: SimState): MediaStory[] {
  return Object.values(state.mediaRuntime.stories).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1,
  );
}
