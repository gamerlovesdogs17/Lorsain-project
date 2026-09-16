/** Lightweight specialized-term glossary — not per-field help spam. */

export type GlossaryEntry = {
  id: string;
  term: string;
  definition: string;
};

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: "whip",
    term: "Whip",
    definition:
      "The Party officer who organizes Assembly votes, estimates support, and persuades Members.",
  },
  {
    id: "caucus",
    term: "Caucus",
    definition:
      "The organized group of a Party's Assembly members, with its own leadership and internal politics.",
  },
  {
    id: "confidence",
    term: "Confidence vote",
    definition:
      "An Assembly vote that decides whether the government retains the chamber's support.",
  },
  {
    id: "coalition",
    term: "Coalition agreement",
    definition:
      "A negotiated pact among Parties covering priorities, Cabinet shares, and known compromises.",
  },
  {
    id: "stv",
    term: "STV",
    definition:
      "Single Transferable Vote — a preferential multi-member electoral system used in some Assembly designs.",
  },
  {
    id: "ratification",
    term: "Ratification",
    definition:
      "Follow-on approval after an Assembly constitutional vote, such as provincial consent or a referendum.",
  },
  {
    id: "entrenchment",
    term: "Entrenchment",
    definition:
      "Extra barriers that make amending core constitutional articles harder than ordinary amendments.",
  },
  {
    id: "investiture",
    term: "Investiture",
    definition:
      "Formal Assembly or constitutional confirmation that installs a government after formation talks.",
  },
];
