import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import { clampUnit } from "../elections/policy.js";
import { allocateMediaStoryId } from "./state.js";
import { headlineFingerprint } from "./types.js";
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

export function headlineFor(
  type: string,
  framing: MediaStory["framing"],
  payload?: Record<string, unknown>,
  variant = 0,
): string {
  const sensational = framing === "sensational";
  const critical = framing === "critical";
  const sympathetic = framing === "sympathetic";

  // ── Foreign / crisis ──────────────────────────────────────────────────────
  if (type === "FOREIGN_CRISIS_ESCALATED" || type === "FOREIGN_CRISIS_INCIDENT") {
    const theme = typeof payload?.narrativeTitle === "string" ? payload.narrativeTitle : null;
    if (theme) {
      if (sensational) return `${theme[0]!.toUpperCase()}${theme.slice(1)} rattles diplomacy`;
      if (critical) return `Warning signs mount around ${theme}`;
      return `International ${theme} draws attention`;
    }
    return sensational ? "Diplomatic crisis escalates abroad" : "International crisis escalates";
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

  // ── Courts ────────────────────────────────────────────────────────────────
  if (type === "COURT_DECISION" || type.includes("COURT")) {
    const caseType = typeof payload?.caseType === "string" ? payload.caseType : null;
    const disposition = typeof payload?.disposition === "string" ? payload.disposition : null;
    if (caseType === "FEDERAL_PROVINCIAL_DISPUTE") {
      if (sensational) {
        return disposition === "invalidated"
          ? "Court strikes down provincial law"
          : "Court backs province in federal clash";
      }
      if (critical) {
        return disposition === "invalidated"
          ? "Province overruled on constitutional grounds"
          : "Federal-provincial dispute resolved in province's favour";
      }
      return disposition === "invalidated"
        ? "Court rules against provincial law"
        : "Provincial law survives constitutional challenge";
    }
    if (caseType === "EMERGENCY_REVIEW") {
      return sensational
        ? "Court rules on emergency powers"
        : "Constitutional Court reviews emergency declaration";
    }
    if (caseType === "ELECTION_CONSTITUTIONAL_DISPUTE") {
      return sensational
        ? "Court bombshell hits the ballot"
        : "Court resolves electoral constitutional dispute";
    }
    if (caseType === "IMPEACHMENT_JUDGMENT") {
      return sensational
        ? "Court delivers impeachment verdict"
        : "Constitutional Court rules on impeachment";
    }
    if (caseType === "LAW_REVIEW") {
      return sensational
        ? "Court challenges landmark law"
        : "Constitutional Court reviews legislation";
    }
    return sensational
      ? "Court bombshell upends the rules"
      : "Constitutional Court issues a decision";
  }

  // ── Elections ─────────────────────────────────────────────────────────────
  if (type === "PRESIDENTIAL_ELECTION_RESOLVED" || type === "GUBERNATORIAL_ELECTION_RESOLVED") {
    const kind = type === "PRESIDENTIAL_ELECTION_RESOLVED" ? "Presidential" : "Gubernatorial";
    if (sensational)
      return variant === 1
        ? `${kind} race delivers a shock result`
        : `${kind} election shakes the political landscape`;
    if (critical) return `${kind} election results come under scrutiny`;
    if (sympathetic) return `${kind} election concludes with clear mandate`;
    return variant === 1
      ? `${kind} election results certified`
      : `${kind} race called as votes are counted`;
  }
  if (type === "PROVINCIAL_ASSEMBLY_ELECTION_RESOLVED") {
    if (sensational)
      return variant === 1
        ? "Provincial assembly race upends expectations"
        : "Assembly election shocks the province";
    if (critical) return "Assembly election outcome questioned";
    return variant === 1
      ? "Provincial assembly election results in"
      : "Provincial assembly seats decided";
  }
  if (type.includes("ELECTION_RESOLVED") || type.includes("ELECTION")) {
    if (sensational)
      return variant === 1
        ? "Election result rattles the establishment"
        : "Campaign turmoil rocks the race";
    return variant === 1 ? "Election results confirmed" : "Campaign and election developments";
  }
  if (type.includes("CAMPAIGN") || type === "CAMPAIGN_LAUNCHED" || type === "DEBATE_HELD") {
    const concrete =
      typeof payload?.title === "string"
        ? payload.title
        : typeof payload?.notableMoment === "string"
          ? payload.notableMoment
          : null;
    if (concrete && concrete.length > 0) {
      if (sensational) return concrete;
      if (critical) return concrete;
      return concrete;
    }
    if (type === "DEBATE_HELD") {
      return sensational
        ? "Candidates clash in televised debate"
        : "Candidates hold a public debate";
    }
    if (sensational) return "Campaign battle heats up";
    return "Election campaign activity continues";
  }

  // ── Economy ───────────────────────────────────────────────────────────────
  if (type === "ECONOMIC_SHOCK") {
    return sensational ? "Economy on a knife-edge" : "Economic shock registered";
  }
  if (type.includes("ECON")) {
    return sensational ? "Economic storm clouds gather" : "Economic conditions update";
  }

  // ── Organizations ─────────────────────────────────────────────────────────
  if (type === "ORGANIZATION_ENDORSEMENT") {
    const orgName = typeof payload?.organizationName === "string" ? payload.organizationName : null;
    if (orgName) {
      return sensational
        ? `${orgName} takes sides in political battle`
        : `${orgName} issues endorsement`;
    }
    return sensational
      ? "Pressure group throws its weight behind a candidate"
      : "Organization endorsement announced";
  }
  if (type === "ORGANIZATION_ACTION") {
    return sensational ? "Pressure groups make a scene" : "Organizations weigh in on policy";
  }
  if (type.includes("ORG")) {
    return sensational ? "Interest groups mobilize" : "Organizations active in debate";
  }

  // ── Provincial bills / governor actions ───────────────────────────────────
  if (type === "PROVINCIAL_BILL_INTRODUCED" || type === "GOVERNOR_PROVINCIAL_BILL_PROPOSED") {
    const title = typeof payload?.title === "string" ? payload.title : null;
    if (title) {
      if (sensational) return `Assembly battle looms over ${title}`;
      if (critical) return `Controversial ${title} introduced in provincial assembly`;
      if (sympathetic) return `${title} introduced to tackle local priorities`;
      return variant === 1 ? `${title} tabled in provincial assembly` : `${title} introduced`;
    }
    return sensational
      ? "New bill ignites provincial assembly"
      : "Bill introduced in provincial assembly";
  }
  if (type === "PROVINCIAL_BILL_SIGNED") {
    const title = typeof payload?.title === "string" ? payload.title : null;
    if (title) {
      if (sensational) return `Governor signs ${title} into law`;
      if (critical) return `Governor enacts controversial ${title}`;
      if (sympathetic) return `${title} signed into provincial law`;
      return `Governor signs ${title}`;
    }
    return sensational
      ? "Governor signs provincial bill into law"
      : "Provincial bill signed into law";
  }
  if (type === "PROVINCIAL_BILL_VETOED") {
    return sensational
      ? "Governor vetoes provincial legislation"
      : "Provincial bill vetoed by governor";
  }
  if (type === "PROVINCIAL_BILL_VOTE") {
    return sensational
      ? "Assembly vote divides the province"
      : "Provincial assembly votes on legislation";
  }

  // ── National bills / vetoes / law ─────────────────────────────────────────
  if (type.includes("VETO") || type === "PRESIDENT_VETO") {
    return sensational
      ? variant === 1
        ? "Presidential veto sparks standoff"
        : "Veto showdown rocks the assembly"
      : "Presidential veto issued";
  }
  if (type === "LAW_ENACTED") {
    return sensational ? "Major legislation enacted" : "New law enacted by the assembly";
  }
  if (type.includes("BILL") || type.includes("LAW")) {
    return sensational
      ? variant === 1
        ? "Legislative battle reaches its climax"
        : "Capitol showdown over a bill"
      : variant === 1
        ? "Assembly passes new legislation"
        : "Government legislative action";
  }

  // ── Executive / government ────────────────────────────────────────────────
  if (type === "MINISTER_APPOINTED" || type === "CABINET_CHANGE") {
    return sensational ? "Cabinet reshuffle shakes government" : "Cabinet appointment announced";
  }
  if (type === "EMERGENCY_DECLARED") {
    return sensational
      ? "Emergency powers invoked — crisis deepens"
      : "State of emergency declared";
  }
  if (type.includes("IMPEACH")) {
    return sensational ? "Impeachment crisis grips the capital" : "Impeachment proceedings advance";
  }
  if (type === "JUDGE_NOMINATED" || type === "JUDGE_CONFIRMED") {
    return sensational
      ? "Court bench reshaped by new appointment"
      : "Constitutional judge confirmed";
  }

  // ── Catch-all ─────────────────────────────────────────────────────────────
  return sensational
    ? variant === 1
      ? "Political shock wave hits the capital"
      : "Political storm in Valen"
    : variant === 1
      ? "Government activity reported"
      : "Political developments";
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
      const evPayload = pick.ev.payload as Record<string, unknown> | undefined;
      const fingerprints = state.mediaRuntime.recentHeadlineFingerprints ?? [];
      let primaryHeadline = headlineFor(pick.ev.type, framing, evPayload, 0);
      if (fingerprints.includes(headlineFingerprint(primaryHeadline))) {
        const alt = headlineFor(pick.ev.type, framing, evPayload, 1);
        if (!fingerprints.includes(headlineFingerprint(alt))) {
          primaryHeadline = alt;
        }
      }
      const fp = headlineFingerprint(primaryHeadline);
      const updatedFingerprints = [...fingerprints.filter((f) => f !== fp), fp].slice(-24);
      state.mediaRuntime.recentHeadlineFingerprints = updatedFingerprints;
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
        headlineKey: primaryHeadline,
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
