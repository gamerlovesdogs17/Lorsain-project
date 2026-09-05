/**
 * Constitutional amendment subjects and alternatives for all 12 Articles
 * of Terena's Constitution.
 *
 * Each ConstitutionChangeSubject describes one amendable clause; its
 * alternatives array includes the founding text (baseline, never proposed as
 * an amendment itself) plus all playable alternatives.
 *
 * Imported by the amendment-proposal UI and the legislature engine.
 */
import type {
  ConstitutionalMetricEffects,
  ConstitutionalOrderState,
  PartySystemMode,
  PresidentialElectionMode,
  AssemblyElectionMode,
  JudicialReviewMode,
  ProvincialCompetenceMode,
  EmergencyPowerMode,
  TreatyApprovalMode,
  AmendmentProcessMode,
  CivilLibertyMode,
  ExecutiveAuthorityMode,
} from "./constitutionalOrder.js";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type ConstitutionChangeAlternative = {
  id: string;
  /** Factual institutional label — NEVER moral/evaluative language. */
  label: string;
  /** Full replacement clause text in Terena constitutional style. */
  proposedClauseText: string;
  /** Bullet strings of gameplay consequences. */
  mechanicalEffects: string[];
  metricEffects: ConstitutionalMetricEffects;
  /** Patches applied to ConstitutionalOrderState on ratification. */
  orderPatch?: Partial<
    Omit<ConstitutionalOrderState, "clauseTexts" | "lastAmendedDate" | "soleLegalPartyId">
  >;
  /** Legacy numeric rule updates when applicable. */
  rulePatch?: Partial<
    Record<
      | "assembly_term_years"
      | "presidential_term_limit"
      | "court_term_years"
      | "veto_override_fraction",
      number
    >
  >;
};

export type ConstitutionChangeSubject = {
  id: string;
  /** ARTICLE_I … ARTICLE_XII */
  articleId: string;
  sectionId: string;
  targetClauseId: string;
  /** Short subject title. */
  subject: string;
  /** id of the alternative whose text matches the founding constitution. */
  foundingAlternativeId: string;
  /** Includes founding baseline + playable change options. */
  alternatives: ConstitutionChangeAlternative[];
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CONSTITUTION_CHANGE_SUBJECTS_DATA: ConstitutionChangeSubject[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE I — Republic & Constitutional Order
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art1_republic_form",
    articleId: "ARTICLE_I",
    sectionId: "ART_I_S1",
    targetClauseId: "ART_I_S1_C1",
    subject: "Form of the Republic",
    foundingAlternativeId: "democratic_republic",
    alternatives: [
      {
        id: "democratic_republic",
        label: "Constitutional democratic republic",
        proposedClauseText:
          "Terena is a constitutional democratic republic. Sovereignty resides in the people and is exercised through their elected representatives and through the institutions established by this Constitution.",
        mechanicalEffects: [
          "Multi-party elections remain the primary mechanism of government formation.",
          "Constitutional Court retains authority to review legislation.",
          "International treaty obligations under standard democratic norms apply.",
        ],
        metricEffects: {
          politicalCompetition: 2,
          governmentLegitimacy: 2,
          civilLiberty: 1,
        },
        orderPatch: { republicForm: "democratic_republic" },
      },
      {
        id: "peoples_republic",
        label: "People's republic with vanguard mandate",
        proposedClauseText:
          "Terena is a people's republic. Sovereignty is exercised by the people through the leading institutions of the republic, which are guided by the principles of popular solidarity and collective advancement.",
        mechanicalEffects: [
          "Executive acquires expanded mandate to act in declared national interest.",
          "Constitutional Court's scope of review is narrowed to procedural matters.",
          "Political pluralism may be subject to subsequent legislative restriction.",
        ],
        metricEffects: {
          politicalCompetition: -2,
          executiveCapacity: 2,
          governmentLegitimacy: -1,
          civilLiberty: -1,
        },
        orderPatch: {
          republicForm: "peoples_republic",
          executiveAuthority: "strengthened_executive",
        },
      },
      {
        id: "unitary_party_republic",
        label: "Unitary party-guided republic",
        proposedClauseText:
          "Terena is a unitary republic. The guiding political institution of the republic shall be designated by the National Assembly and shall direct the fundamental policies of the state.",
        mechanicalEffects: [
          "A single party may be designated as the guiding institution by legislative act.",
          "Presidential elections are conducted under the supervision of the guiding institution.",
          "Opposition party registration requires certification by the guiding institution.",
        ],
        metricEffects: {
          politicalCompetition: -3,
          executiveCapacity: 3,
          governmentLegitimacy: -2,
          civilLiberty: -2,
          institutionalStability: -1,
        },
        orderPatch: {
          republicForm: "unitary_party_republic",
          executiveAuthority: "strengthened_executive",
        },
      },
    ],
  },
  {
    id: "art1_executive_authority",
    articleId: "ARTICLE_I",
    sectionId: "ART_I_S2",
    targetClauseId: "ART_I_S2_C1",
    subject: "Executive authority structure",
    foundingAlternativeId: "constrained_dual_mandate",
    alternatives: [
      {
        id: "constrained_dual_mandate",
        label: "Constrained dual-mandate presidency",
        proposedClauseText:
          "Executive authority is vested in a President elected by the people. The President shares administrative responsibility with a Council of Ministers accountable to the National Assembly. Neither the President nor the Council may act independently in matters reserved by this Constitution to the other.",
        mechanicalEffects: [
          "Presidential decrees in reserved domains require countersignature.",
          "Council of Ministers may delay presidential initiatives requiring legislative funding.",
        ],
        metricEffects: {
          executiveCapacity: 0,
          institutionalStability: 1,
        },
        orderPatch: { executiveAuthority: "constrained_dual_mandate" },
      },
      {
        id: "standard_presidential",
        label: "Standard unified presidential executive",
        proposedClauseText:
          "Executive authority is vested in a President elected by the people. The President appoints and directs the Council of Ministers and is solely responsible for the conduct of executive policy.",
        mechanicalEffects: [
          "President has unilateral appointment and dismissal of ministers.",
          "Council of Ministers countersignature requirement is abolished.",
          "Legislative oversight of executive appointments is limited to budgetary control.",
        ],
        metricEffects: {
          executiveCapacity: 2,
          institutionalStability: -1,
        },
        orderPatch: { executiveAuthority: "standard_presidential" },
      },
      {
        id: "strengthened_executive",
        label: "Strengthened executive presidency",
        proposedClauseText:
          "Executive authority is vested exclusively in the President. The President determines national policy, directs all executive agencies, and issues binding decrees on matters within the executive domain without requirement of legislative co-approval.",
        mechanicalEffects: [
          "Presidential decrees take immediate effect in executive domains.",
          "Legislative can only reverse presidential action by supermajority.",
          "Cabinet is purely advisory; dismissals require no confirmation.",
        ],
        metricEffects: {
          executiveCapacity: 3,
          politicalCompetition: -1,
          civilLiberty: -1,
          institutionalStability: -2,
        },
        orderPatch: { executiveAuthority: "strengthened_executive" },
      },
      {
        id: "assembly_dominant",
        label: "Assembly-dominant executive",
        proposedClauseText:
          "Executive authority is exercised by a Council of Ministers collectively accountable to the National Assembly. The President performs ceremonial and representative functions and may not direct ministers without Assembly authorisation.",
        mechanicalEffects: [
          "Government formation requires Assembly majority approval.",
          "President's decree power is suspended.",
          "Council of Ministers may be removed by a simple no-confidence vote.",
        ],
        metricEffects: {
          executiveCapacity: -1,
          politicalCompetition: 2,
          institutionalStability: -1,
        },
        orderPatch: { executiveAuthority: "assembly_dominant" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE II — Civil Liberties & Political Expression
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art2_civil_liberties",
    articleId: "ARTICLE_II",
    sectionId: "ART_II_S1",
    targetClauseId: "ART_II_S1_C1",
    subject: "Scope of civil and political liberties",
    foundingAlternativeId: "standard_charter",
    alternatives: [
      {
        id: "broad_democratic_liberties",
        label: "Broad enumerated rights charter",
        proposedClauseText:
          "Every citizen of Terena is guaranteed freedom of speech, freedom of association, freedom of assembly, freedom of conscience, and freedom of the press. These rights may not be suspended except by constitutional amendment. The state bears the burden of justifying any limitation.",
        mechanicalEffects: [
          "Emergency speech restrictions require constitutional-level action.",
          "Political parties face no registration barriers grounded in content.",
          "Press licensing is prohibited.",
        ],
        metricEffects: {
          civilLiberty: 3,
          politicalCompetition: 2,
          governmentLegitimacy: 1,
        },
        orderPatch: {
          civilLiberties: "broad_democratic_liberties",
          pressFreedom: "free_press",
        },
      },
      {
        id: "standard_charter",
        label: "Standard rights charter with legislative qualification",
        proposedClauseText:
          "Citizens of Terena enjoy freedom of speech, association, assembly, and conscience. The National Assembly may, by law, impose reasonable limits on these rights where demonstrably justified in a free society and proportionate to a legitimate public objective.",
        mechanicalEffects: [
          "Legislative majorities may qualify rights by proportionality statute.",
          "Courts apply proportionality review to challenged limitations.",
          "Emergency speech powers require legislative approval.",
        ],
        metricEffects: {
          civilLiberty: 1,
          institutionalStability: 1,
        },
        orderPatch: { civilLiberties: "standard_charter" },
      },
      {
        id: "security_qualified_liberties",
        label: "Security-qualified rights framework",
        proposedClauseText:
          "Citizens of Terena enjoy rights of speech, association, and assembly subject to the requirements of national security, public order, and social harmony, as defined by law. The National Assembly shall establish the permissible scope of each right.",
        mechanicalEffects: [
          "Security legislation may restrict speech and assembly by simple majority.",
          "Court review of security-based limitations is deferential.",
          "Public order provisions may restrict protest rights.",
        ],
        metricEffects: {
          civilLiberty: -1,
          executiveCapacity: 1,
          politicalCompetition: -1,
        },
        orderPatch: { civilLiberties: "security_qualified_liberties" },
      },
      {
        id: "restricted_political_expression",
        label: "Restricted political expression regime",
        proposedClauseText:
          "Citizens of Terena exercise rights of speech, association, and assembly within the limits prescribed by law. Political expression that endangers the constitutional order, incites division, or undermines national unity may be prohibited by legislative act without judicial review.",
        mechanicalEffects: [
          "Legislature may proscribe political speech without court oversight.",
          "Opposition parties may be banned by majority vote on public order grounds.",
          "Press licensing authority is granted to the executive.",
        ],
        metricEffects: {
          civilLiberty: -3,
          politicalCompetition: -3,
          governmentLegitimacy: -2,
          executiveCapacity: 2,
        },
        orderPatch: {
          civilLiberties: "restricted_political_expression",
          pressFreedom: "licensed_press",
        },
      },
    ],
  },
  {
    id: "art2_citizenship_guard",
    articleId: "ARTICLE_II",
    sectionId: "ART_II_S2",
    targetClauseId: "ART_II_S2_C1",
    subject: "Citizenship equality and civic duty",
    foundingAlternativeId: "equal_citizenship",
    alternatives: [
      {
        id: "equal_citizenship",
        label: "Equal citizenship without conditioned duty",
        proposedClauseText:
          "All citizens of Terena are equal before the law and enjoy equal civil and political rights. No right of citizenship may be conditioned upon prior completion of public service.",
        mechanicalEffects: [
          "Voting rights are universal for citizens of eligible age.",
          "No service prerequisites for candidacy or party membership.",
        ],
        metricEffects: {
          civilLiberty: 1,
          politicalCompetition: 1,
        },
        orderPatch: { citizenshipGuard: "equal_citizenship" },
      },
      {
        id: "duty_conditioned_citizenship",
        label: "Civic-duty-conditioned political rights",
        proposedClauseText:
          "Citizens of Terena who have completed their civic duties as defined by law, including national service where applicable, hold full political rights. Citizens who have not fulfilled their civic obligations may be subject to restrictions on the right to vote or stand for office as prescribed by law.",
        mechanicalEffects: [
          "National service fulfilment becomes prerequisite for candidacy.",
          "Voter rolls may be conditioned on civic-duty registry.",
          "Legislature defines civic obligations by ordinary statute.",
        ],
        metricEffects: {
          civilLiberty: -1,
          institutionalStability: 1,
          politicalCompetition: -1,
        },
        orderPatch: { citizenshipGuard: "duty_conditioned_citizenship" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE III — President: Term Limit & Election Mode
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art3_presidential_term_limit",
    articleId: "ARTICLE_III",
    sectionId: "ART_III_S1",
    targetClauseId: "ART_III_S1_C3",
    subject: "Presidential term limit",
    foundingAlternativeId: "two_term_limit",
    alternatives: [
      {
        id: "single_term_limit",
        label: "Single presidential term",
        proposedClauseText:
          "No person may be elected President more than once. Acting service does not constitute an elected term.",
        mechanicalEffects: [
          "A president may serve exactly one elected term.",
          "No incumbent can seek re-election; every presidential election produces a new president.",
        ],
        metricEffects: {
          politicalCompetition: 2,
          institutionalStability: 1,
        },
        rulePatch: { presidential_term_limit: 1 },
      },
      {
        id: "two_term_limit",
        label: "Two-term presidential limit",
        proposedClauseText:
          "No person may be elected President more than two times. Acting service does not constitute an elected term.",
        mechanicalEffects: [
          "The constitutional default; a president may serve two elected terms.",
          "After two terms the person is permanently ineligible for the presidency.",
        ],
        metricEffects: {
          politicalCompetition: 1,
          institutionalStability: 1,
        },
        rulePatch: { presidential_term_limit: 2 },
      },
      {
        id: "three_term_limit",
        label: "Three-term presidential limit",
        proposedClauseText:
          "No person may be elected President more than three times. Acting service does not constitute an elected term.",
        mechanicalEffects: [
          "A president may seek up to three elected terms before permanent ineligibility.",
          "Incumbents have an additional term of campaign advantage over challengers.",
        ],
        metricEffects: {
          politicalCompetition: -1,
          executiveCapacity: 1,
        },
        rulePatch: { presidential_term_limit: 3 },
      },
      {
        id: "no_term_limit",
        label: "No constitutional limit on presidential terms",
        proposedClauseText:
          "There is no constitutional limit on the number of times a person may be elected President. Acting service does not constitute an elected term.",
        mechanicalEffects: [
          "Presidential re-election is unrestricted by prior terms.",
          "A sitting president may seek re-election indefinitely.",
          "Incumbent advantage in each election cycle is uncapped.",
        ],
        metricEffects: {
          politicalCompetition: -2,
          executiveCapacity: 2,
          institutionalStability: -1,
          governmentLegitimacy: -1,
        },
        rulePatch: { presidential_term_limit: 0 },
      },
    ],
  },
  {
    id: "art3_presidential_election_mode",
    articleId: "ARTICLE_III",
    sectionId: "ART_III_S2",
    targetClauseId: "ART_III_S2_C1",
    subject: "Method of presidential election",
    foundingAlternativeId: "national_rcv",
    alternatives: [
      {
        id: "national_rcv",
        label: "National ranked-choice vote",
        proposedClauseText:
          "The President is elected by national ranked-choice ballot. Each voter ranks candidates in order of preference. If no candidate receives an absolute majority of first preferences, preferences are redistributed from eliminated candidates until one candidate holds a majority.",
        mechanicalEffects: [
          "Minor candidates can receive preference flows; broad coalition-building rewarded.",
          "A second round of counting is conducted automatically without a separate runoff election.",
        ],
        metricEffects: {
          politicalCompetition: 2,
          governmentLegitimacy: 1,
        },
        orderPatch: { presidentialElection: "national_rcv" },
      },
      {
        id: "plurality",
        label: "National plurality vote",
        proposedClauseText:
          "The President is elected by national plurality ballot. The candidate receiving the greatest number of valid votes cast is elected President.",
        mechanicalEffects: [
          "Candidate with most first-preference votes wins regardless of majority.",
          "Spoiler effects favour candidates with concentrated core support.",
        ],
        metricEffects: {
          politicalCompetition: 0,
          institutionalStability: 1,
        },
        orderPatch: { presidentialElection: "plurality" },
      },
      {
        id: "majority_runoff",
        label: "Two-round majority runoff",
        proposedClauseText:
          "The President is elected by national ballot. If no candidate receives an absolute majority of valid votes in the first round, a second round is held between the two highest-placed candidates from the first round.",
        mechanicalEffects: [
          "Second-round contests require centrist coalition-building.",
          "Minor parties can influence outcomes by directing supporter preferences between rounds.",
        ],
        metricEffects: {
          politicalCompetition: 1,
          governmentLegitimacy: 1,
        },
        orderPatch: { presidentialElection: "majority_runoff" },
      },
      {
        id: "assembly_selection",
        label: "Assembly election of President",
        proposedClauseText:
          "The President is elected by the National Assembly by absolute majority vote. If no candidate achieves an absolute majority after three rounds of balloting, the National Assembly elects the President by plurality on the fourth round.",
        mechanicalEffects: [
          "Presidential election is absorbed into legislative coalition politics.",
          "Direct popular vote for president is abolished.",
          "Governing party controls presidential selection if it holds a majority.",
        ],
        metricEffects: {
          politicalCompetition: -1,
          governmentLegitimacy: -1,
          institutionalStability: 1,
          executiveCapacity: 1,
        },
        orderPatch: { presidentialElection: "assembly_selection" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE IV — National Assembly: Term & Election Mode
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art4_assembly_term",
    articleId: "ARTICLE_IV",
    sectionId: "ART_IV_S1",
    targetClauseId: "ART_IV_S1_C2",
    subject: "Assembly term length",
    foundingAlternativeId: "four_year_assembly",
    alternatives: [
      {
        id: "three_year_assembly",
        label: "Three-year legislative cycle",
        proposedClauseText:
          "The ordinary term of the National Assembly is three years. Members remain in office until their successors assume office on 1 June following the election.",
        mechanicalEffects: [
          "Assembly elections occur every three years.",
          "Governing coalitions must renew their mandate on a shorter horizon.",
        ],
        metricEffects: {
          politicalCompetition: 2,
          institutionalStability: -1,
        },
        rulePatch: { assembly_term_years: 3 },
      },
      {
        id: "four_year_assembly",
        label: "Four-year legislative cycle",
        proposedClauseText:
          "The ordinary term of the National Assembly is four years. Members remain in office until their successors assume office on 1 June following the election.",
        mechanicalEffects: [
          "The constitutional default; aligns with current Terena practice.",
          "Assembly elections occur every four years.",
        ],
        metricEffects: {
          institutionalStability: 1,
        },
        rulePatch: { assembly_term_years: 4 },
      },
      {
        id: "five_year_assembly",
        label: "Five-year legislative cycle",
        proposedClauseText:
          "The ordinary term of the National Assembly is five years. Members remain in office until their successors assume office on 1 June following the election.",
        mechanicalEffects: [
          "Assembly elections occur every five years.",
          "Incumbents have a longer planning horizon and reduced mid-term electoral pressure.",
        ],
        metricEffects: {
          institutionalStability: 2,
          politicalCompetition: -1,
        },
        rulePatch: { assembly_term_years: 5 },
      },
      {
        id: "six_year_assembly",
        label: "Six-year legislative cycle",
        proposedClauseText:
          "The ordinary term of the National Assembly is six years. Members remain in office until their successors assume office on 1 June following the election.",
        mechanicalEffects: [
          "Longest available legislative term; national electoral campaigns are substantially less frequent.",
          "Governing party faces accountability only at long intervals.",
        ],
        metricEffects: {
          institutionalStability: 2,
          politicalCompetition: -2,
          governmentLegitimacy: -1,
        },
        rulePatch: { assembly_term_years: 6 },
      },
    ],
  },
  {
    id: "art4_assembly_election_mode",
    articleId: "ARTICLE_IV",
    sectionId: "ART_IV_S2",
    targetClauseId: "ART_IV_S2_C1",
    subject: "Assembly electoral system",
    foundingAlternativeId: "stv",
    alternatives: [
      {
        id: "stv",
        label: "Single transferable vote in multi-member constituencies",
        proposedClauseText:
          "Members of the National Assembly are elected by single transferable vote in multi-member constituencies. The number of seats per constituency and constituency boundaries are determined by law.",
        mechanicalEffects: [
          "Proportional outcomes within each constituency; minor parties can win seats.",
          "Preference flows determine final seat allocation; broad appeal rewarded.",
        ],
        metricEffects: {
          politicalCompetition: 2,
          governmentLegitimacy: 1,
        },
        orderPatch: { assemblyElection: "stv" },
      },
      {
        id: "closed_list_pr",
        label: "Closed-list proportional representation",
        proposedClauseText:
          "Members of the National Assembly are elected by closed-list proportional representation. Voters cast a vote for a party list; seats are allocated among parties according to their national share of valid votes by the method prescribed by law.",
        mechanicalEffects: [
          "Party leadership controls candidate ordering on lists.",
          "Highly proportional outcomes at national level.",
          "Individual legislators owe their seat primarily to party leadership.",
        ],
        metricEffects: {
          politicalCompetition: 1,
          institutionalStability: 1,
        },
        orderPatch: { assemblyElection: "closed_list_pr" },
      },
      {
        id: "mixed_member",
        label: "Mixed-member proportional system",
        proposedClauseText:
          "Members of the National Assembly are elected under a mixed-member proportional system. Each voter casts two votes: one for a local constituency representative elected by plurality, and one for a party list used to achieve proportional representation at the national level.",
        mechanicalEffects: [
          "Half of seats decided by local plurality; half by proportional top-up.",
          "Parties with concentrated local support may underperform on proportional list.",
        ],
        metricEffects: {
          politicalCompetition: 1,
          governmentLegitimacy: 1,
          institutionalStability: 1,
        },
        orderPatch: { assemblyElection: "mixed_member" },
      },
      {
        id: "fptp",
        label: "First-past-the-post single-member constituencies",
        proposedClauseText:
          "Members of the National Assembly are each elected from a single-member constituency by plurality vote. Constituency boundaries are determined by law.",
        mechanicalEffects: [
          "Highly disproportionate results are possible; large parties over-represented.",
          "Minor parties win seats only if their support is geographically concentrated.",
          "Strong local accountability between member and constituency.",
        ],
        metricEffects: {
          politicalCompetition: -2,
          institutionalStability: 1,
          governmentLegitimacy: -1,
        },
        orderPatch: { assemblyElection: "fptp" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE V — Legislation & Veto Override
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art5_veto_override",
    articleId: "ARTICLE_V",
    sectionId: "ART_V_S3",
    targetClauseId: "ART_V_S3_C2",
    subject: "Presidential veto override threshold",
    foundingAlternativeId: "two_thirds_override",
    alternatives: [
      {
        id: "fifty_five_override",
        label: "Fifty-five percent override threshold",
        proposedClauseText:
          "A bill returned by the President with objections may be enacted into law if repassed by at least fifty-five percent of the sitting members of the National Assembly.",
        mechanicalEffects: [
          "A governing majority coalition can defeat a presidential veto without cross-party support.",
          "Presidential veto power is weakest relative to all available thresholds.",
        ],
        metricEffects: {
          executiveCapacity: -1,
          politicalCompetition: 1,
        },
        rulePatch: { veto_override_fraction: 0.55 },
      },
      {
        id: "three_fifths_override",
        label: "Three-fifths override threshold",
        proposedClauseText:
          "A bill returned by the President with objections may be enacted into law if repassed by at least three-fifths of the sitting members of the National Assembly.",
        mechanicalEffects: [
          "Three-fifths threshold requires meaningful cross-party support.",
          "A strong governing majority can override vetoes without a full supermajority.",
        ],
        metricEffects: {
          executiveCapacity: 0,
          institutionalStability: 1,
        },
        rulePatch: { veto_override_fraction: 0.6 },
      },
      {
        id: "two_thirds_override",
        label: "Two-thirds override threshold",
        proposedClauseText:
          "A bill returned by the President with objections may be enacted into law if repassed by at least two-thirds of the sitting members of the National Assembly.",
        mechanicalEffects: [
          "Standard supermajority; presidential vetoes require broad legislative consensus to override.",
          "The constitutional default reinforcing executive influence on contentious bills.",
        ],
        metricEffects: {
          executiveCapacity: 1,
          institutionalStability: 1,
        },
        rulePatch: { veto_override_fraction: 2 / 3 },
      },
      {
        id: "three_quarters_override",
        label: "Three-quarters override threshold",
        proposedClauseText:
          "A bill returned by the President with objections may be enacted into law if repassed by at least three-quarters of the sitting members of the National Assembly.",
        mechanicalEffects: [
          "Presidential vetoes are nearly irreversible without near-unanimous assembly agreement.",
          "Executive holds maximum legislative blocking power.",
        ],
        metricEffects: {
          executiveCapacity: 2,
          institutionalStability: -1,
        },
        rulePatch: { veto_override_fraction: 0.75 },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE VI — Cabinet Formation
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art6_cabinet_formation",
    articleId: "ARTICLE_VI",
    sectionId: "ART_VI_S1",
    targetClauseId: "ART_VI_S1_C1",
    subject: "Cabinet formation and accountability",
    foundingAlternativeId: "presidential_choice",
    alternatives: [
      {
        id: "presidential_choice",
        label: "Presidential appointment of ministers",
        proposedClauseText:
          "The President appoints and dismisses the members of the Council of Ministers. Ministers serve at the President's pleasure and are individually accountable to the President for the conduct of their portfolios.",
        mechanicalEffects: [
          "President selects any qualified citizen as minister; Assembly approval not required.",
          "Ministers dismissed by presidential decree without legislative recourse.",
        ],
        metricEffects: {
          executiveCapacity: 2,
          institutionalStability: 1,
        },
        orderPatch: { cabinetFormation: "presidential_choice" },
      },
      {
        id: "assembly_confidence",
        label: "Council of Ministers subject to Assembly confidence",
        proposedClauseText:
          "The Council of Ministers is collectively accountable to the National Assembly. The President nominates a Prime Minister who must command the confidence of the National Assembly. The Council of Ministers may be removed by a vote of no confidence passed by absolute majority.",
        mechanicalEffects: [
          "Government formation requires negotiation of an assembly majority.",
          "Council can fall on a no-confidence vote; new elections or coalition renegotiation required.",
          "President's role in day-to-day government is reduced to supervision.",
        ],
        metricEffects: {
          executiveCapacity: -1,
          politicalCompetition: 2,
          institutionalStability: -1,
        },
        orderPatch: { cabinetFormation: "assembly_confidence" },
      },
      {
        id: "party_slate",
        label: "Ministerial slate determined by governing party",
        proposedClauseText:
          "The Council of Ministers is constituted by the ministerial slate designated by the party or coalition that commands a majority in the National Assembly. The President has the power to reject individual nominees on grounds of legal incapacity only.",
        mechanicalEffects: [
          "Governing party controls cabinet composition directly.",
          "Presidential influence over portfolio allocation is minimal.",
          "Coalition parties negotiate ministerial shares before government formation.",
        ],
        metricEffects: {
          politicalCompetition: 1,
          executiveCapacity: 0,
          institutionalStability: 1,
        },
        orderPatch: { cabinetFormation: "party_slate" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE VII — Political Parties & Party System
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art7_party_system",
    articleId: "ARTICLE_VII",
    sectionId: "ART_VII_S1",
    targetClauseId: "ART_VII_S1_C1",
    subject: "Political party system",
    foundingAlternativeId: "competitive_multiparty",
    alternatives: [
      {
        id: "competitive_multiparty",
        label: "Open competitive multiparty system",
        proposedClauseText:
          "Political parties are freely formed and may participate in elections upon registration with the Electoral Commission. No party shall be denied registration on grounds of its political programme, provided that programme does not advocate the forcible overthrow of the constitutional order.",
        mechanicalEffects: [
          "Any political party meeting neutral administrative criteria may register.",
          "Party competition is the primary mechanism of political organisation.",
          "No party holds institutionally privileged access to state resources.",
        ],
        metricEffects: {
          politicalCompetition: 3,
          civilLiberty: 2,
          governmentLegitimacy: 2,
        },
        orderPatch: { partySystem: "competitive_multiparty" },
      },
      {
        id: "restricted_registration",
        label: "Regulated party registration with prior approval",
        proposedClauseText:
          "Political parties may be formed and may contest elections upon approval by the National Registration Authority. The Authority shall assess compliance with democratic internal procedures, financial transparency requirements, and the preservation of national unity before granting registration.",
        mechanicalEffects: [
          "Party registration requires prior approval; authority has discretion to deny.",
          "Incumbent government can influence registration criteria through the Authority.",
          "New party formation is slowed; established parties have structural advantage.",
        ],
        metricEffects: {
          politicalCompetition: -1,
          institutionalStability: 1,
          civilLiberty: -1,
        },
        orderPatch: { partySystem: "restricted_registration" },
      },
      {
        id: "single_legal_party",
        label: "Single designated legal party",
        proposedClauseText:
          "The National Assembly shall by law designate a single political party as the legal vehicle of national political organisation. No other party may register, campaign, or field candidates for office. Citizens may exercise political participation through the institutions of the designated party.",
        mechanicalEffects: [
          "All opposition party activity becomes illegal.",
          "Electoral competition is restricted to candidates within the single party.",
          "Party organs acquire state powers over candidate selection and policy.",
          "Constitutional Court's ability to strike down party restrictions is removed.",
        ],
        metricEffects: {
          politicalCompetition: -5,
          civilLiberty: -4,
          governmentLegitimacy: -3,
          executiveCapacity: 2,
          institutionalStability: -2,
        },
        orderPatch: { partySystem: "single_legal_party" },
      },
      {
        id: "nonpartisan_candidates",
        label: "Non-partisan candidate elections",
        proposedClauseText:
          "Elections to the National Assembly and to the Presidency shall be conducted on a non-partisan basis. Candidates appear on the ballot as individuals without party endorsement. No candidate may publicly affiliate with or receive campaign resources from a political party during the election period.",
        mechanicalEffects: [
          "Party labels removed from ballots; candidate-centred campaigning replaces party campaigns.",
          "Informal factional groupings may persist but hold no official ballot status.",
          "Party discipline in the Assembly is weakened; independent voting increases.",
        ],
        metricEffects: {
          politicalCompetition: 1,
          institutionalStability: -1,
          governmentLegitimacy: 0,
        },
        orderPatch: { partySystem: "nonpartisan_candidates" },
      },
    ],
  },
  {
    id: "art7_press_freedom",
    articleId: "ARTICLE_VII",
    sectionId: "ART_VII_S2",
    targetClauseId: "ART_VII_S2_C1",
    subject: "Press and media freedom",
    foundingAlternativeId: "free_press",
    alternatives: [
      {
        id: "free_press",
        label: "Free press without licensing",
        proposedClauseText:
          "The press and other media of communication are free. No licence is required to publish, broadcast, or otherwise disseminate information to the public. The state shall not own or direct editorial content of private media.",
        mechanicalEffects: [
          "Independent media can investigate and report without regulatory risk.",
          "Government has no prior restraint power over publication.",
        ],
        metricEffects: {
          civilLiberty: 2,
          politicalCompetition: 1,
        },
        orderPatch: { pressFreedom: "free_press" },
      },
      {
        id: "licensed_press",
        label: "Licensed media with government approval",
        proposedClauseText:
          "The operation of media outlets requires a licence issued by the National Communications Authority. The Authority may condition, suspend, or revoke licences on grounds prescribed by law, including national security and social order.",
        mechanicalEffects: [
          "Executive-appointed Authority controls media entry and exit.",
          "Critical outlets risk licence suspension.",
          "New independent outlets require government approval to operate.",
        ],
        metricEffects: {
          civilLiberty: -2,
          executiveCapacity: 1,
          politicalCompetition: -1,
        },
        orderPatch: { pressFreedom: "licensed_press" },
      },
      {
        id: "state_media_priority",
        label: "State-owned media with priority access",
        proposedClauseText:
          "The state shall maintain a national broadcasting service with priority access to public spectrum. Private media may operate on spectrum not reserved to the national service. The national broadcasting service shall provide balanced coverage of all registered political parties.",
        mechanicalEffects: [
          "State broadcaster has preferential spectrum allocation.",
          "Private media must operate on residual spectrum.",
          "Government messaging has structural amplification advantage.",
        ],
        metricEffects: {
          civilLiberty: -1,
          executiveCapacity: 1,
          politicalCompetition: -1,
        },
        orderPatch: { pressFreedom: "state_media_priority" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE VIII — Constitutional Court: Term & Judicial Review
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art8_court_term",
    articleId: "ARTICLE_VIII",
    sectionId: "ART_VIII_S2",
    targetClauseId: "ART_VIII_S2_C1",
    subject: "Constitutional Court judicial term",
    foundingAlternativeId: "nine_year_court",
    alternatives: [
      {
        id: "six_year_court",
        label: "Six-year judicial term",
        proposedClauseText:
          "Justices of the Constitutional Court serve non-renewable terms of six years and may not thereafter be reappointed to that Court.",
        mechanicalEffects: [
          "Court seats turn over rapidly; vacancies are politically significant.",
          "Appointments arise every several years, increasing salience of each vacancy.",
        ],
        metricEffects: {
          judicialIndependence: -1,
          institutionalStability: -1,
        },
        rulePatch: { court_term_years: 6 },
      },
      {
        id: "nine_year_court",
        label: "Nine-year judicial term",
        proposedClauseText:
          "Justices of the Constitutional Court serve non-renewable terms of nine years and may not thereafter be reappointed to that Court.",
        mechanicalEffects: [
          "Moderate tenure; the constitutional default balancing independence with renewal.",
          "Court composition changes on a medium-term horizon.",
        ],
        metricEffects: {
          judicialIndependence: 1,
          institutionalStability: 1,
        },
        rulePatch: { court_term_years: 9 },
      },
      {
        id: "twelve_year_court",
        label: "Twelve-year judicial term",
        proposedClauseText:
          "Justices of the Constitutional Court serve non-renewable terms of twelve years and may not thereafter be reappointed to that Court.",
        mechanicalEffects: [
          "Extended tenure; justices serve across multiple presidential administrations.",
          "Court appointments are infrequent; each carries long-term significance.",
        ],
        metricEffects: {
          judicialIndependence: 2,
          institutionalStability: 2,
        },
        rulePatch: { court_term_years: 12 },
      },
      {
        id: "fifteen_year_court",
        label: "Fifteen-year judicial term",
        proposedClauseText:
          "Justices of the Constitutional Court serve non-renewable terms of fifteen years and may not thereafter be reappointed to that Court.",
        mechanicalEffects: [
          "Longest available tenure; Court appointments are rare generational events.",
          "A justice appointed young may sit through three or more presidential administrations.",
        ],
        metricEffects: {
          judicialIndependence: 3,
          institutionalStability: 2,
        },
        rulePatch: { court_term_years: 15 },
      },
    ],
  },
  {
    id: "art8_judicial_review",
    articleId: "ARTICLE_VIII",
    sectionId: "ART_VIII_S3",
    targetClauseId: "ART_VIII_S3_C1",
    subject: "Scope of judicial review",
    foundingAlternativeId: "standard_review",
    alternatives: [
      {
        id: "strong_review",
        label: "Strong-form judicial review with supremacy clause",
        proposedClauseText:
          "The Constitutional Court has the power to strike down any law, decree, or executive act that is inconsistent with this Constitution. Such a ruling has binding effect on all branches of government and may not be overridden by ordinary legislation.",
        mechanicalEffects: [
          "Court rulings are binding and irreversible by ordinary majority.",
          "Legislation can only survive a constitutional challenge if amended.",
          "Executive orders are subject to immediate constitutional scrutiny.",
        ],
        metricEffects: {
          judicialIndependence: 3,
          civilLiberty: 2,
          institutionalStability: 1,
        },
        orderPatch: { judicialReview: "strong_review" },
      },
      {
        id: "standard_review",
        label: "Standard judicial review",
        proposedClauseText:
          "The Constitutional Court may review and annul legislation and executive acts found to be inconsistent with this Constitution. The National Assembly may re-enact struck legislation only after constitutional amendment.",
        mechanicalEffects: [
          "Standard annulment power; struck laws require constitutional amendment to revive.",
          "The constitutional default for Terena's judiciary.",
        ],
        metricEffects: {
          judicialIndependence: 1,
          institutionalStability: 1,
        },
        orderPatch: { judicialReview: "standard_review" },
      },
      {
        id: "deferential_review",
        label: "Deferential review with legislative discretion",
        proposedClauseText:
          "The Constitutional Court reviews legislation for manifest constitutional incompatibility only. The Court shall defer to the judgment of the National Assembly on matters of policy and shall not substitute its assessment of proportionality for that of the legislature.",
        mechanicalEffects: [
          "Court only strikes laws with clear, manifest constitutional breach.",
          "Proportionality arguments are unavailable as grounds for annulment.",
          "Legislature retains wide discretion over rights-limiting statutes.",
        ],
        metricEffects: {
          judicialIndependence: -1,
          civilLiberty: -1,
          executiveCapacity: 1,
        },
        orderPatch: { judicialReview: "deferential_review" },
      },
      {
        id: "legislative_finality",
        label: "Legislative finality with advisory court",
        proposedClauseText:
          "The Constitutional Court provides advisory opinions on the constitutionality of legislation upon request of the President or the National Assembly. Such opinions are not binding. The National Assembly has final authority to determine the constitutionality of its own laws.",
        mechanicalEffects: [
          "Court rulings carry only persuasive force; Assembly can disregard them.",
          "Rights protections become politically contingent on legislative goodwill.",
          "No independent judicial check on legislative supremacy.",
        ],
        metricEffects: {
          judicialIndependence: -3,
          civilLiberty: -2,
          governmentLegitimacy: -1,
          executiveCapacity: 1,
        },
        orderPatch: { judicialReview: "legislative_finality" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE IX — Provincial Competence
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art9_provincial_competence",
    articleId: "ARTICLE_IX",
    sectionId: "ART_IX_S1",
    targetClauseId: "ART_IX_S1_C1",
    subject: "Division of powers between nation and provinces",
    foundingAlternativeId: "concurrent_powers",
    alternatives: [
      {
        id: "enumerated_provincial",
        label: "Enumerated provincial powers with residual national authority",
        proposedClauseText:
          "Provinces exercise the powers enumerated in Schedule B of this Constitution. All matters not expressly enumerated as provincial are reserved to the national government. Provincial legislation inconsistent with national law is void.",
        mechanicalEffects: [
          "Provinces hold only listed powers; national government dominates unlisted domains.",
          "National legislation overrides provincial acts in all shared areas.",
        ],
        metricEffects: {
          provincialAutonomy: -1,
          executiveCapacity: 1,
          institutionalStability: 1,
        },
        orderPatch: { provincialCompetence: "enumerated_provincial" },
      },
      {
        id: "concurrent_powers",
        label: "Concurrent powers with national supremacy on conflict",
        proposedClauseText:
          "The national government and provinces exercise concurrent legislative authority over the matters listed in Schedule A. In the event of inconsistency, national law prevails to the extent of the inconsistency. Provinces may legislate more stringently in areas of concurrent competence.",
        mechanicalEffects: [
          "Both levels of government may legislate in shared areas.",
          "Provinces may exceed national standards but not undercut them.",
          "National legislation supersedes provincial acts in conflict.",
        ],
        metricEffects: {
          provincialAutonomy: 1,
          institutionalStability: 1,
        },
        orderPatch: { provincialCompetence: "concurrent_powers" },
      },
      {
        id: "national_supremacy",
        label: "National supremacy with subordinate provincial administration",
        proposedClauseText:
          "The national government holds supreme legislative authority over all matters of national concern. Provinces administer nationally prescribed standards and may supplement national legislation only with the approval of the Minister responsible.",
        mechanicalEffects: [
          "Provinces are essentially administrative arms of the national government.",
          "Provincial legislative innovation requires ministerial approval.",
          "Central government can direct provincial spending and regulatory priorities.",
        ],
        metricEffects: {
          provincialAutonomy: -2,
          executiveCapacity: 2,
          institutionalStability: 1,
        },
        orderPatch: {
          provincialCompetence: "national_supremacy",
          localGovernment: "nationally_directed",
        },
      },
      {
        id: "strong_devolution",
        label: "Strong devolution with enumerated national powers",
        proposedClauseText:
          "Provinces hold primary legislative authority in all matters not enumerated as exclusively national in Schedule C. The national government may not legislate in areas of provincial primary competence without the consent of a majority of provincial assemblies.",
        mechanicalEffects: [
          "Provinces are the default legislators; national government must seek provincial consent in many areas.",
          "National policy harmonisation requires interprovincial negotiation.",
          "Fiscal autonomy of provinces is substantially increased.",
        ],
        metricEffects: {
          provincialAutonomy: 3,
          executiveCapacity: -2,
          institutionalStability: -1,
        },
        orderPatch: {
          provincialCompetence: "strong_devolution",
          localGovernment: "provincial_primary",
        },
      },
    ],
  },
  {
    id: "art9_local_government",
    articleId: "ARTICLE_IX",
    sectionId: "ART_IX_S2",
    targetClauseId: "ART_IX_S2_C1",
    subject: "Local government authority",
    foundingAlternativeId: "provincial_primary",
    alternatives: [
      {
        id: "provincial_primary",
        label: "Provinces as primary local-government authority",
        proposedClauseText:
          "Local government is constituted and regulated by provincial law. Each province shall establish a system of municipalities exercising the functions prescribed by provincial statute.",
        mechanicalEffects: [
          "Municipal structure varies by province; no uniform national local-government template.",
          "Provinces control municipal finances and competences.",
        ],
        metricEffects: {
          provincialAutonomy: 2,
        },
        orderPatch: { localGovernment: "provincial_primary" },
      },
      {
        id: "shared_local_gov",
        label: "Shared national-provincial local government framework",
        proposedClauseText:
          "Local government is regulated jointly by national framework legislation and provincial supplementary law. The national framework establishes minimum powers, revenue sources, and accountability standards for all municipalities.",
        mechanicalEffects: [
          "National minimum standards apply to all municipalities regardless of province.",
          "Provinces may add to but not reduce national municipal powers.",
        ],
        metricEffects: {
          provincialAutonomy: 0,
          institutionalStability: 1,
        },
        orderPatch: { localGovernment: "shared" },
      },
      {
        id: "nationally_directed_local",
        label: "Nationally directed municipalities",
        proposedClauseText:
          "Municipalities are creatures of national law. The national government prescribes the powers, functions, and internal structures of all municipalities. Provincial modification of municipal competences requires national ministerial approval.",
        mechanicalEffects: [
          "Uniform municipal structure across all provinces.",
          "National government can reorganise or merge municipalities unilaterally.",
          "Provincial influence over local governance is minimal.",
        ],
        metricEffects: {
          provincialAutonomy: -2,
          executiveCapacity: 1,
        },
        orderPatch: { localGovernment: "nationally_directed" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE X — Emergency Powers
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art10_emergency_powers",
    articleId: "ARTICLE_X",
    sectionId: "ART_X_S1",
    targetClauseId: "ART_X_S1_C1",
    subject: "Scope and oversight of emergency powers",
    foundingAlternativeId: "standard_emergency",
    alternatives: [
      {
        id: "narrow_assembly_supervised",
        label: "Narrowly defined emergency with ongoing Assembly supervision",
        proposedClauseText:
          "A state of emergency may be declared by the President only upon approval of two-thirds of the National Assembly and only in response to a threat of armed insurrection, natural catastrophe, or foreign invasion. Emergency measures may not suspend civil or political rights. The Assembly may revoke the state of emergency by simple majority at any time.",
        mechanicalEffects: [
          "Emergency declaration requires supermajority Assembly approval.",
          "Rights cannot be suspended during emergencies.",
          "Assembly revocation power is immediate and by simple majority.",
        ],
        metricEffects: {
          civilLiberty: 2,
          judicialIndependence: 1,
          executiveCapacity: -1,
        },
        orderPatch: { emergencyPowers: "narrow_assembly_supervised" },
      },
      {
        id: "standard_emergency",
        label: "Standard emergency with time-limited executive decree",
        proposedClauseText:
          "The President may declare a state of emergency in response to a grave national threat. Emergency decrees take effect immediately but must be confirmed by the National Assembly within thirty days. The state of emergency lapses after ninety days unless renewed by the Assembly.",
        mechanicalEffects: [
          "President may act immediately; Assembly confirmation required within 30 days.",
          "Emergency expires automatically after 90 days without renewal.",
          "Foundational constitutional default for emergency governance.",
        ],
        metricEffects: {
          executiveCapacity: 1,
          institutionalStability: 1,
        },
        orderPatch: { emergencyPowers: "standard_emergency" },
      },
      {
        id: "broad_executive_emergency",
        label: "Broad executive emergency with indefinite renewal",
        proposedClauseText:
          "The President may declare a state of national emergency when, in the President's judgment, the security or stability of the republic so requires. Emergency decrees have the force of law. The state of emergency may be renewed at the President's discretion for successive periods of ninety days.",
        mechanicalEffects: [
          "President determines emergency threshold unilaterally.",
          "Successive ninety-day renewals can sustain indefinite emergency rule.",
          "Emergency decrees require no Assembly confirmation.",
        ],
        metricEffects: {
          executiveCapacity: 3,
          civilLiberty: -2,
          institutionalStability: -2,
          judicialIndependence: -1,
        },
        orderPatch: { emergencyPowers: "broad_executive_emergency" },
      },
      {
        id: "assembly_declared_only",
        label: "Assembly-declared emergency only",
        proposedClauseText:
          "A state of emergency may be declared only by the National Assembly by absolute majority vote. The President has no independent emergency decree power. Emergency legislation must be renewed every sixty days by the Assembly.",
        mechanicalEffects: [
          "Executive cannot unilaterally declare an emergency.",
          "Assembly must convene and vote before any emergency powers activate.",
          "Emergency legislation lapses every 60 days without renewal.",
        ],
        metricEffects: {
          executiveCapacity: -2,
          civilLiberty: 1,
          institutionalStability: -1,
          politicalCompetition: 1,
        },
        orderPatch: { emergencyPowers: "assembly_declared_only" },
      },
    ],
  },
  {
    id: "art10_defense_control",
    articleId: "ARTICLE_X",
    sectionId: "ART_X_S2",
    targetClauseId: "ART_X_S2_C1",
    subject: "Civil control of the armed forces",
    foundingAlternativeId: "civil_supremacy",
    alternatives: [
      {
        id: "civil_supremacy",
        label: "Full civil supremacy over armed forces",
        proposedClauseText:
          "The armed forces are subject to the supreme authority of the civil government. The President is Commander-in-Chief and exercises command through a civilian Minister of Defence. No member of the armed forces may hold political office while serving.",
        mechanicalEffects: [
          "Military is institutionally excluded from political decision-making.",
          "Defence budget subject to full Assembly appropriations scrutiny.",
        ],
        metricEffects: {
          civilLiberty: 1,
          institutionalStability: 2,
          governmentLegitimacy: 1,
        },
        orderPatch: { defenseControl: "civil_supremacy" },
      },
      {
        id: "joint_command",
        label: "Joint civil-military command council",
        proposedClauseText:
          "Supreme command of the armed forces is exercised by a National Security Council composed of the President, the Prime Minister, and the Chief of the Defence Staff. Major deployment decisions require the concurrence of all three.",
        mechanicalEffects: [
          "Military leadership has formal advisory authority in security decisions.",
          "Deployment authority is shared; unilateral presidential command is constrained.",
        ],
        metricEffects: {
          executiveCapacity: 0,
          institutionalStability: 0,
          civilLiberty: -1,
        },
        orderPatch: { defenseControl: "joint_command" },
      },
      {
        id: "executive_command",
        label: "Exclusive executive command without legislative oversight",
        proposedClauseText:
          "The President exercises sole command of the armed forces. Deployments and military operations are determined by the President in consultation with the Chief of the Defence Staff. The National Assembly has no prior approval role in military deployments.",
        mechanicalEffects: [
          "President may deploy forces without Assembly authorisation.",
          "Military budget appropriations are the only legislative lever on defence.",
          "Executive can sustain long-term operations without legislative oversight.",
        ],
        metricEffects: {
          executiveCapacity: 2,
          civilLiberty: -1,
          institutionalStability: -1,
          governmentLegitimacy: -1,
        },
        orderPatch: { defenseControl: "executive_command" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE XI — Treaty Approval
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art11_treaty_approval",
    articleId: "ARTICLE_XI",
    sectionId: "ART_XI_S1",
    targetClauseId: "ART_XI_S1_C1",
    subject: "Treaty ratification process",
    foundingAlternativeId: "assembly_ratification",
    alternatives: [
      {
        id: "assembly_ratification",
        label: "Assembly ratification by absolute majority",
        proposedClauseText:
          "Treaties concluded by the President are subject to ratification by the National Assembly. A treaty takes effect in domestic law only upon approval by absolute majority of the total membership of the National Assembly.",
        mechanicalEffects: [
          "All treaties require Assembly majority approval before taking domestic effect.",
          "President's treaty-making power is checked by legislative ratification.",
        ],
        metricEffects: {
          institutionalStability: 1,
          politicalCompetition: 1,
        },
        orderPatch: { treatyApproval: "assembly_ratification" },
      },
      {
        id: "assembly_and_provinces",
        label: "Assembly and provincial assembly concurrent approval",
        proposedClauseText:
          "Treaties affecting matters within provincial competence require ratification both by the National Assembly by absolute majority and by the assemblies of at least two-thirds of the provinces. Treaties that do not affect provincial competence require only National Assembly ratification.",
        mechanicalEffects: [
          "Treaties in provincial domains require double ratification.",
          "Provincial assemblies can block treaties affecting their competences.",
          "Treaty-making is slower in areas of shared jurisdiction.",
        ],
        metricEffects: {
          provincialAutonomy: 2,
          institutionalStability: 1,
          executiveCapacity: -1,
        },
        orderPatch: { treatyApproval: "assembly_and_provinces" },
      },
      {
        id: "executive_alone",
        label: "Executive treaty-making without ratification",
        proposedClauseText:
          "The President concludes and ratifies treaties on behalf of the Republic. No Assembly approval is required for a treaty to take effect in domestic law. The President shall inform the National Assembly of treaty obligations within thirty days of signature.",
        mechanicalEffects: [
          "President can bind the Republic by treaty without Assembly vote.",
          "Assembly's role is reduced to subsequent information notification.",
          "International commitments may accumulate without legislative scrutiny.",
        ],
        metricEffects: {
          executiveCapacity: 2,
          institutionalStability: -1,
          politicalCompetition: -1,
        },
        orderPatch: { treatyApproval: "executive_alone" },
      },
      {
        id: "supermajority_assembly",
        label: "Supermajority Assembly ratification",
        proposedClauseText:
          "Treaties concluded by the President require ratification by two-thirds of the total membership of the National Assembly. Treaties ceding sovereign territory or transferring constitutional competences require ratification by three-quarters of the total membership.",
        mechanicalEffects: [
          "Ordinary treaties need two-thirds Assembly approval.",
          "Sovereignty-affecting treaties face near-unanimous threshold.",
          "Minority parties can block international commitments in strategic domains.",
        ],
        metricEffects: {
          institutionalStability: 2,
          politicalCompetition: 1,
          executiveCapacity: -1,
        },
        orderPatch: { treatyApproval: "supermajority_assembly" },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARTICLE XII — Amendment Process
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "art12_amendment_process",
    articleId: "ARTICLE_XII",
    sectionId: "ART_XII_S1",
    targetClauseId: "ART_XII_S1_C1",
    subject: "Constitutional amendment procedure",
    foundingAlternativeId: "two_thirds_plus_13_provinces",
    alternatives: [
      {
        id: "two_thirds_plus_13_provinces",
        label: "Two-thirds Assembly vote plus ratification by thirteen provinces",
        proposedClauseText:
          "This Constitution may be amended by a bill passed by not less than two-thirds of the total membership of the National Assembly, provided that such bill is subsequently ratified by the assemblies of at least thirteen of the sixteen provinces within twelve months of its passage.",
        mechanicalEffects: [
          "Supermajority legislative vote plus broad provincial consent required.",
          "The founding constitutional default; high but achievable threshold.",
          "Provincial ratification provides territorial legitimacy for changes.",
        ],
        metricEffects: {
          institutionalStability: 2,
          governmentLegitimacy: 1,
        },
        orderPatch: { amendmentProcess: "assembly_two_thirds_plus_13_provinces" },
      },
      {
        id: "three_fifths_plus_11_provinces",
        label: "Three-fifths Assembly vote plus ratification by eleven provinces",
        proposedClauseText:
          "This Constitution may be amended by a bill passed by not less than three-fifths of the total membership of the National Assembly, provided that such bill is subsequently ratified by the assemblies of at least eleven of the sixteen provinces within twelve months of its passage.",
        mechanicalEffects: [
          "Lower threshold than founding; amendment is more accessible.",
          "Eleven provinces is a bare majority of sixteen; provincial bloc less decisive.",
        ],
        metricEffects: {
          institutionalStability: 1,
          politicalCompetition: 1,
        },
        orderPatch: { amendmentProcess: "assembly_three_fifths_plus_11_provinces" },
      },
      {
        id: "simple_plus_referendum",
        label: "Simple Assembly majority plus national referendum",
        proposedClauseText:
          "This Constitution may be amended by a bill passed by absolute majority of the total membership of the National Assembly and subsequently approved by a majority of voters in a national referendum held within six months of the Assembly vote.",
        mechanicalEffects: [
          "Lower legislative threshold but direct popular approval is required.",
          "Amendment requires both parliamentary and popular legitimacy.",
          "Referendum campaign dynamics may diverge from legislative deliberation.",
        ],
        metricEffects: {
          governmentLegitimacy: 2,
          institutionalStability: 0,
          politicalCompetition: 1,
        },
        orderPatch: { amendmentProcess: "assembly_simple_plus_referendum" },
      },
      {
        id: "three_quarters_only",
        label: "Three-quarters Assembly vote without provincial ratification",
        proposedClauseText:
          "This Constitution may be amended by a bill passed by not less than three-quarters of the total membership of the National Assembly. No provincial ratification is required.",
        mechanicalEffects: [
          "Highest available legislative threshold; near-consensus required.",
          "Provincial veto on amendments is abolished; central legislature decides alone.",
          "Faster amendment process if Assembly consensus is achievable.",
        ],
        metricEffects: {
          institutionalStability: 1,
          provincialAutonomy: -1,
          executiveCapacity: 1,
        },
        orderPatch: { amendmentProcess: "assembly_three_quarters_only" },
      },
    ],
  },
  {
    id: "art12_unamendable_core",
    articleId: "ARTICLE_XII",
    sectionId: "ART_XII_S2",
    targetClauseId: "ART_XII_S2_C1",
    subject: "Entrenchment of unamendable constitutional core",
    foundingAlternativeId: "soft_entrenchment",
    alternatives: [
      {
        id: "soft_entrenchment",
        label: "Enhanced procedure for core provisions without absolute prohibition",
        proposedClauseText:
          "Amendments to Articles I, II, and VIII of this Constitution require a further affirmative vote of the National Assembly following a dissolution and general election. No provision of this Constitution is entirely beyond amendment.",
        mechanicalEffects: [
          "Core rights and structure articles require an election between proposal and ratification.",
          "No provision is absolutely locked; the threshold for core articles is higher.",
        ],
        metricEffects: {
          institutionalStability: 2,
          civilLiberty: 1,
          governmentLegitimacy: 1,
        },
      },
      {
        id: "hard_entrenchment",
        label: "Absolute prohibition on amending foundational provisions",
        proposedClauseText:
          "The republican form of government, the guarantee of equal citizenship, the separation of powers among the legislative, executive, and judicial branches, and the fundamental rights guaranteed by Article II may not be amended or abrogated. Any purported amendment to these provisions is void.",
        mechanicalEffects: [
          "Core provisions are constitutionally locked regardless of majority size.",
          "Court can void even supermajority-passed amendments touching locked provisions.",
          "Fundamental rights and republican form cannot be removed by any legal process.",
        ],
        metricEffects: {
          institutionalStability: 3,
          civilLiberty: 2,
          judicialIndependence: 1,
          governmentLegitimacy: 1,
        },
      },
      {
        id: "no_entrenchment",
        label: "No procedural distinction between constitutional provisions",
        proposedClauseText:
          "All provisions of this Constitution are subject to amendment by the procedure set out in Article XII Section 1. No provision holds a higher rank than any other for the purpose of amendment.",
        mechanicalEffects: [
          "Any provision can be amended by the standard amendment procedure.",
          "Courts cannot invalidate amendments on entrenchment grounds.",
          "Constitutional protection of rights and structure is contingent on political consensus.",
        ],
        metricEffects: {
          institutionalStability: -1,
          civilLiberty: -1,
          governmentLegitimacy: -1,
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Exported data constant
// ---------------------------------------------------------------------------

export const CONSTITUTION_CHANGE_SUBJECTS: readonly ConstitutionChangeSubject[] =
  CONSTITUTION_CHANGE_SUBJECTS_DATA;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns all subjects for the given article id (e.g. "ARTICLE_III").
 */
export function constitutionSubjectsForArticle(
  articleId: string,
): readonly ConstitutionChangeSubject[] {
  return CONSTITUTION_CHANGE_SUBJECTS.filter((s) => s.articleId === articleId);
}

/**
 * Returns the subject matching the given id, or `undefined` if not found.
 */
export function constitutionSubjectById(id: string): ConstitutionChangeSubject | undefined {
  return CONSTITUTION_CHANGE_SUBJECTS.find((s) => s.id === id);
}

/**
 * Returns the specific alternative within a subject, or `undefined`.
 */
export function constitutionAlternative(
  subjectId: string,
  alternativeId: string,
): ConstitutionChangeAlternative | undefined {
  return constitutionSubjectById(subjectId)?.alternatives.find((a) => a.id === alternativeId);
}

/**
 * Returns `true` iff every Article from ARTICLE_I through ARTICLE_XII has at
 * least one registered subject.
 */
export function subjectsCoveringAllArticles(): boolean {
  const required = [
    "ARTICLE_I",
    "ARTICLE_II",
    "ARTICLE_III",
    "ARTICLE_IV",
    "ARTICLE_V",
    "ARTICLE_VI",
    "ARTICLE_VII",
    "ARTICLE_VIII",
    "ARTICLE_IX",
    "ARTICLE_X",
    "ARTICLE_XI",
    "ARTICLE_XII",
  ] as const;
  return required.every((articleId) =>
    CONSTITUTION_CHANGE_SUBJECTS.some((s) => s.articleId === articleId),
  );
}
