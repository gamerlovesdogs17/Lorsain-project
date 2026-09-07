import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import { clampUnit } from "../elections/policy.js";
import { provinceThemeLabel } from "../provinces/themes.js";
import { allocateMediaStoryId } from "./state.js";
import { articleStructureFor } from "./articleBody.js";
import { HEADLINE_COOLDOWN_CAP, headlineCooldownKeys, headlineOnCooldown } from "./types.js";
import type { MediaCategory, MediaStory } from "./types.js";
import { ensureOrder } from "../provinces/constitutionGameplay.js";

const EVENT_CATEGORY: Record<string, MediaCategory> = {
  BILL_INTRODUCED: "government",
  BILL_PASSED: "government",
  LAW_ENACTED: "government",
  VETO: "government",
  PRESIDENT_VETO: "government",
  BUDGET_PROPOSED: "government",
  BUDGET_APPROVED: "government",
  BUDGET_CONTINUES: "government",
  ASSEMBLY_MOTION_INTRODUCED: "government",
  ASSEMBLY_MOTION_PASSED: "government",
  ASSEMBLY_MOTION_FAILED: "government",
  REGULATION_ISSUED: "government",
  REGULATION_ANNULLED: "government",
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

/** Optional framing cues — outlet / province / actor, not synonym swaps. */
export type HeadlineContext = {
  outletId?: string;
  outletName?: string;
  provinceId?: string | null;
  provinceLabel?: string | null;
  date?: string;
};

function categoryOf(type: string): MediaCategory {
  if (EVENT_CATEGORY[type]) return EVENT_CATEGORY[type]!;
  if (type.includes("ELEC") || type.includes("CAMPAIGN") || type.includes("POLL"))
    return "elections";
  if (type.includes("COURT") || type.includes("JUDGE") || type.includes("IMPEACH")) return "courts";
  if (type.includes("ORG")) return "organizations";
  if (type.includes("ECON") || type.includes("BUDGET")) return "economy";
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

function pickVariant<T>(lines: readonly T[], variant: number): T {
  return lines[Math.abs(variant) % lines.length]!;
}

function resolveProvinceLabel(
  payload: Record<string, unknown> | undefined,
  context?: HeadlineContext,
): string | null {
  if (context?.provinceLabel) return context.provinceLabel;
  const provinceId =
    context?.provinceId ?? (typeof payload?.provinceId === "string" ? payload.provinceId : null);
  if (!provinceId) return null;
  return provinceThemeLabel(provinceId);
}

function outletDesk(context?: HeadlineContext): string | null {
  const name = context?.outletName?.trim();
  if (!name) return null;
  const short = name.split(/\s+/)[0] ?? name;
  return short.length >= 3 ? short : name;
}

/**
 * Production headline generator.
 * Variants change *structure* (event / institution / region / outlet desk / consequence),
 * not mere synonym swaps.
 */
export function headlineFor(
  type: string,
  framing: MediaStory["framing"],
  payload?: Record<string, unknown>,
  variant = 0,
  context?: HeadlineContext,
): string {
  const sensational = framing === "sensational";
  const critical = framing === "critical";
  const sympathetic = framing === "sympathetic";
  const province = resolveProvinceLabel(payload, context);
  const desk = outletDesk(context);
  // Debate prep is not a held debate — never mint debate-night copy from it.
  if (type === "DEBATE_PREPARED" || type.includes("PREPARE_DEBATE")) {
    return pickVariant(
      sensational
        ? ["Campaign battle heats up", "Race intensifies on the trail"]
        : ["Election campaign activity continues", "Campaign organizations keep working the field"],
      variant,
    );
  }
  const fiscalYear =
    typeof payload?.fiscalYear === "number" || typeof payload?.fiscalYear === "string"
      ? String(payload.fiscalYear)
      : null;
  const title =
    typeof payload?.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : null;

  // ── Budget / fiscal ───────────────────────────────────────────────────────
  if (type === "BUDGET_PROPOSED" || type === "BUDGET_APPROVED" || type === "BUDGET_CONTINUES") {
    const fy = fiscalYear ? ` for ${fiscalYear}` : "";
    if (type === "BUDGET_APPROVED") {
      return pickVariant(
        sensational
          ? [
              `Budget${fy} clears Assembly after tense debate`,
              "Fiscal vote ends weeks of capital brinkmanship",
              desk
                ? `${desk} hails hard-won budget passage`
                : "Budget passage resets the fiscal calendar",
            ]
          : critical
            ? [
                `Budget${fy} approved despite sharp criticism`,
                "Assembly green-lights contested spending plan",
                "Fiscal approval leaves oversight questions open",
              ]
            : [
                `Budget${fy} approved by the Assembly`,
                "Spending plan receives institutional assent",
                desk
                  ? `${desk} notes orderly budget approval`
                  : "Annual budget wins formal approval",
              ],
        variant,
      );
    }
    if (type === "BUDGET_CONTINUES") {
      return pickVariant(
        [
          "Interim budget authority remains in force",
          "Fiscal operations continue under standing authority",
          desk
            ? `${desk}: spending authority rolls forward`
            : "Budget continuity keeps ministries funded",
        ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? [
            `Budget${fy} ignites a capital spending fight`,
            "Treasury plan sparks fiscal showdown",
            province
              ? `${province} watches as budget battle opens`
              : "Fiscal proposal rattles provincial ledgers",
          ]
        : critical
          ? [
              `Budget${fy} faces immediate scrutiny`,
              "Assembly critics target the spending outline",
              desk
                ? `${desk} questions the fiscal priorities`
                : "Proposed budget draws institutional pushback",
            ]
          : sympathetic
            ? [
                `Government tables budget${fy}`,
                "Treasury presents a measured fiscal plan",
                "Budget proposal opens orderly Assembly debate",
              ]
            : [
                `Government tables the annual budget${fy}`,
                "Fiscal plan reaches the Assembly floor",
                province
                  ? `${province} interest rises as budget is tabled`
                  : "Spending outline enters the public record",
                desk
                  ? `${desk} covers the budget introduction`
                  : "Treasury outlines spending priorities",
              ],
      variant,
    );
  }

  // ── Foreign / crisis ──────────────────────────────────────────────────────
  if (type === "FOREIGN_CRISIS_ESCALATED" || type === "FOREIGN_CRISIS_INCIDENT") {
    const theme = typeof payload?.narrativeTitle === "string" ? payload.narrativeTitle : null;
    if (theme) {
      return pickVariant(
        sensational
          ? [
              `${theme[0]!.toUpperCase()}${theme.slice(1)} rattles diplomacy`,
              `Crisis desk: ${theme} threatens regional calm`,
              desk
                ? `${desk} warns of fallout from ${theme}`
                : `Abroad, ${theme} hardens positions`,
            ]
          : critical
            ? [
                `Warning signs mount around ${theme}`,
                `Diplomats fault handling of ${theme}`,
                `Scrutiny grows over ${theme}`,
              ]
            : [
                `International ${theme} draws attention`,
                `Foreign ministries track ${theme}`,
                desk ? `${desk} follows ${theme} abroad` : `Partners consult on ${theme}`,
              ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? ["Diplomatic crisis escalates abroad", "Foreign flashpoint dominates late editions"]
        : ["International crisis escalates", "Diplomacy enters a higher-alert phase"],
      variant,
    );
  }
  if (type === "FOREIGN_CRISIS_DEESCALATED" || type === "FOREIGN_CRISIS_SETTLED") {
    return pickVariant(
      sensational
        ? ["Diplomats pull back from the brink", "Tension eases after tense foreign week"]
        : ["International tensions ease", "Crisis talks yield a quieter outlook"],
      variant,
    );
  }
  if (type === "INTERNATIONAL_CONFLICT_STARTED") {
    return pickVariant(
      sensational
        ? ["War fears grip the Meridian basin", "Armed clash abroad jolts alliance desks"]
        : ["International conflict begins", "Foreign combat reports enter the record"],
      variant,
    );
  }
  if (type === "INTERNATIONAL_CONFLICT_ENDED") {
    const outcome = payload?.outcome;
    return pickVariant(
      sensational
        ? ["Ceasefire shock after foreign clash", "Conflict abroad ends under pressure"]
        : [
            `International conflict ends${outcome ? `: ${outcome}` : ""}`,
            "Combatants stand down after foreign fighting",
          ],
      variant,
    );
  }
  if (type === "SANCTIONS_IMPOSED") {
    return pickVariant(
      sensational
        ? ["Sanctions hammer trade partners", "Economic pressure campaign goes public"]
        : ["New sanctions imposed", "Trade measures tighten against a foreign target"],
      variant,
    );
  }
  if (type === "SANCTIONS_LIFTED") {
    return pickVariant(
      sensational
        ? ["Sanctions lifted in surprise move", "Trade penalties dropped overnight"]
        : ["Sanctions lifted", "Restrictive trade measures are withdrawn"],
      variant,
    );
  }
  if (type === "TREATY_PROPOSED" || type === "TREATY_RATIFIED" || type === "TREATY_REJECTED") {
    const treatyName =
      title ?? (typeof payload?.treatyName === "string" ? payload.treatyName : null);
    if (type === "TREATY_REJECTED") {
      return treatyName
        ? pickVariant(
            [
              `${treatyName} rejected`,
              `Assembly refuses ${treatyName}`,
              desk ? `${desk}: ${treatyName} fails` : `Treaty path closes for ${treatyName}`,
            ],
            variant,
          )
        : pickVariant(["Treaty rejected", "Diplomatic pact fails ratification"], variant);
    }
    if (treatyName) {
      if (type === "TREATY_RATIFIED") {
        return pickVariant(
          sensational
            ? [
                `${treatyName} ratified amid fanfare`,
                `Breakthrough: ${treatyName} sealed`,
                desk ? `${desk} celebrates ${treatyName}` : `${treatyName} clears final hurdles`,
              ]
            : [
                `${treatyName} ratified`,
                `Institutions finalize ${treatyName}`,
                province
                  ? `${province} stakes rise as ${treatyName} is ratified`
                  : `Ratification completes ${treatyName}`,
              ],
          variant,
        );
      }
      return pickVariant(
        sensational
          ? [`${treatyName} proposed in diplomatic push`, `Treaty push: ${treatyName} unveiled`]
          : [
              `${treatyName} proposed`,
              `Diplomats circulate ${treatyName}`,
              desk
                ? `${desk} reports ${treatyName} draft`
                : `Treaty proposal advances: ${treatyName}`,
            ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? ["Treaty talks advance abroad", "Diplomatic breakthrough in the wings"]
        : ["Treaty proposal circulates", "Treaty diplomacy advances"],
      variant,
    );
  }
  if (
    type === "MILITARY_EXERCISES" ||
    type === "MILITARY_POSTURE_CHANGED" ||
    type === "TERENA_POSTURE_CHANGED"
  ) {
    return pickVariant(
      sensational
        ? ["Military posturing raises alarms", "Force posture shift rattles neighbors"]
        : ["Military posture shift reported", "Defense stance updated in public notices"],
      variant,
    );
  }

  // ── Courts ────────────────────────────────────────────────────────────────
  if (type === "COURT_DECISION" || type.includes("COURT")) {
    const caseType = typeof payload?.caseType === "string" ? payload.caseType : null;
    const disposition = typeof payload?.disposition === "string" ? payload.disposition : null;
    if (caseType === "FEDERAL_PROVINCIAL_DISPUTE") {
      if (disposition === "invalidated") {
        return pickVariant(
          sensational
            ? [
                "Court strikes down provincial law",
                province
                  ? `Bench voids ${province} statute`
                  : "Constitutional strike lands on a province",
              ]
            : critical
              ? [
                  "Province overruled on constitutional grounds",
                  "Federal reading prevails over provincial statute",
                ]
              : [
                  "Court rules against provincial law",
                  province
                    ? `${province} statute fails constitutional review`
                    : "Provincial measure falls at constitutional review",
                ],
          variant,
        );
      }
      return pickVariant(
        sensational
          ? [
              "Court backs province in federal clash",
              province
                ? `${province} wins federal-provincial showdown`
                : "Province prevails in court clash",
            ]
          : [
              "Provincial law survives constitutional challenge",
              "Federal-provincial dispute resolved in province's favour",
            ],
        variant,
      );
    }
    if (caseType === "EMERGENCY_REVIEW") {
      return pickVariant(
        sensational
          ? ["Court rules on emergency powers", "Emergency decree meets the bench"]
          : [
              "Constitutional Court reviews emergency declaration",
              "Judges weigh emergency authority",
            ],
        variant,
      );
    }
    if (caseType === "ELECTION_CONSTITUTIONAL_DISPUTE") {
      return pickVariant(
        sensational
          ? ["Court bombshell hits the ballot", "Bench intervenes in election dispute"]
          : [
              "Court resolves electoral constitutional dispute",
              "Electoral dispute reaches constitutional judgment",
            ],
        variant,
      );
    }
    if (caseType === "IMPEACHMENT_JUDGMENT") {
      return pickVariant(
        sensational
          ? ["Court delivers impeachment verdict", "Impeachment judgment lands"]
          : [
              "Constitutional Court rules on impeachment",
              "Impeachment case reaches final judicial step",
            ],
        variant,
      );
    }
    if (caseType === "LAW_REVIEW") {
      return pickVariant(
        sensational
          ? ["Court challenges landmark law", "Legislation faces judicial shock"]
          : ["Constitutional Court reviews legislation", "Statute undergoes constitutional review"],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? ["Court bombshell upends the rules", "Judicial ruling upends expectations"]
        : [
            "Constitutional Court issues a decision",
            desk
              ? `${desk} covers a constitutional ruling`
              : "Bench publishes a constitutional holding",
          ],
      variant,
    );
  }

  // ── Elections ─────────────────────────────────────────────────────────────
  if (type === "PRESIDENTIAL_ELECTION_RESOLVED" || type === "GUBERNATORIAL_ELECTION_RESOLVED") {
    const kind = type === "PRESIDENTIAL_ELECTION_RESOLVED" ? "Presidential" : "Gubernatorial";
    return pickVariant(
      sensational
        ? [
            `${kind} race delivers a shock result`,
            `${kind} election shakes the political landscape`,
            province && kind === "Gubernatorial"
              ? `${province} governorship race ends in drama`
              : `${kind} night reshuffles power`,
          ]
        : critical
          ? [
              `${kind} election results come under scrutiny`,
              `${kind} outcome prompts institutional questions`,
            ]
          : sympathetic
            ? [
                `${kind} election concludes with clear mandate`,
                `${kind} contest closes on a decisive note`,
              ]
            : [
                `${kind} election results certified`,
                `${kind} race called as votes are counted`,
                desk
                  ? `${desk} certifies the ${kind.toLowerCase()} result`
                  : `${kind} tally enters the record`,
              ],
      variant,
    );
  }
  if (type === "PROVINCIAL_ASSEMBLY_ELECTION_RESOLVED") {
    return pickVariant(
      sensational
        ? [
            "Provincial assembly race upends expectations",
            province
              ? `${province} assembly election shocks observers`
              : "Assembly election shocks the province",
          ]
        : critical
          ? ["Assembly election outcome questioned", "Provincial results draw sharp critique"]
          : [
              "Provincial assembly election results in",
              "Provincial assembly seats decided",
              province
                ? `${province} assembly composition is set`
                : "Regional chamber seats are filled",
            ],
      variant,
    );
  }
  if (type.includes("ELECTION_RESOLVED") || type.includes("ELECTION")) {
    return pickVariant(
      sensational
        ? ["Election result rattles the establishment", "Campaign turmoil rocks the race"]
        : [
            "Election results confirmed",
            "Campaign and election developments",
            desk ? `${desk} logs the election outcome` : "Electoral officials close the contest",
          ],
      variant,
    );
  }
  if (type.includes("CAMPAIGN") || type === "CAMPAIGN_LAUNCHED" || type === "DEBATE_HELD") {
    const concrete =
      title ?? (typeof payload?.notableMoment === "string" ? payload.notableMoment : null);
    if (concrete && concrete.length > 0) {
      return concrete;
    }
    if (type === "DEBATE_HELD") {
      return pickVariant(
        sensational
          ? ["Candidates clash in televised debate", "Debate night turns confrontational"]
          : [
              "Candidates hold a public debate",
              "Campaign debate enters the public record",
              desk ? `${desk} stages debate coverage` : "Voters hear candidates on the same stage",
            ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? [
            "Campaign battle heats up",
            "Race intensifies on the trail",
            province
              ? `${province} becomes a contested campaign theatre`
              : "Campaign pressure mounts nationwide",
            "Candidates scramble for advantage",
          ]
        : [
            "Election campaign activity continues",
            "Campaign organizations keep working the field",
            "Candidates maintain their public schedules",
            desk ? `${desk} tracks ongoing campaign activity` : "Campaign period remains active",
            province
              ? `Organizers work ${province} ahead of election day`
              : "Field operations stay on schedule",
          ],
      variant,
    );
  }

  // ── Economy ───────────────────────────────────────────────────────────────
  if (type === "ECONOMIC_SHOCK") {
    return pickVariant(
      sensational
        ? ["Economy on a knife-edge", "Markets reel after economic shock"]
        : ["Economic shock registered", "National accounts record a sharp disturbance"],
      variant,
    );
  }
  if (type.includes("ECON")) {
    return pickVariant(
      sensational
        ? ["Economic storm clouds gather", "Growth worries dominate the cycle"]
        : [
            "Economic conditions update",
            "Statistical offices refresh the economic picture",
            desk
              ? `${desk} briefs the economic read-out`
              : "Economy desk updates the public indicators",
          ],
      variant,
    );
  }

  // ── Organizations ─────────────────────────────────────────────────────────
  if (type === "ORGANIZATION_ENDORSEMENT") {
    const orgName = typeof payload?.organizationName === "string" ? payload.organizationName : null;
    if (orgName) {
      return pickVariant(
        sensational
          ? [`${orgName} takes sides in political battle`, `${orgName} throws weight into the race`]
          : [
              `${orgName} issues endorsement`,
              `Endorsement desk: ${orgName} declares`,
              desk ? `${desk} reports ${orgName} endorsement` : `${orgName} backs a public slate`,
            ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? [
            "Pressure group throws its weight behind a candidate",
            "Interest group endorsement shakes the race",
          ]
        : ["Organization endorsement announced", "Civic group declares a political preference"],
      variant,
    );
  }
  if (type === "ORGANIZATION_ACTION" || type.includes("ORG")) {
    return pickVariant(
      sensational
        ? ["Pressure groups make a scene", "Interest groups mobilize"]
        : [
            "Organizations weigh in on policy",
            "Organizations active in debate",
            desk ? `${desk} covers organized advocacy` : "Civic organizations enter the argument",
          ],
      variant,
    );
  }

  // ── Provincial bills / governor actions ───────────────────────────────────
  if (type === "PROVINCIAL_BILL_INTRODUCED" || type === "GOVERNOR_PROVINCIAL_BILL_PROPOSED") {
    if (title) {
      return pickVariant(
        sensational
          ? [
              `Assembly battle looms over ${title}`,
              province ? `${province} erupts over ${title}` : `Local fight opens over ${title}`,
            ]
          : critical
            ? [
                `Controversial ${title} introduced in provincial assembly`,
                `${title} arrives under provincial criticism`,
              ]
            : sympathetic
              ? [
                  `${title} introduced to tackle local priorities`,
                  `Governor's desk advances ${title}`,
                ]
              : [
                  `${title} tabled in provincial assembly`,
                  `${title} introduced`,
                  province
                    ? `${province} assembly takes up ${title}`
                    : `Provincial chamber receives ${title}`,
                ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? [
            "New bill ignites provincial assembly",
            province
              ? `${province} assembly braces for a legislative fight`
              : "Provincial bill fight breaks into the open",
          ]
        : ["Bill introduced in provincial assembly", "Provincial legislature opens a new file"],
      variant,
    );
  }
  if (type === "PROVINCIAL_BILL_SIGNED") {
    if (title) {
      return pickVariant(
        sensational
          ? [`Governor signs ${title} into law`, `${title} becomes provincial law overnight`]
          : critical
            ? [`Governor enacts controversial ${title}`, `${title} enacted despite criticism`]
            : sympathetic
              ? [`${title} signed into provincial law`, `Local priorities advance with ${title}`]
              : [
                  `Governor signs ${title}`,
                  province ? `${province} enacts ${title}` : `${title} takes provincial effect`,
                ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? ["Governor signs provincial bill into law", "Provincial signing ceremony turns political"]
        : ["Provincial bill signed into law", "Governor completes provincial enactment"],
      variant,
    );
  }
  if (type === "PROVINCIAL_BILL_VETOED") {
    return pickVariant(
      sensational
        ? [
            "Governor vetoes provincial legislation",
            province ? `${province} governor blocks a bill` : "Provincial veto sparks a standoff",
          ]
        : ["Provincial bill vetoed by governor", "Governor returns a provincial bill unused"],
      variant,
    );
  }
  if (type === "PROVINCIAL_BILL_VOTE") {
    return pickVariant(
      sensational
        ? [
            "Assembly vote divides the province",
            province ? `${province} assembly splits on a bill` : "Provincial vote turns combative",
          ]
        : [
            "Provincial assembly votes on legislation",
            "Regional chamber records a legislative vote",
          ],
      variant,
    );
  }

  // ── Assembly motions / regulation ─────────────────────────────────────────
  if (type.startsWith("ASSEMBLY_MOTION_")) {
    return pickVariant(
      sensational
        ? ["Assembly motion sparks floor drama", "Chamber fight erupts over a formal motion"]
        : [
            "Assembly motion advances",
            "Chamber records action on a motion",
            desk ? `${desk} covers the Assembly motion` : "Institutional motion enters debate",
          ],
      variant,
    );
  }
  if (type.includes("REGULATION")) {
    return pickVariant(
      sensational
        ? ["Regulation fight hits the ministries", "Rulemaking controversy breaks open"]
        : ["Ministerial regulation recorded", "Administrative rule enters the public file"],
      variant,
    );
  }

  // ── National bills / vetoes / law ─────────────────────────────────────────
  if (type.includes("VETO") || type === "PRESIDENT_VETO") {
    return pickVariant(
      sensational
        ? [
            "Presidential veto sparks standoff",
            "Veto showdown rocks the assembly",
            desk
              ? `${desk}: veto jolts the capital`
              : "Executive veto upends the legislative calendar",
          ]
        : [
            "Presidential veto issued",
            "Executive returns legislation unused",
            "Veto enters the institutional record",
          ],
      variant,
    );
  }
  if (type === "LAW_ENACTED") {
    return pickVariant(
      sensational
        ? [
            "Major legislation enacted",
            title ? `${title} becomes law in dramatic vote` : "Landmark act takes effect",
          ]
        : [
            "New law enacted by the assembly",
            title ? `${title} is enacted` : "Statute completes the legislative path",
            desk ? `${desk} notes a new enactment` : "Law enters force after final steps",
          ],
      variant,
    );
  }
  if (type.includes("BILL") || type.includes("LAW")) {
    if (title) {
      return pickVariant(
        sensational
          ? [`Legislative battle over ${title}`, `${title} becomes a capitol flashpoint`]
          : critical
            ? [`Scrutiny mounts over ${title}`, `${title} draws institutional criticism`]
            : [
                `${title} advances`,
                `Assembly takes up ${title}`,
                desk ? `${desk} tracks ${title}` : `Legislative file opens on ${title}`,
              ],
        variant,
      );
    }
    return pickVariant(
      sensational
        ? ["Legislative battle reaches its climax", "Capitol showdown over a bill"]
        : [
            "Assembly passes new legislation",
            "Government legislative action",
            desk
              ? `${desk} covers Assembly legislation`
              : "Legislative calendar moves a major file",
          ],
      variant,
    );
  }

  // ── Executive / government ────────────────────────────────────────────────
  if (type === "MINISTER_APPOINTED" || type === "CABINET_CHANGE" || type === "MINISTER_DISMISSED") {
    return pickVariant(
      sensational
        ? ["Cabinet reshuffle shakes government", "Ministerial change rattles the executive"]
        : [
            "Cabinet appointment announced",
            "Executive posts are reassigned",
            desk ? `${desk} reports a cabinet change` : "Ministry roster is updated",
          ],
      variant,
    );
  }
  if (type === "EMERGENCY_DECLARED") {
    return pickVariant(
      sensational
        ? ["Emergency powers invoked — crisis deepens", "Emergency decree grips the capital"]
        : ["State of emergency declared", "Emergency authority enters force"],
      variant,
    );
  }
  if (type.includes("IMPEACH")) {
    return pickVariant(
      sensational
        ? ["Impeachment crisis grips the capital", "Impeachment fight dominates coverage"]
        : ["Impeachment proceedings advance", "Impeachment file moves through institutions"],
      variant,
    );
  }
  if (type === "JUDGE_NOMINATED" || type === "JUDGE_CONFIRMED") {
    return pickVariant(
      sensational
        ? [
            "Court bench reshaped by new appointment",
            "Judicial nomination becomes a political fight",
          ]
        : ["Constitutional judge confirmed", "Judicial vacancy process advances"],
      variant,
    );
  }

  // ── Service delivery / party priorities / governing record ────────────────
  if (type === "SERVICE_DELIVERY_CRITICISM") {
    return pickVariant(
      sensational
        ? ["Service delivery crisis sparks public anger", "Failing services dominate the headlines"]
        : critical
          ? ["Service delivery draws sharp criticism", "Public services fall short of expectations"]
          : [
              "Service delivery draws public criticism",
              "Delivery shortfalls enter the public record",
              desk
                ? `${desk} criticizes service outcomes`
                : "Administrative delivery under scrutiny",
            ],
      variant,
    );
  }
  if (type === "SERVICE_DELIVERY_CREDIT") {
    return pickVariant(
      sensational
        ? ["Service turnaround wins praise", "Delivery gains hailed as a win"]
        : sympathetic
          ? ["Service delivery earns warm credit", "Public services win supportive coverage"]
          : [
              "Service delivery earns public credit",
              "Administrative outcomes draw positive notice",
              desk ? `${desk} credits service gains` : "Service performance enters the record",
            ],
      variant,
    );
  }
  if (type === "PARTY_PRIORITIES_SET") {
    return pickVariant(
      sensational
        ? ["Party redraws its priority battle lines", "New party priorities spark a fight"]
        : [
            "Party sets new priorities",
            "Party leadership announces priority agenda",
            desk ? `${desk} covers a party priorities reset` : "Party priorities enter the record",
          ],
      variant,
    );
  }
  if (type === "GOVERNMENT_RECORD_UPDATED") {
    return pickVariant(
      [
        "Government record refreshed",
        "Official governing performance snapshot published",
        desk ? `${desk} updates the government record` : "Governing record enters the public file",
      ],
      variant,
    );
  }
  if (type === "GOVERNING_FORMATION_FALLBACK") {
    return pickVariant(
      sensational
        ? [
            "Government formation collapses into fallback",
            "Confidence failure forces a constitutional fallback",
          ]
        : [
            "Government formation falls back after failed confidence",
            "Assembly confidence deadlock triggers formation fallback",
          ],
      variant,
    );
  }

  // ── Catch-all — structured templates, never "type word reported" churn ────
  const narrativeTitle =
    typeof payload?.narrativeTitle === "string" ? payload.narrativeTitle.trim() : "";
  const notableMoment =
    typeof payload?.notableMoment === "string" ? payload.notableMoment.trim() : "";
  if (title) {
    return pickVariant(
      sensational
        ? [
            `${title} ignites reaction`,
            `${title} rattles politics`,
            desk ? `${desk}: ${title} erupts` : `${title} dominates the cycle`,
          ]
        : critical
          ? [`Scrutiny follows ${title}`, `${title} draws institutional criticism`]
          : sympathetic
            ? [`${title} draws supportive coverage`, `${title} wins a warmer reception`]
            : [
                `${title} advances`,
                title,
                desk ? `${desk} reports on ${title}` : `Public file opens on ${title}`,
                province ? `${province} watches ${title}` : `Institutions record ${title}`,
              ],
      variant,
    );
  }
  if (notableMoment) return notableMoment;
  if (narrativeTitle) {
    return pickVariant(
      sensational
        ? [
            `${narrativeTitle[0]!.toUpperCase()}${narrativeTitle.slice(1)} draws scrutiny`,
            `Storyline around ${narrativeTitle} hardens`,
          ]
        : [`Developments around ${narrativeTitle}`, `Public attention turns to ${narrativeTitle}`],
      variant,
    );
  }

  const category = categoryOf(type);
  const categoryLines: Record<MediaCategory, string[]> = {
    government: [
      "Executive branch records a public action",
      "Government institutions update the public file",
      desk
        ? `${desk} covers a government development`
        : "Capital institutions move a government file",
      province
        ? `${province} feels a national government decision`
        : "National government action is logged",
    ],
    elections: [
      "Electoral calendar advances",
      "Campaign institutions update the public race",
      desk ? `${desk} follows the election beat` : "Election officials record a new step",
    ],
    courts: [
      "Judicial institutions update the docket",
      "Constitutional process records a new step",
      desk ? `${desk} covers the courts beat` : "The bench remains in public view",
    ],
    economy: [
      "Economic institutions publish a new reading",
      "Fiscal and market desks update conditions",
      desk ? `${desk} briefs the economy` : "Economic indicators enter the record",
    ],
    organizations: [
      "Organized interests enter the public argument",
      "Civic groups press their case",
      desk ? `${desk} covers organizational politics` : "Advocacy groups stay active",
    ],
    foreign: [
      "Foreign affairs desk records a diplomatic step",
      "International relations take a public turn",
      desk ? `${desk} watches the foreign brief` : "Diplomacy updates the public record",
    ],
    politics: [
      "Political developments enter the public record",
      "Partisan argument shifts after a new filing",
      desk ? `${desk} frames the political day` : "Political institutions log a new item",
      province
        ? `Politics in ${province} absorb a national story`
        : "National politics absorb a new public item",
    ],
  };
  const hotLines: Record<MediaCategory, string[]> = {
    government: ["Government move jolts the capital", "Executive action dominates the news cycle"],
    elections: ["Election fight intensifies", "Campaign shockwaves hit the trail"],
    courts: ["Court drama grips the capital", "Judicial clash dominates coverage"],
    economy: ["Economic scare grips markets", "Fiscal nerves dominate the cycle"],
    organizations: ["Pressure politics erupt", "Interest-group clash turns public"],
    foreign: ["Foreign crisis dominates headlines", "Diplomacy takes a hard turn"],
    politics: ["Political scramble grips Valen", "Partisan fight dominates the cycle"],
  };
  const pool = sensational || critical ? hotLines[category] : categoryLines[category];
  return pickVariant(pool, variant);
}

/**
 * Choose a headline that clears exact + structural + event-wording cooldown.
 * Exported for unit tests proving cooldown reduces in-window duplicates.
 */
export function selectHeadlineWithCooldown(
  type: string,
  framing: MediaStory["framing"],
  payload: Record<string, unknown> | undefined,
  recentKeys: readonly string[],
  context?: HeadlineContext,
  maxVariants = 10,
): { headline: string; nextKeys: string[] } {
  let chosen = headlineFor(type, framing, payload, 0, context);
  for (let variant = 0; variant <= maxVariants; variant += 1) {
    const candidate = headlineFor(type, framing, payload, variant, context);
    if (!headlineOnCooldown(recentKeys, type, candidate)) {
      chosen = candidate;
      break;
    }
    chosen = candidate;
  }
  if (headlineOnCooldown(recentKeys, type, chosen)) {
    const desk = outletDesk(context) ?? context?.outletId ?? "Desk";
    const province = resolveProvinceLabel(payload, context);
    const dated = context?.date ? ` (${context.date})` : "";
    const regional = province ? ` — ${province}` : "";
    chosen = `${desk} notes ${categoryOf(type)} development${regional}${dated}`;
    if (headlineOnCooldown(recentKeys, type, chosen)) {
      chosen = `${desk} ${type.toLowerCase().replace(/_/g, " ")}${dated} #${recentKeys.length % 97}`;
    }
  }
  const keys = headlineCooldownKeys(type, chosen);
  const nextKeys = [...recentKeys.filter((k) => !keys.includes(k)), ...keys].slice(
    -HEADLINE_COOLDOWN_CAP,
  );
  return { headline: chosen, nextKeys };
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
      e.type !== "ECONOMY_MONTH" &&
      // Prep is not a held debate — only DEBATE_HELD may generate debate news.
      e.type !== "DEBATE_PREPARED",
  );
  // A4: pressFreedom — modifies outlet behavior based on constitutional press freedom mode
  const pressFreedom = ensureOrder(state).pressFreedom;
  const allOutlets = Object.values(world.mediaOutlets).sort((a, b) => (a.id < b.id ? -1 : 1));
  // licensed_press: reduce outlet diversity (only high-reputation outlets publish freely)
  // state_media_priority: bias toward government-sympathetic framing
  const outlets =
    pressFreedom === "licensed_press"
      ? allOutlets.filter((o) => o.factualReputation >= 0.5 || o.ideology <= 0)
      : allOutlets;
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
        // pressFreedom biases: licensed_press suppresses critical stories; state_media_priority boosts government coverage
        if (pressFreedom === "licensed_press" || pressFreedom === "state_media_priority") {
          if (cat === "government") score += 0.08;
          if (ev.type.includes("IMPEACH") || ev.type.includes("CENSUR")) score -= 0.12;
        }
        if (pressFreedom === "state_media_priority" && cat === "government") score += 0.1;
        return { ev, cat, score };
      })
      .sort((a, b) => b.score - a.score || (a.ev.id < b.ev.id ? -1 : 1));
    const picks = scored.slice(0, outlet.factualReputation > 0.85 ? 2 : 1);
    for (const pick of picks) {
      if (pick.score < 0.28) continue;
      let framing: MediaStory["framing"] =
        outlet.factualReputation < 0.65
          ? "sensational"
          : outlet.ideology > 0.3
            ? "critical"
            : outlet.ideology < -0.3
              ? "sympathetic"
              : "restrained";
      // pressFreedom framing overrides
      if (pressFreedom === "state_media_priority" && pick.cat === "government") {
        framing = "sympathetic";
      }
      if (
        pressFreedom === "licensed_press" &&
        framing === "critical" &&
        pick.cat === "government"
      ) {
        framing = "restrained";
      }
      const evPayload = pick.ev.payload as Record<string, unknown> | undefined;
      const fingerprints = state.mediaRuntime.recentHeadlineFingerprints ?? [];
      const provinceId = typeof evPayload?.provinceId === "string" ? evPayload.provinceId : null;
      const headlineContext = {
        outletId: outlet.id,
        outletName: outlet.name,
        provinceId,
        provinceLabel: provinceId ? provinceThemeLabel(provinceId) : null,
        date: state.currentDate,
      };
      const selected = selectHeadlineWithCooldown(
        pick.ev.type,
        framing,
        evPayload,
        fingerprints,
        headlineContext,
      );
      const primaryHeadline = selected.headline;
      state.mediaRuntime.recentHeadlineFingerprints = selected.nextKeys;
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
        publicEffects: {
          framing,
          bodyStructure: articleStructureFor({
            id,
            outletId: outlet.id,
            category: pick.cat,
            framing,
          }),
        },
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
