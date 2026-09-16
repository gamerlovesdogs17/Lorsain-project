import { useState } from "react";
import { generateQuickBuildDocument, ELECTORAL_PRESETS, GOVERNMENT_FORM_PRESETS } from "@lorsain/scenario";
import type { ScenarioDocument } from "@lorsain/scenario";

type EntryMode = "home" | "quick";

export function ScenarioStudioEntryScreen(props: {
  onBack: () => void;
  onImport: () => void;
  onOpenEditor: (doc: ScenarioDocument) => void;
}) {
  const [mode, setMode] = useState<EntryMode>("home");
  const [countryName, setCountryName] = useState("New Republic");
  const [startDate, setStartDate] = useState("2028-01-01");
  const [govForm, setGovForm] = useState<(typeof GOVERNMENT_FORM_PRESETS)[number]["id"]>("presidential");
  const [assemblySeats, setAssemblySeats] = useState(24);
  const [provinceCount, setProvinceCount] = useState(2);
  const [partyCount, setPartyCount] = useState(3);
  const [electoralPreset, setElectoralPreset] = useState<(typeof ELECTORAL_PRESETS)[number]["id"]>("stv");

  if (mode === "quick") {
    return (
      <div className="scenario-screen studio-entry">
        <header className="scenario-screen-head">
          <div>
            <div className="kicker">SCENARIO STUDIO</div>
            <h1>Quick Build</h1>
            <p>Generate a playable draft, then refine in the full editor.</p>
          </div>
          <button type="button" className="btn secondary" onClick={() => setMode("home")}>
            Back
          </button>
        </header>
        <form
          className="scenario-form studio-wizard-form"
          onSubmit={(e) => {
            e.preventDefault();
            const doc = generateQuickBuildDocument({
              countryName: countryName.trim() || "New Republic",
              startDate,
              govForm,
              assemblySeats,
              provinceCount,
              partyCount,
              electoralPresetId: electoralPreset,
            });
            props.onOpenEditor(doc);
          }}
        >
          <label>
            Country name
            <input value={countryName} onChange={(e) => setCountryName(e.target.value)} required />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            Government form
            <select value={govForm} onChange={(e) => setGovForm(e.target.value as typeof govForm)}>
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
              min={4}
              max={600}
              value={assemblySeats}
              onChange={(e) => setAssemblySeats(Number(e.target.value))}
            />
          </label>
          <label>
            Provinces
            <input
              type="number"
              min={1}
              max={24}
              value={provinceCount}
              onChange={(e) => setProvinceCount(Number(e.target.value))}
            />
          </label>
          <label>
            Major parties
            <input
              type="number"
              min={2}
              max={6}
              value={partyCount}
              onChange={(e) => setPartyCount(Number(e.target.value))}
            />
          </label>
          <label>
            Electoral system
            <select
              value={electoralPreset}
              onChange={(e) => setElectoralPreset(e.target.value as typeof electoralPreset)}
            >
              {ELECTORAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <footer className="scenario-actions">
            <button type="submit" className="btn">
              Generate &amp; open editor
            </button>
          </footer>
        </form>
      </div>
    );
  }

  return (
    <div className="scenario-screen studio-entry">
      <header className="scenario-screen-head">
        <div>
          <div className="kicker">SCENARIO STUDIO</div>
          <h1>Create a custom world</h1>
          <p>
            Terena stays the bundled default for <strong>New Game</strong>. Build or import your
            own scenario here.
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={props.onBack}>
          Main menu
        </button>
      </header>
      <div className="studio-entry-grid">
        <button type="button" className="studio-entry-card" onClick={() => setMode("quick")}>
          <strong>Quick Build</strong>
          <span>Wizard: country, calendar, seats, parties → generated draft</span>
        </button>
        <button
          type="button"
          className="studio-entry-card"
          onClick={() =>
            props.onOpenEditor({
              format: "lorsain-scenario",
              formatVersion: 1,
              scenarioId: "MY_SCENARIO",
              name: "Untitled scenario",
              startDate: "2028-01-01",
              countryName: "New Republic",
              contentSections: {
                parties: [],
                geography: { provinces: [{ id: "PRV_01", name: "Capital Province" }] },
                constitution: { assemblySeats: 12, courtJudges: 3 },
                people: { politicians: [] },
              },
              contentEmbed: { kind: "mini_playable_v1" },
            })
          }
        >
          <strong>Blank document</strong>
          <span>Advanced: start from an empty template</span>
        </button>
        <button type="button" className="studio-entry-card" onClick={props.onImport}>
          <strong>Import JSON</strong>
          <span>
            Load an existing <code>.lorsain.json</code> package
          </span>
        </button>
      </div>
    </div>
  );
}
