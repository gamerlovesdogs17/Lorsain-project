import { useMemo, useState } from "react";
import type { ScenarioPoliticianSection } from "@lorsain/scenario";
import { personDisplay, THRESHOLD_PRESETS, thresholdPresetForFraction, fractionForThresholdPreset } from "@lorsain/scenario";
import type { ThresholdPresetId } from "@lorsain/scenario";

export type PickerOption = { id: string; label: string; sublabel?: string; color?: string | null };

function filterOptions(options: PickerOption[], query: string): PickerOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      (o.sublabel?.toLowerCase().includes(q) ?? false),
  );
}

export function SearchableSelect(props: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = props.options.find((o) => o.id === props.value);
  const filtered = useMemo(() => filterOptions(props.options, query), [props.options, query]);
  const allowEmpty = props.allowEmpty === true;

  return (
    <div className="studio-picker">
      <span className="studio-picker-label">{props.label}</span>
      <button
        type="button"
        className="studio-picker-trigger"
        disabled={props.disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <>
            {selected.color ? (
              <span className="studio-swatch" style={{ background: selected.color }} aria-hidden />
            ) : null}
            <span>{selected.label}</span>
          </>
        ) : allowEmpty ? (
          props.emptyLabel ?? "None"
        ) : (
          "Choose…"
        )}
      </button>
      {open ? (
        <div className="studio-picker-popover" role="listbox">
          <input
            className="studio-picker-search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className="studio-picker-list">
            {allowEmpty ? (
              <li>
                <button
                  type="button"
                  className={props.value === "" ? "active" : ""}
                  onClick={() => {
                    props.onChange("");
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {props.emptyLabel ?? "None"}
                </button>
              </li>
            ) : null}
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={props.value === o.id ? "active" : ""}
                  onClick={() => {
                    props.onChange(o.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {o.color ? (
                    <span className="studio-swatch" style={{ background: o.color }} aria-hidden />
                  ) : null}
                  <span>{o.label}</span>
                  {o.sublabel ? <small>{o.sublabel}</small> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="studio-picker-empty">No matches</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PersonPicker(props: {
  label: string;
  value: string;
  people: ScenarioPoliticianSection[];
  onChange: (id: string) => void;
  allowEmpty?: boolean;
}) {
  const options: PickerOption[] = props.people.map((p) => ({
    id: p.id,
    label: personDisplay(p),
    sublabel: p.partyId ?? "Independent",
  }));
  return (
    <SearchableSelect
      label={props.label}
      value={props.value}
      options={options}
      onChange={props.onChange}
      allowEmpty={props.allowEmpty === true}
      emptyLabel="No leader"
    />
  );
}

export function PartyPicker(props: {
  label: string;
  value: string;
  parties: { id: string; name: string; abbreviation: string; color?: string | null }[];
  onChange: (id: string) => void;
  allowEmpty?: boolean;
}) {
  const options: PickerOption[] = props.parties.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.abbreviation,
    color: p.color ?? null,
  }));
  return (
    <SearchableSelect
      label={props.label}
      value={props.value}
      options={options}
      onChange={props.onChange}
      allowEmpty={props.allowEmpty === true}
      emptyLabel="Independent"
    />
  );
}

export function ProvincePicker(props: {
  label: string;
  value: string;
  provinces: { id: string; name: string }[];
  onChange: (id: string) => void;
  allowEmpty?: boolean;
}) {
  const options: PickerOption[] = props.provinces.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.id,
  }));
  return (
    <SearchableSelect
      label={props.label}
      value={props.value}
      options={options}
      onChange={props.onChange}
      allowEmpty={props.allowEmpty === true}
    />
  );
}

export function ThresholdSelect(props: {
  label: string;
  fraction: number | undefined;
  onChange: (fraction: number) => void;
}) {
  const preset = thresholdPresetForFraction(props.fraction);
  const customVal = props.fraction ?? 0.5;

  return (
    <label className="studio-field">
      <span>{props.label}</span>
      <select
        value={preset}
        onChange={(e) => {
          const p = e.target.value as ThresholdPresetId;
          props.onChange(fractionForThresholdPreset(p, customVal));
        }}
      >
        {THRESHOLD_PRESETS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {preset === "custom" ? (
        <input
          type="number"
          min={0.01}
          max={1}
          step={0.01}
          value={customVal}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
      ) : null}
    </label>
  );
}
