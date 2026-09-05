import fs from "fs";

const path = "packages/sim/src/provinces/constitutionChanges.ts";
let src = fs.readFileSync(path, "utf8");
const constitution = JSON.parse(fs.readFileSync("data/terena_constitution.json", "utf8"));
const clauseMap = {};
const sectionOf = {};
const articleOf = {};
for (const a of constitution.document.articles) {
  for (const s of a.sections) {
    for (const cl of s.clauses) {
      clauseMap[cl.id] = cl.text;
      sectionOf[cl.id] = s.id;
      articleOf[cl.id] = a.id;
    }
  }
}

function shortSection(full) {
  const m = full.match(/^ARTICLE_([IVX]+)_SECTION_(\d+)$/);
  if (!m) return full;
  return `ART_${m[1]}_S${m[2]}`;
}

const remaps = {
  art1_executive_authority: "ART_III_S2_C1",
  art2_civil_liberties: "ART_II_S2_C1",
  art2_citizenship_guard: "ART_II_S1_C2",
  art3_presidential_election_mode: "ART_III_S1_C2",
  art4_assembly_election_mode: "ART_IV_S1_C1",
  art5_veto_override: "ART_V_S1_C2",
  art7_party_system: "ART_VII_S2_C1",
  art7_press_freedom: "ART_II_S2_C2",
  art8_court_term: "ART_VIII_S2_C2",
  art8_judicial_review: "ART_VIII_S2_C3",
  art9_provincial_competence: "ART_IX_S2_C1",
  art9_local_government: "ART_IX_S3_C1",
  art10_emergency_powers: "ART_X_S2_C1",
  art10_defense_control: "ART_X_S3_C1",
  art12_unamendable_core: "ART_XII_S1_C2",
};

for (const [subjectId, clauseId] of Object.entries(remaps)) {
  const art = articleOf[clauseId];
  const sec = shortSection(sectionOf[clauseId]);
  const re = new RegExp(
    `(id: "${subjectId}",\\s*articleId: ")ARTICLE_[IVX]+(",\\s*sectionId: ")ART_[IVX]+_S\\d+(",\\s*targetClauseId: ")ART_[IVX]+_S\\d+_C\\d+"`,
    "m",
  );
  if (!re.test(src)) {
    console.error("FAILED MATCH", subjectId);
    process.exit(1);
  }
  src = src.replace(re, `$1${art}$2${sec}$3${clauseId}"`);
  console.log("remapped", subjectId, "->", clauseId, art, sec);
}

src = src.replace(
  /(id: "art8_court_term",[\s\S]*?foundingAlternativeId: )"nine_year_court"/,
  '$1"twelve_year_court"',
);

src = src.replace(/thirteen of the sixteen provinces/g, "thirteen of the twenty-one provinces");
src = src.replace(/eleven of the sixteen provinces/g, "eleven of the twenty-one provinces");
src = src.replace(/a bare majority of sixteen/g, "a minority of twenty-one");

src = src.replace(
  /(id: "art12_unamendable_core",[\s\S]*?foundingAlternativeId: )"soft_entrenchment"/,
  '$1"no_entrenchment"',
);

const foundingBySubject = {
  art1_republic_form: "democratic_republic",
  art1_executive_authority: "constrained_dual_mandate",
  art2_civil_liberties: "standard_charter",
  art2_citizenship_guard: "equal_citizenship",
  art3_presidential_term_limit: "two_term_limit",
  art3_presidential_election_mode: "national_rcv",
  art4_assembly_term: "four_year_assembly",
  art4_assembly_election_mode: "stv",
  art5_veto_override: "two_thirds_override",
  art6_cabinet_formation: "presidential_choice",
  art7_party_system: "competitive_multiparty",
  art7_press_freedom: "free_press",
  art8_court_term: "twelve_year_court",
  art8_judicial_review: "standard_review",
  art9_provincial_competence: "concurrent_powers",
  art9_local_government: "provincial_primary",
  art10_emergency_powers: "standard_emergency",
  art10_defense_control: "civil_supremacy",
  art11_treaty_approval: "assembly_ratification",
  art12_amendment_process: "two_thirds_plus_13_provinces",
  art12_unamendable_core: "no_entrenchment",
};

function escapeForTemplate(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

for (const [subjectId, foundingId] of Object.entries(foundingBySubject)) {
  const m = src.match(new RegExp(`id: "${subjectId}",[\\s\\S]*?targetClauseId: "(ART_[^"]+)"`));
  if (!m) {
    console.error("no target for", subjectId);
    continue;
  }
  const clauseId = m[1];
  const text = clauseMap[clauseId];
  if (!text) {
    console.error("no clause text", clauseId);
    continue;
  }
  const subjectStart = src.indexOf(`id: "${subjectId}"`);
  const nextSubject = src.indexOf('\n  {\n    id: "art', subjectStart + 10);
  const end = nextSubject === -1 ? src.indexOf("\n];", subjectStart) : nextSubject;
  let block = src.slice(subjectStart, end);
  const altRe2 = new RegExp(
    `(id: "${foundingId}",\\s*label: "[^"]*",\\s*proposedClauseText:\\s*)"(?:\\\\.|[^"\\\\])*"`,
    "m",
  );
  if (!altRe2.test(block)) {
    console.error("founding alt text not found", subjectId, foundingId);
    continue;
  }
  block = block.replace(altRe2, `$1"${escapeForTemplate(text)}"`);
  src = src.slice(0, subjectStart) + block + src.slice(end);
  console.log("founding text set", subjectId, foundingId, "from", clauseId);
}

fs.writeFileSync(path, src);
console.log("DONE");
