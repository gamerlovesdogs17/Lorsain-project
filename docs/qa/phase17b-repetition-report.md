# Phase 17B repetition / variety report

**Generated:** 2026-09-12  
**Command:** `node scripts/phase17b-content-report.mjs`  
**Machine-readable:** [phase17b-repetition-report.json](./phase17b-repetition-report.json)

## Summary counts

| Catalog | Entries |
|---------|--------:|
| party priorities | **24** |
| campaign situations | **16** |
| executive situations | **23** |
| scandal types | **6** |
| org lobby templates | **10** |
| caucus pressure templates | **6** |
| provision families | **58** |
| provision options | **258** |
| constitution subjects | **21** |
| policy interaction rules | **14** |
| crisis escalation packages | **14** |
| doctrine rule keys | **7** |
| media headline branches | **46** |
| platform policy options | **40** |
| campaign strategies | **7** |

## Dominance / reskin signals (per category)

### party_priorities

- LIKELY_RESKIN_CLUSTER: entry count materially exceeds distinct pattern count
- **OVERREPRESENTED:** `issueBucket=none|weight=?` (46%) — OVERREPRESENTED: one mechanical pattern covers a large share of this category
- **LIKELY_RESKIN_CLUSTER:** `issueBucket=none|weight=?` ×11 (base_mobilization, candidate_recruitment, caucus_cohesion, donor_network, ethics_and_compliance, faction_management, field_infrastructure, governing_readiness, membership_growth, message_discipline, swing_persuasion)
- **LIKELY_RESKIN_CLUSTER:** `issueBucket=institutional_reform|weight=?` ×3 (digital_rights, institutional_renewal, provincial_fairness)
- **LIKELY_RESKIN_CLUSTER:** `issueBucket=economy|weight=?` ×2 (growth_and_jobs, rural_connectivity)
- **LIKELY_RESKIN_CLUSTER:** `issueBucket=foreign_policy|weight=?` ×2 (defense_modernization, foreign_credibility)
- **LIKELY_RESKIN_CLUSTER:** `issueBucket=social_policy|weight=?` ×2 (healthcare_access, immigration_integration)

### caucus_pressure_templates

- LIKELY_RESKIN_CLUSTER: entry count materially exceeds distinct pattern count
- **OVERREPRESENTED:** `requiresBill=true` (67%) — OVERREPRESENTED: one mechanical pattern covers a large share of this category
- **LIKELY_RESKIN_CLUSTER:** `requiresBill=true` ×4 (leadership_unity_push, platform_red_line, regional_holdout, whip_count_leak)
- **LIKELY_RESKIN_CLUSTER:** `requiresBill=false` ×2 (backbench_petition, coalition_partner_ultimatum)

### legislative_provisions

- **LIKELY_RESKIN_CLUSTER:** `issues=|opts=4|shape=categorical:0|none:0|none:0|none:0` ×6 (PROV_FARM_STABILIZATION, PROV_INFRASTRUCTURE_BANK, PROV_PLATFORM_WORK, PROV_PUBLIC_HOUSING, PROV_SENTENCING, PROV_VOCATIONAL_TRAINING)
- **LIKELY_RESKIN_CLUSTER:** `issues=|opts=3|shape=binary:0|binary:0|none:0` ×4 (PROV_CONCORD_PROCUREMENT, PROV_RENT_POLICY, PROV_SCHOOL_MEALS, PROV_SURVEILLANCE_WARRANT)
- **LIKELY_RESKIN_CLUSTER:** `issues=|opts=4|shape=binary:undefined|binary:undefined|categorical:undefined|none:0` ×3 (PROV_ALGORITHM_AUDIT, PROV_COMMUNITY_POLICING, PROV_CROSS_BORDER_DATA)
- **LIKELY_RESKIN_CLUSTER:** `issues=|opts=5|shape=none:undefined|none:undefined|none:undefined|none:undefined|none:undefined` ×3 (PROV_CLEAN_POWER, PROV_HOUSING_APPROVALS, PROV_STRATEGIC_TARIFFS)
- **LIKELY_RESKIN_CLUSTER:** `issues=|opts=5|shape=numeric:0|numeric:0|numeric:0|numeric:0|numeric:0` ×3 (PROV_CARBON_PRICE, PROV_INCOME_TAX, PROV_UNEMPLOYMENT_INSURANCE)

### constitution_subjects

- **LIKELY_RESKIN_CLUSTER:** `article=ARTICLE_III|alts=4` ×3 (art3_executive_authority, art3_presidential_election_mode, art3_presidential_term_limit)
- **LIKELY_RESKIN_CLUSTER:** `article=ARTICLE_IV|alts=4` ×2 (art4_assembly_election_mode, art4_assembly_term)
- **LIKELY_RESKIN_CLUSTER:** `article=ARTICLE_IX|alts=4` ×2 (art9_local_government, art9_provincial_competence)
- **LIKELY_RESKIN_CLUSTER:** `article=ARTICLE_VIII|alts=4` ×2 (art8_court_term, art8_judicial_review)

### media_headline_branches

- Static count of explicit event-type branches in headlineFor (not runtime frequency).
- Historical probe: law_enacted headlines dominate 36-month samples — see phase17b-content-audit.md.
- **OVERREPRESENTED:** `BILL/LAW pipeline` — OVERREPRESENTED in play: routine bill events vs executive/scandal/foreign beats (audit).

## CI

This report is informational; it does not fail on balance thresholds.
