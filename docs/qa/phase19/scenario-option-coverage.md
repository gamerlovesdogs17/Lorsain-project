# Phase 19 — Scenario option coverage

**Audit tip:** `fc9266e` onward. Engine source of truth: `packages/sim/src/provinces/constitutionalOrder.ts`. Studio catalogs: `packages/scenario/src/optionCatalogs.ts`.

Legend: **E** = engine-supported · **S** = scenario schema · **U** = Studio UI · **N/A** = intentionally unavailable for custom scenarios.

| Category | Engine IDs | Schema | Studio | Missing | Intentionally unavailable |
|----------|------------|--------|--------|---------|---------------------------|
| Party system | competitive_multiparty, restricted_registration, single_legal_party, nonpartisan_candidates | yes | yes | — | — |
| Presidential election | national_rcv, plurality, majority_runoff, assembly_selection | yes | yes | — | — |
| Assembly election | stv, closed_list_pr, mixed_member, fptp | yes | yes (was partial labels) | — | — |
| Judicial review | strong_review, standard_review, deferential_review, legislative_finality | yes | yes | — | — |
| Provincial competence | enumerated_provincial, concurrent_powers, national_supremacy, strong_devolution | yes | yes | — | — |
| Emergency powers | narrow_assembly_supervised, standard_emergency, broad_executive_emergency, assembly_declared_only | yes | yes | — | — |
| Treaty approval | assembly_ratification, assembly_and_provinces, executive_alone, supermajority_assembly | yes | yes | — | — |
| Amendment process | assembly_two_thirds_plus_13_provinces, assembly_three_fifths_plus_11_provinces, assembly_simple_plus_referendum, assembly_three_quarters_only | yes | yes | — | Province counts are Terena-shaped thresholds (still valid modes) |
| Entrenchment | none, heightened_threshold, election_interlock, referendum_core, hard_core | yes | yes | — | — |
| Civil liberties | broad_democratic_liberties, standard_charter, security_qualified_liberties, restricted_political_expression | yes | yes | — | — |
| Executive authority | constrained_dual_mandate, standard_presidential, strengthened_executive, assembly_dominant | yes | yes | — | — |
| Cabinet formation | presidential_choice, assembly_confidence, party_slate | yes | yes | — | — |
| Republic form | democratic_republic, peoples_republic, unitary_party_republic | yes | yes | — | — |
| Citizenship | equal_citizenship, duty_conditioned_citizenship | yes | yes | — | — |
| Press freedom | free_press, licensed_press, state_media_priority | yes | yes | — | — |
| Local government | provincial_primary, shared, nationally_directed | yes | yes | — | — |
| Defense control | civil_supremacy, joint_command, executive_command | yes | yes | — | — |
| Party ideology family | centre, liberal, conservative, social-democratic, green, nationalist, market-reform, labour | yes (bounded) | yes | — | Free-text mechanical ideology removed |
| Organization types | labor, business, environmental, civil_rights, professional, agriculture, technology, civic | yes | yes | Engine interest-org subtypes beyond these if any | Document if content-only |
| Provincial/governor election modes | Terena gubernatorial calendars | partial dates only | N/A fake modes | Full governor mode picker | **N/A** until mini worlds grow electorate + governor calendars |
| Law catalog picker | Content policy/bill catalog | catalogRef | yes (picker) | — | Custom pack entries when pack loaded |
| Nomination rules | World nominationRules | labels only | expanding | Full rule editor | Deep rule graph remains content/Terena; Studio exposes labels + presets |

## Quick Build vs full editor

Quick Build keeps three **government form** presets only. Full Constitution/Elections editors expose constitutional-order dimensions above.

## Roundtrip requirement

Every Studio-exposed constitutional/electoral id must survive export → import → `buildKernelWorldFromScenarioDocument` into `constitutionalOrder` / election calendars.
