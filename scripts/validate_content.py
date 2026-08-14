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
for key in ("canonical_crosswalk","terena_electoral_counting"):
    check(key in auth,f"manifest.authoritative missing {key}")
    if key in auth: load(auth[key])
check("presidential_eligibility" not in auth, "presidential_eligibility must stay pending/reference until approved")
ref=manifest.get("derived_or_reference",{})
for key in ("world_history_timeline","terena_history_timeline","presidential_eligibility_pending"):
    check(key in ref,f"manifest.derived_or_reference missing {key}")

# Human-friendly report
cross_count=sum(1 for f in C if f["properties"].get("crosses_province_boundaries"))
print(f"Content version: {manifest.get('content_version')}")
print(f"Validated {len(W)} countries, {len(P)} admin units, {len(C)} constituencies, {len(figs.get('figures',[]))} top-level figures")
print(f"Assembly constituencies crossing province boundaries by design: {cross_count}/{len(C)}")
if warnings:
    print("WARNINGS:")
    for w in warnings: print(" -",w)
if errors:
    print("ERRORS:")
    for e in errors: print(" -",e)
    sys.exit(1)
print("PASS: canonical content integrity checks succeeded")
