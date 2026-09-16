import {
  AMENDMENT_PROCESS_OPTIONS,
  CABINET_FORMATION_OPTIONS,
  CITIZENSHIP_GUARD_OPTIONS,
  CIVIL_LIBERTY_OPTIONS,
  DEFENSE_CONTROL_OPTIONS,
  EMERGENCY_POWER_OPTIONS,
  ENTRENCHMENT_OPTIONS,
  EXECUTIVE_AUTHORITY_OPTIONS,
  JUDICIAL_REVIEW_OPTIONS,
  LOCAL_GOVERNMENT_OPTIONS,
  PARTY_SYSTEM_OPTIONS,
  PRESS_FREEDOM_OPTIONS,
  PRESIDENTIAL_ELECTION_OPTIONS,
  ASSEMBLY_ELECTION_OPTIONS,
  PROVINCIAL_COMPETENCE_OPTIONS,
  REPUBLIC_FORM_OPTIONS,
  TREATY_APPROVAL_OPTIONS,
  type ScenarioDocument,
  type ScenarioPartySection,
} from "@lorsain/scenario";
import { PartyPicker } from "./pickers.js";

type Patch = (u: (d: ScenarioDocument) => ScenarioDocument) => void;

function OptionSelect(props: {
  label: string;
  value: string | undefined;
  options: readonly { id: string; label: string; shortDescription?: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="studio-field">
      <span>{props.label}</span>
      <select
        value={props.value ?? props.options[0]?.id ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.id} value={o.id} title={o.shortDescription}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function mergeConstitution(
  doc: ScenarioDocument,
  patch: Record<string, unknown>,
): ScenarioDocument {
  const constitution = { ...(doc.contentSections.constitution ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (constitution as Record<string, unknown>)[k];
    else (constitution as Record<string, unknown>)[k] = v;
  }
  return { ...doc, contentSections: { ...doc.contentSections, constitution } };
}

export function ConstitutionOrderFields(props: {
  doc: ScenarioDocument;
  patch: Patch;
  parties: ScenarioPartySection[];
}) {
  const c = props.doc.contentSections.constitution ?? {};
  const set = (patch: Record<string, unknown>) => props.patch((d) => mergeConstitution(d, patch));

  return (
    <div className="studio-order-fields">
      <h3>Constitutional order</h3>
      <OptionSelect
        label="Party system"
        value={c.partySystem}
        options={PARTY_SYSTEM_OPTIONS}
        onChange={(partySystem) => set({ partySystem })}
      />
      {c.partySystem === "single_legal_party" ? (
        <PartyPicker
          label="Sole legal Party"
          value={c.soleLegalPartyId ?? ""}
          parties={props.parties}
          onChange={(soleLegalPartyId) => set({ soleLegalPartyId: soleLegalPartyId || null })}
        />
      ) : null}
      <OptionSelect
        label="Presidential election"
        value={c.presidentialElection}
        options={PRESIDENTIAL_ELECTION_OPTIONS}
        onChange={(presidentialElection) => set({ presidentialElection })}
      />
      <OptionSelect
        label="Assembly election"
        value={c.assemblyElection}
        options={ASSEMBLY_ELECTION_OPTIONS}
        onChange={(assemblyElection) => set({ assemblyElection })}
      />
      <OptionSelect
        label="Judicial review"
        value={c.judicialReview}
        options={JUDICIAL_REVIEW_OPTIONS}
        onChange={(judicialReview) => set({ judicialReview })}
      />
      <OptionSelect
        label="Provincial competence"
        value={c.provincialCompetence}
        options={PROVINCIAL_COMPETENCE_OPTIONS}
        onChange={(provincialCompetence) => set({ provincialCompetence })}
      />
      <OptionSelect
        label="Emergency powers"
        value={c.emergencyPowers}
        options={EMERGENCY_POWER_OPTIONS}
        onChange={(emergencyPowers) => set({ emergencyPowers })}
      />
      <OptionSelect
        label="Treaty approval"
        value={c.treatyApproval}
        options={TREATY_APPROVAL_OPTIONS}
        onChange={(treatyApproval) => set({ treatyApproval })}
      />
      <OptionSelect
        label="Amendment process"
        value={c.amendmentProcess}
        options={AMENDMENT_PROCESS_OPTIONS}
        onChange={(amendmentProcess) => set({ amendmentProcess })}
      />
      <OptionSelect
        label="Entrenchment"
        value={c.entrenchment}
        options={ENTRENCHMENT_OPTIONS}
        onChange={(entrenchment) => set({ entrenchment })}
      />
      <OptionSelect
        label="Civil liberties"
        value={c.civilLiberties}
        options={CIVIL_LIBERTY_OPTIONS}
        onChange={(civilLiberties) => set({ civilLiberties })}
      />
      <OptionSelect
        label="Executive authority"
        value={c.executiveAuthority}
        options={EXECUTIVE_AUTHORITY_OPTIONS}
        onChange={(executiveAuthority) => set({ executiveAuthority })}
      />
      <OptionSelect
        label="Cabinet formation"
        value={c.cabinetFormation}
        options={CABINET_FORMATION_OPTIONS}
        onChange={(cabinetFormation) => set({ cabinetFormation })}
      />
      <OptionSelect
        label="Republic form"
        value={c.republicForm}
        options={REPUBLIC_FORM_OPTIONS}
        onChange={(republicForm) => set({ republicForm })}
      />
      <OptionSelect
        label="Citizenship"
        value={c.citizenshipGuard}
        options={CITIZENSHIP_GUARD_OPTIONS}
        onChange={(citizenshipGuard) => set({ citizenshipGuard })}
      />
      <OptionSelect
        label="Press freedom"
        value={c.pressFreedom}
        options={PRESS_FREEDOM_OPTIONS}
        onChange={(pressFreedom) => set({ pressFreedom })}
      />
      <OptionSelect
        label="Local government"
        value={c.localGovernment}
        options={LOCAL_GOVERNMENT_OPTIONS}
        onChange={(localGovernment) => set({ localGovernment })}
      />
      <OptionSelect
        label="Defense control"
        value={c.defenseControl}
        options={DEFENSE_CONTROL_OPTIONS}
        onChange={(defenseControl) => set({ defenseControl })}
      />
    </div>
  );
}
