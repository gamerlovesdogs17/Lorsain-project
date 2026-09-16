/** Bounded first-use Tutorial Mode lessons — never reveal hidden sim math. */

export type TutorialLessonId =
  | "navigation"
  | "bills"
  | "voting"
  | "whip"
  | "party_leadership"
  | "elections_campaigns"
  | "government_cabinet"
  | "courts"
  | "foreign";

export type TutorialStep = {
  title: string;
  body: string;
  /** Optional `data-tutorial` target id for a soft highlight ring. */
  target?: string;
};

export type TutorialLesson = {
  id: TutorialLessonId;
  title: string;
  steps: TutorialStep[];
};

export const TUTORIAL_LESSONS: TutorialLesson[] = [
  {
    id: "navigation",
    title: "Finding your way",
    steps: [
      {
        title: "Your political desk",
        body: "Home summarizes what needs attention this month, what changed, and what is coming next. Start here after each turn.",
        target: "home-desk",
      },
      {
        title: "Side navigation",
        body: "Use the menu to move between Assembly, Government, Elections, Party, and the rest of public life. On tablets, open the drawer with the menu button.",
        target: "nav-drawer",
      },
      {
        title: "Attention and End Turn",
        body: "The Attention list flags decisions you must handle. When nothing blocks you, End Turn advances the month.",
        target: "shell-end-turn",
      },
    ],
  },
  {
    id: "bills",
    title: "Reading a bill",
    steps: [
      {
        title: "Object first",
        body: "Open a bill to see its title, stage, sponsor, and summary before diving into tables of provisions or votes.",
        target: "selected-bill",
      },
      {
        title: "Tabs stay secondary",
        body: "Overview, Provisions, Support, and Procedure deepen the dossier. Use them when you need detail — not as a spreadsheet of everything at once.",
        target: "bill-tabs",
      },
    ],
  },
  {
    id: "voting",
    title: "Casting your vote",
    steps: [
      {
        title: "Votes due",
        body: "When a bill reaches the floor, your vote appears under Assembly decisions. Choose Yes, No, or Abstain from the vote controls — not from raw tallies.",
        target: "assembly-votes-due",
      },
      {
        title: "Party cues are guidance",
        body: "Party and caucus positions are political signals. Your personal vote is still yours; the chamber records the public result.",
      },
    ],
  },
  {
    id: "whip",
    title: "The whip desk",
    steps: [
      {
        title: "Counting the caucus",
        body: "Whip tools estimate how your party may divide. Outlook language stays qualitative — never treat internal counts as a calculator for the sim.",
        target: "whip-desk",
      },
      {
        title: "Persuasion is political work",
        body: "Pressure, deals, and appeals shift colleagues over time. Outcomes depend on relationships and the bill — not a visible score.",
      },
    ],
  },
  {
    id: "party_leadership",
    title: "Party leadership",
    steps: [
      {
        title: "Contests and caucus",
        body: "Party screens cover leadership contests, factions, and caucus discipline. Leadership races are political campaigns inside the party.",
        target: "party-workspace",
      },
      {
        title: "Standing with colleagues",
        body: "Support among MPs and activists matters more than any hidden rating. Watch endorsements, contests, and open seats.",
      },
    ],
  },
  {
    id: "elections_campaigns",
    title: "Elections and campaigns",
    steps: [
      {
        title: "Calendar first",
        body: "Elections lists upcoming contests and results. Campaign HQ is where you spend monthly actions while a race is active.",
        target: "elections-workspace",
      },
      {
        title: "Campaign actions",
        body: "Rallies, messaging, and fundraising change your public fight. Polls and night coverage are public signals — not exact sim formulas.",
        target: "campaign-workspace",
      },
    ],
  },
  {
    id: "government_cabinet",
    title: "Government and cabinet",
    steps: [
      {
        title: "Executive desk",
        body: "Government covers the presidency, cabinet posts, agenda, and budget cycle. Vacant posts and bills awaiting signature appear as attention items.",
        target: "government-desk",
      },
      {
        title: "Cabinet appointments",
        body: "Appoint ministers from eligible politicians. Delivery and fiscal tabs track follow-through after laws pass — still in plain language.",
      },
    ],
  },
  {
    id: "courts",
    title: "Law and the Court",
    steps: [
      {
        title: "Constitutional docket",
        body: "Law & Constitution surfaces cases, the constitutional text, and amendment trackers. Open a matter to read the dispute before any vote or opinion.",
        target: "courts-workspace",
      },
    ],
  },
  {
    id: "foreign",
    title: "Foreign affairs",
    steps: [
      {
        title: "World desk",
        body: "Foreign Affairs covers treaties, crises, and relations. Public stages describe what the country can see — not confidential war-room scores.",
        target: "foreign-workspace",
      },
    ],
  },
];

export const TUTORIAL_LESSON_IDS = TUTORIAL_LESSONS.map((lesson) => lesson.id);

export function getTutorialLesson(id: TutorialLessonId): TutorialLesson | undefined {
  return TUTORIAL_LESSONS.find((lesson) => lesson.id === id);
}

export function lessonForScreen(
  screen: string,
  opts?: { selectedBill?: boolean; votesDue?: boolean; whipRelevant?: boolean },
): TutorialLessonId | null {
  if (screen === "home") return "navigation";
  if (screen === "assembly") {
    if (opts?.whipRelevant) return "whip";
    if (opts?.votesDue) return "voting";
    if (opts?.selectedBill) return "bills";
    return "bills";
  }
  if (screen === "party") return "party_leadership";
  if (screen === "elections" || screen === "campaign") return "elections_campaigns";
  if (screen === "executive") return "government_cabinet";
  if (screen === "courts") return "courts";
  if (screen === "foreign") return "foreign";
  return null;
}

export function nextIncompleteLesson(
  completed: readonly string[],
  preferred: TutorialLessonId | null,
): TutorialLessonId | null {
  if (preferred && !completed.includes(preferred)) return preferred;
  return null;
}
