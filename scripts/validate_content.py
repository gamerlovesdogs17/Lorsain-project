#!/usr/bin/env python3
import json, os, re, sys, xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
errors=[]; warnings=[]

def load(rel):
    try:
        return json.loads((ROOT/rel).read_text(encoding="utf-8"))
    except Exception as e:
        errors.append(f"{rel}: cannot parse JSON: {e}")
        return {}

def check(cond,msg):
    if not cond: errors.append(msg)

manifest=load("data/content_manifest.json")
world=load("data/world_countries.json")
parties=load("data/terena_parties.json")
scenario=load("data/scenario_terena_2028.json")
figs=load("data/terena_starting_figures.json")
issues=load("data/terena_issues.json")
orgs=load("data/terena_organizations.json")
provs=load("data/terena_provinces.geojson")
cons=load("data/terena_constituencies.geojson")
cities=load("data/terena_cities.json")
geo=load("data/terena_geography.json")
nom=load("data/terena_nomination_rules.json")

# Core counts/totals
W=world.get("countries",[]); P=provs.get("features",[]); C=cons.get("features",[])
check(len(W)==48,f"expected 48 world countries, got {len(W)}")
check(len(P)==21,f"expected 21 admin units, got {len(P)}")
check(len(C)==48,f"expected 48 constituencies, got {len(C)}")
check(sum(f.get("properties",{}).get("population",0) for f in P)==72_000_000,"province populations must sum exactly to 72,000,000")
check(sum(f.get("properties",{}).get("population",0) for f in C)==72_000_000,"constituency populations must sum exactly to 72,000,000")
check(sum(f.get("properties",{}).get("seats",0) for f in C)==420,"constituency seats must sum to 420")
check(sum(p.get("assembly_seats",0) for p in parties.get("parties",[]))==420,"party seats must sum to 420")
check(sum(scenario.get("assembly",{}).get("party_seats",{}).values())==420,"scenario party seats must sum to 420")

# IDs
def ids_unique(values,label):
    dup=[x for x,n in Counter(values).items() if n>1]
    check(not dup,f"duplicate {label} IDs: {dup}")
ids_unique([c.get("id") for c in W],"world country")
ids_unique([f.get("properties",{}).get("id") for f in P],"province")
ids_unique([f.get("properties",{}).get("id") for f in C],"constituency")
ids_unique([c.get("id") for c in cities.get("cities",[])],"city")
ids_unique([f.get("id") for f in figs.get("figures",[])],"figure")

world_ids={c["id"] for c in W}; party_ids={p["id"] for p in parties.get("parties",[])}; issue_ids={i["id"] for i in issues.get("issues",[])}; prov_ids={f["properties"]["id"] for f in P}
faction_ids={f["id"] for p in parties.get("parties",[]) for f in p.get("factions",[])}
nom_ids={r["id"] for r in nom.get("rules",[])}

# World refs and symmetry
byw={c["id"]:c for c in W}
for c in W:
    check(c.get("map_path_id")==c.get("id"),f"{c['id']}: map_path_id mismatch")
    for n in c.get("neighbor_ids",[]):
        check(n in world_ids,f"{c['id']}: unknown neighbor {n}")
        if n in byw: check(c["id"] in byw[n].get("neighbor_ids",[]),f"neighbor relation asymmetric: {c['id']} -> {n}")

# Party/faction/nomination refs
for p in parties.get("parties",[]):
    if p.get("factions"):
        check(abs(sum(f.get("share",0) for f in p["factions"])-1)<1e-9,f"{p['id']}: faction shares do not sum to 1")
    check(p.get("nomination_rule_id") in nom_ids,f"{p['id']}: missing nomination rule {p.get('nomination_rule_id')}")
    for f in p.get("factions",[]): check(f.get("party_id")==p["id"],f"{f['id']}: party_id mismatch")

# Figures
figure_ids={f["id"] for f in figs.get("figures",[])}
check(scenario.get("president_id") in figure_ids,"scenario president missing from canonical figures")
check(scenario.get("speaker_id") in figure_ids,"scenario speaker missing from canonical figures")
for f in figs.get("figures",[]):
    if f.get("party_id") is not None: check(f["party_id"] in party_ids,f"{f['id']}: unknown party_id {f['party_id']}")
    if f.get("faction_id") is not None: check(f["faction_id"] in faction_ids,f"{f['id']}: unknown faction_id {f['faction_id']}")
    check(f.get("home_province_id") in prov_ids,f"{f['id']}: unknown home_province_id {f.get('home_province_id')}")
    check(bool(re.match(r"^\d{4}-\d{2}-\d{2}$",f.get("birth_date",""))),f"{f['id']}: invalid birth_date")

# Organizations
for o in orgs.get("organizations",[]):
    for iid in o.get("issues",[]): check(iid in issue_ids,f"{o['id']}: unknown issue {iid}")
    for pid in o.get("lean_party_ids",[]): check(pid in party_ids,f"{o['id']}: unknown lean party {pid}")

# Constituency properties
for f in C:
    p=f["properties"]; cid=p["id"]
    check(p.get("plurality_province_id") in prov_ids,f"{cid}: bad plurality_province_id")
    shares=p.get("province_population_shares",[])
    check(bool(shares),f"{cid}: missing province_population_shares")
    if shares:
        total=sum(x.get("share",0) for x in shares)
        check(abs(total-1)<1e-4,f"{cid}: province shares sum to {total}")
        top=max(shares,key=lambda x:x.get("share",0))["province_id"]
        # exact ties may preserve either tied plurality; only fail when stored is not top-equivalent
        stored_share=next((x["share"] for x in shares if x["province_id"]==p.get("plurality_province_id")),0)
        top_share=max(x["share"] for x in shares)
        check(abs(stored_share-top_share)<1e-6,f"{cid}: plurality province does not have top population share")
        check(p.get("crosses_province_boundaries")== (len(shares)>1),f"{cid}: crosses_province_boundaries mismatch")

# Derived summary agreement
check(geo.get("country",{}).get("population")==72_000_000,"geography summary country population mismatch")
check(len(geo.get("provinces",[]))==21,"geography summary province count mismatch")
check(len(geo.get("constituencies",[]))==48,"geography summary constituency count mismatch")

# SVG contracts
def svg_ids(rel):
    try:
        root=ET.parse(ROOT/rel).getroot(); return [e.attrib["id"] for e in root.iter() if "id" in e.attrib]
    except Exception as e:
        errors.append(f"{rel}: invalid SVG: {e}"); return []
wid=svg_ids("maps/world_political.svg"); tid=svg_ids("maps/terena_game_map.svg")
ids_unique(wid,"world SVG") ; ids_unique(tid,"Terena SVG")
check(set(f"W{i:02d}" for i in range(1,49)).issubset(wid),"world SVG missing W01-W48")
check(set(["FDV"]+[f"P{i:02d}" for i in range(1,21)]).issubset(tid),"Terena SVG missing province IDs")
check(set(f"C{i:03d}" for i in range(1,49)).issubset(tid),"Terena SVG missing constituency IDs")
check(set(f"CITY{i:02d}" for i in range(1,19)).issubset(tid),"Terena SVG missing CITY01-CITY18")
check("TERENA" in tid,"Terena SVG missing TERENA outline")
# R01-R08 / RT01-RT18 are canonical geography IDs but NOT required on terena_game_map.svg

# Manifest contract keys
auth=manifest.get("authoritative",{})
phase0b_auth=(
    "canonical_crosswalk","terena_electoral_counting","presidential_eligibility",
    "terena_election_assembly_2026","terena_historical_candidates_2026",
    "terena_voter_blocs_2028","terena_pollsters",
)
for key in phase0b_auth:
    check(key in auth,f"manifest.authoritative missing {key}")
    if key in auth: load(auth[key])
ref=manifest.get("derived_or_reference",{})
for key in ("world_history_timeline","terena_history_timeline"):
    check(key in ref,f"manifest.derived_or_reference missing {key}")
check("terena_presidential_administrations" not in ref,
      "terena_presidential_administrations must be authoritative, not derived_or_reference")
for key in ("terena_presidential_administrations","terena_offices"):
    check(key in auth,f"manifest.authoritative missing {key}")
    if key in auth: load(auth[key])
check("presidential_eligibility_pending" not in ref,
      "presidential_eligibility_pending must be removed after Phase 0b")

# Phase 0b roster / election / blocs
EXPECTED_SEATS={"PARTY_LAB":128,"PARTY_NU":110,"PARTY_CR":69,"PARTY_GRN":41,"PARTY_RL":35,"PARTY_PM":29,"PARTY_IND":8}
mps=[f for f in figs.get("figures",[]) if any(r.get("type")=="assembly_member" for r in f.get("roles",[]))]
check(len(mps)==420,f"expected 420 MPs, got {len(mps)}")
mp_party=Counter((f.get("party_id") or "PARTY_IND") for f in mps)
for pid,n in EXPECTED_SEATS.items():
    check(mp_party.get(pid,0)==n,f"MP party total {pid}={mp_party.get(pid,0)} != {n}")
mp_by_c=Counter()
for f in mps:
    role=next((r for r in f.get("roles",[]) if r.get("type")=="assembly_member"),{})
    cid=role.get("constituency_id")
    check(bool(cid),f"{f['id']}: MP missing constituency_id")
    if cid: mp_by_c[cid]+=1
for feat in C:
    p=feat["properties"]; cid=p["id"]
    check(mp_by_c.get(cid,0)==p.get("seats"),f"{cid}: MP count {mp_by_c.get(cid,0)} != seats {p.get('seats')}")
governors=[f for f in figs.get("figures",[]) if any(r.get("type")=="governor" for r in f.get("roles",[]))]
check(len(governors)==21,f"expected 21 governors, got {len(governors)}")
for g in governors:
    check(not any(r.get("type")=="assembly_member" for r in g.get("roles",[])),f"{g['id']}: governor also MP")
judges=[f for f in figs.get("figures",[]) if any(r.get("type") in ("constitutional_court_judge","chief_justice") for r in f.get("roles",[]))]
check(len(judges)==9,f"expected 9 judges, got {len(judges)}")
check(500<=len(figs.get("figures",[]))<=550,f"roster size {len(figs.get('figures',[]))} outside 500-550")

elig=load(auth.get("presidential_eligibility","data/terena_presidential_eligibility.json"))
check(elig.get("status")=="approved","presidential_eligibility.status must be approved")
check(elig.get("rules",{}).get("minimum_age")==35,"presidential minimum_age must be 35")
check(elig.get("content_version")==manifest.get("content_version"),"eligibility content_version mismatch")

election=load(auth.get("terena_election_assembly_2026","data/terena_election_assembly_2026.json"))
econs=election.get("constituencies",[])
check(len(econs)==48,f"2026 election constituencies {len(econs)} != 48")
nat=election.get("national_party_seats",{})
for pid,n in EXPECTED_SEATS.items():
    check(nat.get(pid)==n,f"2026 national seats {pid}={nat.get(pid)} != {n}")
elected=set()
for row in econs:
    winners=row.get("result",{}).get("elected",[])
    check(len(winners)==row.get("seats"),f"{row.get('constituency_id')}: elected/seats mismatch")
    for wid in winners:
        check(wid not in elected,f"duplicate 2026 winner {wid}")
        elected.add(wid)
check(len(elected)==420,f"2026 unique winners {len(elected)} != 420")
mp_ids={f["id"] for f in mps}
check(elected==mp_ids,"2026 winners must equal 2028 Assembly roster")

blocs=load(auth.get("terena_voter_blocs_2028","data/terena_voter_blocs_2028.json"))
bcons=blocs.get("constituencies",[])
check(len(bcons)==48,f"voter blocs constituencies {len(bcons)} != 48")
for row in bcons:
    wsum=sum(b.get("weight",0) for b in row.get("blocs",[]))
    check(abs(wsum-1)<1e-6,f"{row.get('constituency_id')}: bloc weights sum to {wsum}")

pollsters=load(auth.get("terena_pollsters","data/terena_pollsters.json")).get("pollsters",[])
ids_unique([p.get("id") for p in pollsters],"pollster")
check(8<=len(pollsters)<=16,f"pollster count {len(pollsters)} outside 8-16")

# Chronology / age / STV realism / court terms
for f in figs.get("figures",[]):
    check("age" not in f or f.get("age") is None, f"{f.get('id')}: remove authoritative age field")
    bd=f.get("birth_date","")
    if bd and f.get("first_elected_year") is not None:
        by=int(bd[:4])
        check(f["first_elected_year"]>=by+21, f"{f['id']}: first_elected before age 21")
    blob="|".join(str(f.get(k,"")) for k in ("name","office","notes","party","faction","display_summary"))
    check("???" not in blob and "\ufffd" not in blob, f"{f.get('id')}: text corruption")
    check(not re.search(r"\d", f.get("name","")), f"{f.get('id')}: name contains digit")
mara=next((f for f in figs.get("figures",[]) if f.get("id")=="NPC001"),None)
if mara:
    check(mara.get("presidential_status") in ("term_limited_incumbent","ineligible"),
          "NPC001 must be term-limited/ineligible")
    check(not mara.get("campaign_status"), "NPC001 must not have campaign_status")

for j in judges:
    court=j.get("court") or {}
    a=court.get("appointed",""); e=court.get("term_ends","")
    check(bool(a) and bool(e), f"{j['id']}: missing court dates")
    if a and e:
        check(int(e[:4])-int(a[:4])==12 and a[5:]==e[5:],
              f"{j['id']}: court term must be exactly 12 years same month/day")
    check(bool(court.get("legal_philosophy")), f"{j['id']}: missing legal_philosophy")
    check(bool(court.get("appointing_president") or court.get("appointing_administration")),
          f"{j['id']}: missing appointing authority")
    check(j.get("party_id") is None, f"{j['id']}: judge must have party_id null")
    check(j.get("faction_id") is None, f"{j['id']}: judge must have faction_id null")
    career=(court.get("legal_career") or {})
    check(career.get("prior_path") in {
        "appellate_judge","lower_court_judge","constitutional_lawyer","public_law_attorney",
        "justice_ministry_official","legal_academic","prosecutor_then_judge",
        "public_defender_then_judge","private_counsel_then_judge"
    }, f"{j['id']}: missing credible legal_career.prior_path")
    check(bool(career.get("prior_offices")) and bool(career.get("path_summary")),
          f"{j['id']}: legal_career incomplete")
    traits=j.get("traits") or {}
    check((traits.get("partyLoyalty") or 1) <= 0.2, f"{j['id']}: court partyLoyalty too high")
    check((traits.get("factionLoyalty") or 1) <= 0.15, f"{j['id']}: court factionLoyalty too high")
    check((traits.get("institutionalism") or 0) >= 0.65, f"{j['id']}: court institutionalism too low")

admins=load(auth.get("terena_presidential_administrations","data/terena_presidential_administrations.json"))
admin_ids={a.get("id") for a in admins.get("administrations",[])}
fig_ids={f.get("id") for f in figs.get("figures",[])}
for j in judges:
    court=j.get("court") or {}
    ap=court.get("appointing_president"); aa=court.get("appointing_administration")
    if ap: check(ap in fig_ids, f"{j['id']}: appointing_president {ap} unresolved")
    if aa: check(aa in admin_ids, f"{j['id']}: appointing_administration {aa} unresolved")

for f in figs.get("figures",[]):
    check(f.get("party_id")!="PARTY_IND", f"{f.get('id')}: must not use PARTY_IND membership")
    authored=bool(re.match(r"^NPC0(0[1-9]|1[0-9]|2[0-9]|30)$", f.get("id","")))
    traits=f.get("traits") or {}
    if not authored and f.get("party_id") is None:
        check((traits.get("partyLoyalty") or 1)<=0.2 and (traits.get("factionLoyalty") or 1)<=0.15,
              f"{f.get('id')}: unaffiliated loyalty too high")

for p in parties.get("parties",[]):
    ot=p.get("organization_type")
    if p.get("id")=="PARTY_IND":
        check(ot=="independent_aggregate","PARTY_IND must be independent_aggregate")
    else:
        check(ot=="membership_party", f"{p.get('id')}: must be membership_party")

all_facs=[]
for p in parties.get("parties",[]):
    for fac in p.get("factions",[]):
        all_facs.append((p.get("id"), fac))
chair_by={}
for f in figs.get("figures",[]):
    for r in f.get("roles",[]):
        if r.get("type")!="faction_chair": continue
        fid=r.get("faction_id") or f.get("faction_id")
        check(fid not in chair_by, f"duplicate chair for {fid}")
        chair_by[fid]=f.get("id")
        enclosing=next((pid for pid,x in all_facs if x.get("id")==fid), None)
        check(enclosing is not None, f"{f.get('id')}: unknown faction chair {fid}")
        if enclosing is not None:
            check(f.get("party_id")==enclosing, f"{f.get('id')}: chair party {f.get('party_id')} != {enclosing}")
            check(f.get("faction_id")==fid, f"{f.get('id')}: chair must belong to {fid}")
for pid,fac in all_facs:
    check(fac.get("id") in chair_by, f"faction {fac.get('id')} has no chair")

realism=election.get("stv_realism") or {}
check((realism.get("total_eliminations") or 0)>=30, "2026 STV realism: too few eliminations")
check((realism.get("total_first_count_elected") or 0)<420, "2026 STV realism: all first-count winners")

# Candidate identity integrity
hist=load(auth.get("terena_historical_candidates_2026","data/terena_historical_candidates_2026.json"))
hist_by={c["id"]:c for c in hist.get("candidates",[])}
fig_by={f["id"]:f for f in figs.get("figures",[])}
seen=set()
for row in econs:
    for cand in row.get("candidates",[]):
        cid=cand.get("id"); kind=cand.get("kind"); name=cand.get("name","")
        check(cid not in seen, f"duplicate election candidate {cid}")
        seen.add(cid)
        check(not re.search(r"\d", name), f"digit in candidate name {name}")
        if kind=="politician":
            check(cid in fig_by, f"politician candidate {cid} missing from figures")
            check(cid not in hist_by, f"{cid} in both figures and historical")
        elif kind=="historical":
            check(cid in hist_by, f"historical candidate {cid} missing from historical file")
            check(cid not in fig_by, f"{cid} historical also in figures")
            check(cid not in elected, f"historical {cid} is elected")
        else:
            check(False, f"invalid candidate kind {kind} for {cid}")
for cid,hc in hist_by.items():
    check(cid in seen, f"historical {cid} not in election")
    check(not re.search(r"\d", hc.get("name","")), f"digit in historical name {hc.get('name')}")

# Pollster house-effect centering
pollsters_file=load(auth.get("terena_pollsters","data/terena_pollsters.json"))
for p in pollsters_file.get("pollsters",[]):
    he=p.get("house_effects") or {}
    by=he.get("by_party") if isinstance(he.get("by_party"), dict) else he
    nums=[v for v in by.values() if isinstance(v,(int,float))]
    if nums:
        check(abs(sum(nums))<=0.02, f"pollster {p.get('id')} house_effects not centered")

# Human-friendly report
cross_count=sum(1 for f in C if f["properties"].get("crosses_province_boundaries"))
print(f"Content version: {manifest.get('content_version')}")
print(f"Validated {len(W)} countries, {len(P)} admin units, {len(C)} constituencies, {len(figs.get('figures',[]))} figures, {len(mps)} MPs")
print(f"Assembly constituencies crossing province boundaries by design: {cross_count}/{len(C)}")
if warnings:
    print("WARNINGS:")
    for w in warnings: print(" -",w)
if errors:
    print("ERRORS:")
    for e in errors: print(" -",e)
    sys.exit(1)
print("PASS: canonical content integrity checks succeeded")
