import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  exportScenarioJson,
  scenarioHasBlockingErrors,
  generateConstituencies,
  generateForeignWorld,
  generateLeaders,
  generatePoliticians,
  fillCabinet,
  personDisplay,
  type ScenarioDocument,
  type ScenarioLawSection,
  type ScenarioOrganizationSection,
  type ScenarioPartySection,
  type ScenarioPoliticianSection,
  type ScenarioValidationIssue,
  ELECTORAL_PRESETS,
  GOVERNMENT_FORM_PRESETS,
  TRAIT_BANDS,
  traitBandForValue,
  valueForTraitBand,
} from "@lorsain/scenario";
import { ListDetailPanel } from "./ListDetailPanel.js";
import { useDebouncedValidation, useScenarioAutosave, useUndoStack } from "./hooks.js";
import { PartyPicker, PersonPicker, ThresholdSelect } from "./pickers.js";
import { STUDIO_TABS, entityFocusFromIssue, tabForIssuePath, type StudioTab } from "./navigation.js";
import {
  foreignCountries,
  politicians,
  startingLaws,
  withForeignCountries,
  withPoliticians,
  withStartingLaws,
  mapGovFormSchemaToUi,
  mapGovFormUiToSchema,
  mergeConstitution,
} from "./studioDoc.js";

type TraitBandId = (typeof TRAIT_BANDS)[number]["id"];

function politicianSkillBand(p: ScenarioPoliticianSection): TraitBandId {
  const raw = p.traits?.find((t) => t.startsWith("skill:"))?.slice("skill:".length);
  if (raw === "weak" || raw === "strong" || raw === "average") return raw;
  return traitBandForValue(Number(p.background?.length ?? 0) / 100);
}

function issueRow(
  issue: ScenarioValidationIssue,
  onNavigate?: (issue: ScenarioValidationIssue) => void,
  fix?: ReactNode,
) {
  return (
    <li
      key={`${issue.severity}-${issue.path}-${issue.code}`}
      className={`scenario-issue scenario-issue-${issue.severity}`}
    >
      <button
        type="button"
        className="scenario-issue-link"
        onClick={() => onNavigate?.(issue)}
        disabled={!onNavigate}
      >
        <code>{issue.path || "(root)"}</code> · {issue.code}
      </button>
      <span>{issue.message}</span>
      {fix ? <div className="studio-issue-fix">{fix}</div> : null}
    </li>
  );
}

function filterByQuery<T>(items: T[], query: string, label: (t: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => label(item).toLowerCase().includes(q));
}

export function ScenarioStudioScreen(props: {
  initial: ScenarioDocument;
  onBack: () => void;
  onPlay: (doc: ScenarioDocument) => void;
}) {
  const {
    doc,
    patch,
    replace,
    undo,
    redo,
    canUndo,
    canRedo,
    dirty,
    setDirty,
  } = useUndoStack(props.initial);
  const [tab, setTab] = useState<StudioTab>("overview");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [peopleQ, setPeopleQ] = useState("");
  const [partyQ, setPartyQ] = useState("");
  const [provQ, setProvQ] = useState("");
  const [orgQ, setOrgQ] = useState("");
  const [foreignQ, setForeignQ] = useState("");
  const [selPerson, setSelPerson] = useState(0);
  const [selParty, setSelParty] = useState(0);
  const [selProv, setSelProv] = useState(0);
  const [selOrg, setSelOrg] = useState(0);
  const [selForeign, setSelForeign] = useState(0);

  const loadAutosave = useScenarioAutosave(doc, dirty);
  const liveReport = useDebouncedValidation(doc);
  const blocked = scenarioHasBlockingErrors(liveReport);

  useEffect(() => {
    if (!focusKey) return;
    const [kind, idxStr] = focusKey.split(":");
    const idx = Number(idxStr);
    if (kind === "person") {
      setTab("people");
      setSelPerson(idx);
    } else if (kind === "party") {
      setTab("parties");
      setSelParty(idx);
    } else if (kind === "province") {
      setTab("geography");
      setSelProv(idx);
    } else if (kind === "foreign") {
      setTab("foreign");
      setSelForeign(idx);
    } else if (kind === "org") {
      setTab("organizations");
      setSelOrg(idx);
    }
  }, [focusKey]);

  const people = politicians(doc);
  const parties = doc.contentSections.parties ?? [];
  const provinces = doc.contentSections.geography?.provinces ?? [];
  const orgs = doc.contentSections.organizations ?? [];
  const foreign = foreignCountries(doc);
  const laws = startingLaws(doc);

  const filteredPeople = useMemo(
    () => filterByQuery(people, peopleQ, (p) => personDisplay(p)),
    [people, peopleQ],
  );
  const filteredParties = useMemo(
    () => filterByQuery(parties, partyQ, (p) => p.name),
    [parties, partyQ],
  );
  const filteredProvinces = useMemo(
    () => filterByQuery(provinces, provQ, (p) => p.name),
    [provinces, provQ],
  );

  function requestBack() {
    if (dirty && !window.confirm("Discard unsaved scenario edits?")) return;
    props.onBack();
  }

  function download() {
    if (blocked) return;
    const blob = new Blob([exportScenarioJson(doc)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.scenarioId.toLowerCase()}.lorsain.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDirty(false);
  }

  function navigateIssue(issue: ScenarioValidationIssue) {
    setTab(tabForIssuePath(issue.path));
    setFocusKey(entityFocusFromIssue(issue));
  }

  function runGen(fn: (d: ScenarioDocument) => ScenarioDocument) {
    replace(fn(doc));
  }

  const personIdx = Math.min(selPerson, Math.max(0, people.length - 1));
  const partyIdx = Math.min(selParty, Math.max(0, parties.length - 1));
  const provIdx = Math.min(selProv, Math.max(0, provinces.length - 1));
  const orgIdx = Math.min(selOrg, Math.max(0, orgs.length - 1));
  const foreignIdx = Math.min(selForeign, Math.max(0, foreign.length - 1));

  const activePerson = people[personIdx];
  const activeParty = parties[partyIdx];

  return (
    <div className="scenario-editor studio-shell">
      <header className="scenario-editor-head studio-toolbar">
        <div>
          <div className="kicker">SCENARIO STUDIO · v{doc.formatVersion}</div>
          <h1>{doc.name}</h1>
          <p>
            {doc.countryName} · {doc.scenarioId}
            {dirty ? " · unsaved changes" : ""}
            {blocked ? " · fix errors to export/play" : ""}
          </p>
        </div>
        <div className="row studio-toolbar-actions">
          <button type="button" className="btn secondary" disabled={!canUndo} onClick={undo}>
            Undo
          </button>
          <button type="button" className="btn secondary" disabled={!canRedo} onClick={redo}>
            Redo
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              const saved = loadAutosave();
              if (saved && window.confirm("Restore autosaved draft from this browser?")) {
                replace(saved);
              }
            }}
          >
            Restore autosave
          </button>
          <button type="button" className="btn secondary" onClick={requestBack}>
            Back
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={blocked}
            title={blocked ? "Resolve validation errors before export" : undefined}
            onClick={download}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="btn"
            disabled={blocked}
            onClick={() => props.onPlay(doc)}
          >
            Play
          </button>
        </div>
      </header>
      <nav className="scenario-tabs studio-tabs" aria-label="Scenario Studio sections">
        {STUDIO_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "validation" && liveReport.errors.length > 0 ? (
              <span className="studio-tab-badge">{liveReport.errors.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="scenario-editor-body studio-body">
        {tab === "overview" && (
          <section className="scenario-form">
            <label>
              Scenario name
              <input value={doc.name} onChange={(e) => patch((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <details className="studio-advanced">
              <summary>Advanced identifiers</summary>
              <label>
                Scenario ID
                <input
                  value={doc.scenarioId}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      scenarioId: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                    }))
                  }
                />
              </label>
            </details>
            <label>
              Country name
              <input
                value={doc.countryName}
                onChange={(e) => patch((d) => ({ ...d, countryName: e.target.value }))}
              />
            </label>
            <label>
              Start date
              <input
                type="date"
                value={doc.startDate}
                onChange={(e) => patch((d) => ({ ...d, startDate: e.target.value }))}
              />
            </label>
            <label>
              Tagline
              <input
                value={doc.contentSections.overview?.tagline ?? ""}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      overview: { ...d.contentSections.overview, tagline: e.target.value },
                    },
                  }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={doc.description ?? ""}
                rows={4}
                onChange={(e) => patch((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
            <label>
              Author
              <input
                value={doc.author ?? ""}
                onChange={(e) => patch((d) => ({ ...d, author: e.target.value }))}
              />
            </label>
            <div className="studio-summary-grid" aria-label="Scenario summary">
              <div>
                <strong>{provinces.length}</strong>
                <span>Provinces</span>
              </div>
              <div>
                <strong>
                  {doc.contentSections.constitution?.assemblySeats ??
                    doc.contentSections.world?.assemblySeats ??
                    "—"}
                </strong>
                <span>Assembly seats</span>
              </div>
              <div>
                <strong>{parties.length}</strong>
                <span>Parties</span>
              </div>
              <div>
                <strong>{people.length}</strong>
                <span>Politicians</span>
              </div>
              <div>
                <strong>{orgs.length}</strong>
                <span>Organizations</span>
              </div>
              <div>
                <strong>{foreign.length}</strong>
                <span>Foreign countries</span>
              </div>
            </div>
            <div className="studio-gen-row">
              <button type="button" className="btn secondary" onClick={() => runGen(generateLeaders)}>
                Generate party leaders
              </button>
              <button type="button" className="btn secondary" onClick={() => runGen(generatePoliticians)}>
                Generate assembly roster
              </button>
            </div>
          </section>
        )}

        {tab === "constitution" && (
          <section className="scenario-form">
            <label>
              Government form
              <select
                value={mapGovFormSchemaToUi(doc.contentSections.constitution?.governmentForm)}
                onChange={(e) =>
                  patch((d) =>
                    mergeConstitution(d, {
                      governmentForm: mapGovFormUiToSchema(
                        e.target.value as ReturnType<typeof mapGovFormSchemaToUi>,
                      ),
                    }),
                  )
                }
              >
                {GOVERNMENT_FORM_PRESETS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assembly seats
              <input
                type="number"
                min={1}
                value={doc.contentSections.constitution?.assemblySeats ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  patch((d) => mergeConstitution(d, { assemblySeats: n }));
                }}
              />
            </label>
            <label>
              Absolute majority (seats)
              <input
                type="number"
                min={1}
                value={doc.contentSections.constitution?.assemblyAbsoluteMajority ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  patch((d) => mergeConstitution(d, { assemblyAbsoluteMajority: n }));
                }}
              />
            </label>
            <label>
              Constitutional Court size
              <input
                type="number"
                min={0}
                value={doc.contentSections.constitution?.courtJudges ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  patch((d) => mergeConstitution(d, { courtJudges: n }));
                }}
              />
            </label>
            <label>
              Court term (years)
              <input
                type="number"
                min={1}
                max={20}
                value={doc.contentSections.constitution?.courtTermYears ?? 12}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  patch((d) => mergeConstitution(d, { courtTermYears: n }));
                }}
              />
            </label>
            <ThresholdSelect
              label="Ministerial censure"
              fraction={doc.contentSections.constitution?.ministerialCensureFraction}
              onChange={(fraction) =>
                patch((d) => mergeConstitution(d, { ministerialCensureFraction: fraction }))
              }
            />
            <label>
              Regulation review window (days)
              <input
                type="number"
                min={0}
                max={365}
                value={doc.contentSections.constitution?.regulationReviewDays ?? 30}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  patch((d) => mergeConstitution(d, { regulationReviewDays: n }));
                }}
              />
            </label>
          </section>
        )}

        {tab === "geography" && (
          <ListDetailPanel
            title="Provinces"
            search={provQ}
            onSearch={setProvQ}
            toolbar={
              <button
                type="button"
                className="btn secondary studio-btn-sm"
                onClick={() =>
                  patch((d) => {
                    const list = [...(d.contentSections.geography?.provinces ?? [])];
                    const n = list.length + 1;
                    list.push({ id: `PRV_${String(n).padStart(2, "0")}`, name: `Province ${n}` });
                    return {
                      ...d,
                      contentSections: { ...d.contentSections, geography: { provinces: list } },
                    };
                  })
                }
              >
                Add
              </button>
            }
            list={
              <ul className="studio-entity-list">
                {filterByQuery(provinces, provQ, (p) => p.name).map((p) => {
                  const idx = provinces.indexOf(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={idx === provIdx ? "active" : ""}
                        onClick={() => setSelProv(idx)}
                      >
                        {p.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            }
            detail={
              provinces[provIdx] ? (
                <div className="scenario-form">
                  <label>
                    Name
                    <input
                      value={provinces[provIdx]!.name}
                      onChange={(e) =>
                        patch((d) => {
                          const list = [...(d.contentSections.geography?.provinces ?? [])];
                          const row = list[provIdx];
                          if (!row) return d;
                          list[provIdx] = { ...row, name: e.target.value };
                          return {
                            ...d,
                            contentSections: {
                              ...d.contentSections,
                              geography: {
                                ...(d.contentSections.geography ?? {}),
                                provinces: list,
                              },
                            },
                          };
                        })
                      }
                    />
                  </label>
                  <label>
                    Population
                    <input
                      type="number"
                      min={0}
                      value={provinces[provIdx]!.population ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        patch((d) => {
                          const list = [...(d.contentSections.geography?.provinces ?? [])];
                          const row = list[provIdx];
                          if (!row) return d;
                          list[provIdx] = { ...row, population: n };
                          return {
                            ...d,
                            contentSections: {
                              ...d.contentSections,
                              geography: {
                                ...(d.contentSections.geography ?? {}),
                                provinces: list,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>
                  <label>
                    Economy
                    <select
                      value={provinces[provIdx]!.economy ?? "mixed"}
                      onChange={(e) =>
                        patch((d) => {
                          const list = [...(d.contentSections.geography?.provinces ?? [])];
                          const row = list[provIdx];
                          if (!row) return d;
                          list[provIdx] = { ...row, economy: e.target.value };
                          return {
                            ...d,
                            contentSections: {
                              ...d.contentSections,
                              geography: {
                                ...(d.contentSections.geography ?? {}),
                                provinces: list,
                              },
                            },
                          };
                        })
                      }
                    >
                      <option value="industrial">Industrial</option>
                      <option value="agrarian">Agrarian</option>
                      <option value="services">Services</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </label>
                  <label>
                    Urbanization
                    <select
                      value={provinces[provIdx]!.urbanization ?? "medium"}
                      onChange={(e) =>
                        patch((d) => {
                          const list = [...(d.contentSections.geography?.provinces ?? [])];
                          const row = list[provIdx];
                          if (!row) return d;
                          list[provIdx] = { ...row, urbanization: e.target.value };
                          return {
                            ...d,
                            contentSections: {
                              ...d.contentSections,
                              geography: {
                                ...(d.contentSections.geography ?? {}),
                                provinces: list,
                              },
                            },
                          };
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <p className="studio-hint">
                    Constituencies:{" "}
                    {(doc.contentSections.geography?.constituencies ?? []).filter(
                      (c) => c.provinceId === provinces[provIdx]!.id,
                    ).length || "none yet"}
                  </p>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => runGen(generateConstituencies)}
                  >
                    Generate constituencies
                  </button>
                </div>
              ) : (
                <p>Add a province to begin.</p>
              )
            }
          />
        )}

        {tab === "parties" && (
          <ListDetailPanel
            title="Parties"
            search={partyQ}
            onSearch={setPartyQ}
            toolbar={
              <button
                type="button"
                className="btn secondary studio-btn-sm"
                onClick={() =>
                  patch((d) => {
                    const list = [...(d.contentSections.parties ?? [])];
                    const n = list.length + 1;
                    list.push({
                      id: `PARTY_${String(n).padStart(2, "0")}`,
                      name: `Party ${n}`,
                      abbreviation: `P${n}`,
                      ideology: "centre",
                      leaderId: "",
                    });
                    return { ...d, contentSections: { ...d.contentSections, parties: list } };
                  })
                }
              >
                Add
              </button>
            }
            list={
              <ul className="studio-entity-list">
                {filteredParties.map((p) => {
                  const idx = parties.indexOf(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={idx === partyIdx ? "active" : ""}
                        onClick={() => setSelParty(idx)}
                      >
                        {p.color ? (
                          <span className="studio-swatch" style={{ background: p.color }} aria-hidden />
                        ) : null}
                        {p.name}
                        <small>{p.abbreviation}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            }
            detail={
              activeParty ? (
                <PartyDetail
                  party={activeParty}
                  partyIdx={partyIdx}
                  people={people}
                  patch={patch}
                />
              ) : (
                <p>Add a party to begin.</p>
              )
            }
          />
        )}

        {tab === "people" && (
          <ListDetailPanel
            title="People"
            search={peopleQ}
            onSearch={setPeopleQ}
            toolbar={
              <button
                type="button"
                className="btn secondary studio-btn-sm"
                onClick={() =>
                  patch((d) => {
                    const list = [...politicians(d)];
                    const n = list.length + 1;
                    list.push({
                      id: `NPC_${String(n).padStart(3, "0")}`,
                      name: `New Politician ${n}`,
                      partyId: parties[0]?.id ?? null,
                    });
                    return withPoliticians(d, list);
                  })
                }
              >
                Add
              </button>
            }
            list={
              <ul className="studio-entity-list">
                {filteredPeople.map((p) => {
                  const idx = people.indexOf(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={idx === personIdx ? "active" : ""}
                        onClick={() => setSelPerson(idx)}
                      >
                        {personDisplay(p)}
                        <small>{p.partyId ?? "Independent"}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            }
            detail={
              activePerson ? (
                <PersonDetail person={activePerson} personIdx={personIdx} parties={parties} patch={patch} />
              ) : (
                <p>Add people or run Generate assembly roster.</p>
              )
            }
          />
        )}

        {tab === "government" && (
          <section className="scenario-form">
            <PersonPicker
              label="President / head of state"
              value={doc.contentSections.government?.presidentId ?? ""}
              people={people}
              allowEmpty
              onChange={(id) =>
                patch((d) => ({
                  ...d,
                  contentSections: {
                    ...d.contentSections,
                    government: {
                      ...d.contentSections.government,
                      presidentId: id || null,
                    },
                  },
                }))
              }
            />
            <PersonPicker
              label="Head of government"
              value={doc.contentSections.government?.headOfGovernmentId ?? ""}
              people={people}
              allowEmpty
              onChange={(id) =>
                patch((d) => ({
                  ...d,
                  contentSections: {
                    ...d.contentSections,
                    government: {
                      ...d.contentSections.government,
                      headOfGovernmentId: id || null,
                    },
                  },
                }))
              }
            />
            <label>
              Governing parties
              <select
                multiple
                size={Math.min(6, Math.max(3, parties.length))}
                value={doc.contentSections.government?.coalitionPartyIds ?? []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      government: {
                        ...d.contentSections.government,
                        coalitionPartyIds: selected,
                      },
                    },
                  }));
                }}
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="studio-gen-row">
              <button type="button" className="btn secondary" onClick={() => runGen(fillCabinet)}>
                Fill cabinet automatically
              </button>
            </div>
            <ul className="studio-cabinet-list">
              {(doc.contentSections.government?.cabinet ?? []).map((c) => {
                const holder = people.find((p) => p.id === c.holderId);
                const title = c.ministryId
                  .replace(/^MIN_/, "")
                  .replace(/_/g, " ")
                  .toLowerCase()
                  .replace(/\b\w/g, (ch) => ch.toUpperCase());
                return (
                  <li key={c.ministryId}>
                    <strong>{title}</strong>
                    <span>{holder ? personDisplay(holder) : "Vacant"}</span>
                  </li>
                );
              })}
            </ul>
            {(doc.contentSections.government?.cabinet ?? []).length === 0 ? (
              <p className="studio-hint">No cabinet yet — fill automatically or assign after generating people.</p>
            ) : null}
          </section>
        )}

        {tab === "elections" && (
          <section className="scenario-form">
            <label>
              Assembly electoral system
              <select
                value={doc.contentSections.elections?.assemblySystem ?? ELECTORAL_PRESETS[0].id}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      elections: {
                        ...(d.contentSections.elections ?? {}),
                        assemblySystem: e.target.value as import("@lorsain/scenario").AssemblySystemId,
                      },
                    },
                  }))
                }
              >
                {ELECTORAL_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assembly election interval (years)
              <input
                type="number"
                min={1}
                max={10}
                value={doc.contentSections.elections?.assemblyIntervalYears ?? 4}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      elections: {
                        ...d.contentSections.elections,
                        assemblyIntervalYears: Number(e.target.value),
                      },
                    },
                  }))
                }
              />
            </label>
            <label>
              Presidential election interval (years)
              <input
                type="number"
                min={1}
                max={10}
                value={doc.contentSections.elections?.presidentialIntervalYears ?? 5}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    contentSections: {
                      ...d.contentSections,
                      elections: {
                        ...d.contentSections.elections,
                        presidentialIntervalYears: Number(e.target.value),
                      },
                    },
                  }))
                }
              />
            </label>
          </section>
        )}

        {tab === "laws" && (
          <section className="scenario-form">
            <div className="studio-gen-row">
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  patch((d) => {
                    const list = [...startingLaws(d)];
                    list.push({
                      id: `LAW_${String(list.length + 1).padStart(2, "0")}`,
                      title: "New bill",
                    });
                    return withStartingLaws(d, list);
                  })
                }
              >
                Add law
              </button>
            </div>
            {laws.map((law, i) => (
              <LawRow key={law.id} law={law} index={i} patch={patch} />
            ))}
            {laws.length === 0 ? <p>No laws yet — add draft legislation for flavor and QA.</p> : null}
          </section>
        )}

        {tab === "organizations" && (
          <OrgForeignPanel
            kind="organizations"
            items={orgs}
            query={orgQ}
            setQuery={setOrgQ}
            selIdx={orgIdx}
            setSelIdx={setSelOrg}
            onAdd={() =>
              patch((d) => {
                const list = [...(d.contentSections.organizations ?? [])];
                list.push({
                  id: `ORG_${String(list.length + 1).padStart(2, "0")}`,
                  name: "New organization",
                  type: "civic",
                  issues: ["governance"],
                });
                return { ...d, contentSections: { ...d.contentSections, organizations: list } };
              })
            }
            patch={patch}
          />
        )}

        {tab === "foreign" && (
          <>
            <div className="studio-gen-row studio-body-pad">
              <button
                type="button"
                className="btn secondary"
                onClick={() => runGen((d) => withForeignCountries(d, generateForeignWorld(4)))}
              >
                Generate foreign world
              </button>
            </div>
            <OrgForeignPanel
              kind="foreign"
              items={foreign}
              query={foreignQ}
              setQuery={setForeignQ}
              selIdx={foreignIdx}
              setSelIdx={setSelForeign}
              onAdd={() =>
                patch((d) => {
                  const list = [...foreignCountries(d)];
                  list.push({ id: `NEI_${String(list.length + 1).padStart(2, "0")}`, name: "Neighbor state" });
                  return withForeignCountries(d, list);
                })
              }
              patch={patch}
            />
          </>
        )}

        {tab === "validation" && (
          <ValidationTab
            report={liveReport}
            onNavigate={navigateIssue}
            onFixLeaders={() => runGen(generateLeaders)}
            onFixMps={() => runGen(generatePoliticians)}
          />
        )}

        {tab === "packs" && (
          <PacksPanel
            doc={doc}
            patch={patch}
          />
        )}
      </div>
    </div>
  );
}

function PacksPanel(props: {
  doc: ScenarioDocument;
  patch: (u: (d: ScenarioDocument) => ScenarioDocument) => void;
}) {
  const [packMsg, setPackMsg] = useState<string | null>(null);
  return (
    <section className="scenario-panel studio-packs-panel">
      <h2>Content Packs</h2>
      <p>
        Declarative packs can add situations, scandals, organizations, crises, and bill templates.
        Packs never execute code.
      </p>
      <label className="studio-file-import">
        Import content pack JSON
        <input
          type="file"
          accept="application/json,.json,.lorsain-pack.json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const text = await file.text();
              const { importContentPackJson } = await import("@lorsain/scenario");
              const result = importContentPackJson(text);
              if (!result.ok) {
                setPackMsg(result.error);
                return;
              }
              props.patch((d) => {
                const packs = [...(d.contentSections.contentPacks ?? [])];
                const existing = packs.findIndex((p) => p.packId === result.document.packId);
                const entry = {
                  packId: result.document.packId,
                  version: result.document.version,
                };
                if (existing >= 0) packs[existing] = entry;
                else packs.push(entry);
                return {
                  ...d,
                  contentSections: { ...d.contentSections, contentPacks: packs },
                };
              });
              setPackMsg(`Linked ${result.document.name} (${result.document.packId})`);
            } catch (err) {
              setPackMsg(err instanceof Error ? err.message : "Import failed");
            }
          }}
        />
      </label>
      {packMsg ? <p className="studio-hint">{packMsg}</p> : null}
      <ul className="studio-entity-list">
        {(props.doc.contentSections.contentPacks ?? []).map((p) => (
          <li key={`${p.packId}@${p.version}`}>
            <strong>{p.packId}</strong> <small>v{p.version}</small>
            <button
              type="button"
              className="btn secondary studio-btn-sm"
              onClick={() =>
                props.patch((d) => ({
                  ...d,
                  contentSections: {
                    ...d.contentSections,
                    contentPacks: (d.contentSections.contentPacks ?? []).filter(
                      (x) => x.packId !== p.packId,
                    ),
                  },
                }))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {(props.doc.contentSections.contentPacks ?? []).length === 0 ? (
        <p className="studio-hint">No content packs linked yet.</p>
      ) : null}
    </section>
  );
}

function PartyDetail(props: {
  party: ScenarioPartySection;
  partyIdx: number;
  people: ScenarioPoliticianSection[];
  patch: (u: (d: ScenarioDocument) => ScenarioDocument) => void;
}) {
  const { party, partyIdx, people, patch } = props;
  return (
    <div className="scenario-form">
      <label>
        Name
        <input
          value={party.name}
          onChange={(e) =>
            patch((d) => {
              const next = [...(d.contentSections.parties ?? [])];
              next[partyIdx] = { ...party, name: e.target.value };
              return { ...d, contentSections: { ...d.contentSections, parties: next } };
            })
          }
        />
      </label>
      <label>
        Abbreviation
        <input
          value={party.abbreviation}
          onChange={(e) =>
            patch((d) => {
              const next = [...(d.contentSections.parties ?? [])];
              next[partyIdx] = { ...party, abbreviation: e.target.value };
              return { ...d, contentSections: { ...d.contentSections, parties: next } };
            })
          }
        />
      </label>
      <label>
        Ideology label
        <input
          value={party.ideologyLabel ?? party.ideology ?? ""}
          onChange={(e) =>
            patch((d) => {
              const next = [...(d.contentSections.parties ?? [])];
              next[partyIdx] = {
                ...party,
                ideology: e.target.value,
                ideologyLabel: e.target.value,
              };
              return { ...d, contentSections: { ...d.contentSections, parties: next } };
            })
          }
        />
      </label>
      <label>
        Party color
        <input
          type="color"
          value={party.color?.startsWith("#") ? party.color : "#2d5a8c"}
          onChange={(e) =>
            patch((d) => {
              const next = [...(d.contentSections.parties ?? [])];
              next[partyIdx] = { ...party, color: e.target.value };
              return { ...d, contentSections: { ...d.contentSections, parties: next } };
            })
          }
        />
      </label>
      <PersonPicker
        label="Party leader"
        value={party.leaderId}
        people={people}
        onChange={(leaderId) =>
          patch((d) => {
            const next = [...(d.contentSections.parties ?? [])];
            next[partyIdx] = { ...party, leaderId };
            return { ...d, contentSections: { ...d.contentSections, parties: next } };
          })
        }
      />
    </div>
  );
}

function PersonDetail(props: {
  person: ScenarioPoliticianSection;
  personIdx: number;
  parties: ScenarioPartySection[];
  patch: (u: (d: ScenarioDocument) => ScenarioDocument) => void;
}) {
  const { person, personIdx, parties, patch } = props;
  return (
    <div className="scenario-form">
      <label>
        Display name
        <input
          value={person.name}
          onChange={(e) =>
            patch((d) => {
              const list = [...politicians(d)];
              list[personIdx] = { ...person, name: e.target.value };
              return withPoliticians(d, list);
            })
          }
        />
      </label>
      <PartyPicker
        label="Party"
        value={person.partyId ?? ""}
        parties={parties}
        allowEmpty
        onChange={(partyId) =>
          patch((d) => {
            const list = [...politicians(d)];
            list[personIdx] = { ...person, partyId: partyId || null };
            return withPoliticians(d, list);
          })
        }
      />
      <TraitSelect
        label="Political skill"
        value={politicianSkillBand(person)}
        onChange={(level) =>
          patch((d) => {
            const list = [...politicians(d)];
            const traits = (person.traits ?? []).filter((t) => !t.startsWith("skill:"));
            traits.push(`skill:${level}`);
            list[personIdx] = {
              ...person,
              traits,
              background: String(valueForTraitBand(level)),
            };
            return withPoliticians(d, list);
          })
        }
      />
    </div>
  );
}

function TraitSelect(props: {
  label: string;
  value: TraitBandId;
  onChange: (v: TraitBandId) => void;
}) {
  return (
    <label className="studio-field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as TraitBandId)}>
        {TRAIT_BANDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LawRow(props: {
  law: ScenarioLawSection;
  index: number;
  patch: (u: (d: ScenarioDocument) => ScenarioDocument) => void;
}) {
  const { law, index, patch } = props;
  return (
    <article className="scenario-party-card">
      <label>
        Title
        <input
          value={law.title}
          onChange={(e) =>
            patch((d) => {
              const list = [...startingLaws(d)];
              list[index] = { ...law, title: e.target.value };
              return withStartingLaws(d, list);
            })
          }
        />
      </label>
      <label>
        Catalog reference
        <input
          value={law.catalogRef ?? ""}
          onChange={(e) =>
            patch((d) => {
              const list = [...startingLaws(d)];
              const next = { ...law, title: law.title };
              if (e.target.value.trim()) next.catalogRef = e.target.value;
              else delete next.catalogRef;
              list[index] = next;
              return withStartingLaws(d, list);
            })
          }
        />
      </label>
    </article>
  );
}

function OrgForeignPanel(props: {
  kind: "organizations" | "foreign";
  items: Array<{ id: string; name: string; relation?: number; type?: string; issues?: string[] }>;
  query: string;
  setQuery: (q: string) => void;
  selIdx: number;
  setSelIdx: (n: number) => void;
  onAdd: () => void;
  patch: (u: (d: ScenarioDocument) => ScenarioDocument) => void;
}) {
  const items = props.items;
  const filtered = filterByQuery(items, props.query, (x) => x.name);
  const active = items[props.selIdx];
  const title = props.kind === "organizations" ? "Organizations" : "Foreign countries";

  return (
    <ListDetailPanel
      title={title}
      search={props.query}
      onSearch={props.setQuery}
      toolbar={
        <button type="button" className="btn secondary studio-btn-sm" onClick={props.onAdd}>
          Add
        </button>
      }
      list={
        <ul className="studio-entity-list">
          {filtered.map((item) => {
            const idx = items.indexOf(item as (typeof items)[number]);
            return (
              <li key={"id" in item ? item.id : idx}>
                <button
                  type="button"
                  className={idx === props.selIdx ? "active" : ""}
                  onClick={() => props.setSelIdx(idx)}
                >
                  {"name" in item ? item.name : ""}
                  <small>{"id" in item ? item.id : ""}</small>
                </button>
              </li>
            );
          })}
        </ul>
      }
      detail={
        active && "name" in active ? (
          <div className="scenario-form">
            <label>
              Name
              <input
                value={active.name}
                onChange={(e) =>
                  props.patch((d) => {
                    if (props.kind === "organizations") {
                      const list = [...(d.contentSections.organizations ?? [])];
                      const row = list[props.selIdx];
                      if (!row) return d;
                      list[props.selIdx] = { ...row, name: e.target.value };
                      return { ...d, contentSections: { ...d.contentSections, organizations: list } };
                    }
                    const list = [...foreignCountries(d)];
                    const row = list[props.selIdx];
                    if (!row) return d;
                    list[props.selIdx] = { ...row, name: e.target.value };
                    return withForeignCountries(d, list);
                  })
                }
              />
            </label>
            {props.kind === "foreign" ? (
              <label>
                Diplomatic relationship
                <select
                  value={
                    (active.relation ?? 0) >= 0.4
                      ? "friendly"
                      : (active.relation ?? 0) <= -0.4
                        ? "tense"
                        : "neutral"
                  }
                  onChange={(e) =>
                    props.patch((d) => {
                      const list = [...foreignCountries(d)];
                      const row = list[props.selIdx];
                      if (!row) return d;
                      const relation =
                        e.target.value === "friendly" ? 0.55 : e.target.value === "tense" ? -0.55 : 0;
                      list[props.selIdx] = { ...row, relation };
                      return withForeignCountries(d, list);
                    })
                  }
                >
                  <option value="friendly">Friendly</option>
                  <option value="neutral">Neutral</option>
                  <option value="tense">Tense</option>
                </select>
              </label>
            ) : (
              <label>
                Type
                <select
                  value={active.type ?? "civic"}
                  onChange={(e) =>
                    props.patch((d) => {
                      const list = [...(d.contentSections.organizations ?? [])];
                      const row = list[props.selIdx];
                      if (!row) return d;
                      list[props.selIdx] = { ...row, type: e.target.value };
                      return { ...d, contentSections: { ...d.contentSections, organizations: list } };
                    })
                  }
                >
                  <option value="labor">Labor</option>
                  <option value="business">Business</option>
                  <option value="environmental">Environmental</option>
                  <option value="civil_rights">Civil rights</option>
                  <option value="professional">Professional</option>
                  <option value="agriculture">Agriculture</option>
                  <option value="technology">Technology</option>
                  <option value="civic">Civic</option>
                </select>
              </label>
            )}
          </div>
        ) : (
          <p>Select or add an entry.</p>
        )
      }
    />
  );
}

function ValidationTab(props: {
  report: ReturnType<typeof useDebouncedValidation>;
  onNavigate: (issue: ScenarioValidationIssue) => void;
  onFixLeaders: () => void;
  onFixMps: () => void;
}) {
  return (
    <section className="scenario-validation-grid">
      <article className="scenario-panel">
        <h2>Errors ({props.report.errors.length})</h2>
        <ul className="scenario-issue-list">
          {props.report.errors.map((i) => issueRow(i, props.onNavigate))}
        </ul>
      </article>
      <article className="scenario-panel">
        <h2>Warnings ({props.report.warnings.length})</h2>
        <ul className="scenario-issue-list">
          {props.report.warnings.map((i) =>
            issueRow(
              i,
              props.onNavigate,
              i.code === "PARTY_LEADER" ? (
                <button type="button" className="btn secondary studio-btn-sm" onClick={props.onFixLeaders}>
                  Generate leaders
                </button>
              ) : undefined,
            ),
          )}
        </ul>
      </article>
      <article className="scenario-panel">
        <h2>Suggestions ({props.report.suggestions.length})</h2>
        <ul className="scenario-issue-list">
          {props.report.suggestions.map((i) => issueRow(i, props.onNavigate))}
        </ul>
      </article>
      <div className="studio-gen-row">
        <button type="button" className="btn secondary" onClick={props.onFixLeaders}>
          Fix vacant party leaders
        </button>
        <button type="button" className="btn secondary" onClick={props.onFixMps}>
          Generate MPs
        </button>
      </div>
    </section>
  );
}

/** Re-export for editor alias */
export { ScenarioStudioScreen as ScenarioEditorScreen };
