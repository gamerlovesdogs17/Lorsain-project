/**
 * Lightweight developer-facing simulation integrity audit.
 * Used by long-run tests and Debug tooling — not a player UI feature.
 */
import { ensureHistory15Runtime } from "../history15/state.js";
import type { KernelWorld, SimState } from "../types.js";
import { auditAssemblyNominationIntegrity } from "../parties/nominationIntegrity.js";

export type IntegrityFinding = {
  code: string;
  message: string;
  severity: "error" | "warn";
};

export function auditSimulationIntegrity(_world: KernelWorld, state: SimState): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  for (const term of Object.values(state.officeTerms)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const pol = state.politicians[term.holderId];
    if (!pol) {
      findings.push({
        code: "MISSING_OFFICEHOLDER",
        message: `${term.id} holds ${term.officeId} but politician missing`,
        severity: "error",
      });
      continue;
    }
    if (!pol.alive || pol.retired) {
      findings.push({
        code: "DEAD_OR_RETIRED_OFFICEHOLDER",
        message: `${term.holderId} holds ${term.officeId} while dead/retired`,
        severity: "error",
      });
    }
  }

  for (const [partyId, party] of Object.entries(state.partyStates)) {
    if (party.leaderId && !state.politicians[party.leaderId]?.alive) {
      findings.push({
        code: "INVALID_PARTY_LEADER",
        message: `${partyId} leader ${party.leaderId} is missing or dead`,
        severity: "error",
      });
    }
  }

  const caucus = state.caucusRuntime;
  if (caucus) {
    for (const [fid, row] of Object.entries(caucus.caucuses ?? {})) {
      if (row.dissolved) continue;
      if (!row.partyId) {
        findings.push({
          code: "ORPHAN_CAUCUS",
          message: `Caucus ${fid} has no partyId`,
          severity: "warn",
        });
      }
      if (
        typeof row.partyMemberSupport === "number" &&
        (row.partyMemberSupport < 0 || row.partyMemberSupport > 1.05)
      ) {
        findings.push({
          code: "INVALID_CAUCUS_SUPPORT",
          message: `Caucus ${fid} partyMemberSupport=${row.partyMemberSupport}`,
          severity: "warn",
        });
      }
    }
  }

  for (const issue of auditAssemblyNominationIntegrity(state, _world)) {
    findings.push({
      code: `NOMINATION_${issue.code}`.toUpperCase(),
      message: issue.message,
      severity:
        issue.code === "dead_on_ballot" || issue.code === "duplicate_candidate" ? "error" : "warn",
    });
  }

  const runtime = ensureHistory15Runtime(state);
  for (const link of runtime.precedentLinks) {
    if (link.fromDecisionId === link.toDecisionId) {
      findings.push({
        code: "PRECEDENT_SELF",
        message: `${link.fromDecisionId} cites itself`,
        severity: "error",
      });
      continue;
    }
    const prior = state.constitutionalRuntime?.precedents?.[link.toDecisionId];
    const from =
      state.constitutionalRuntime?.courtDecisions?.[link.fromDecisionId] ??
      state.constitutionalRuntime?.precedents?.[link.fromDecisionId];
    if (prior && from && prior.decisionDate > (from.decisionDate ?? state.currentDate)) {
      findings.push({
        code: "PRECEDENT_FUTURE",
        message: `${link.fromDecisionId} cites future ${link.toDecisionId}`,
        severity: "error",
      });
    }
  }

  for (const [countryId, row] of Object.entries(state.foreignAffairsRuntime?.countries ?? {})) {
    if (row.leaderId && typeof row.leaderId === "string" && row.leaderId.length === 0) {
      findings.push({
        code: "INVALID_FOREIGN_LEADER",
        message: `Country ${countryId} has empty leaderId`,
        severity: "warn",
      });
    }
  }

  return findings;
}

export function integrityErrorCount(findings: IntegrityFinding[]): number {
  return findings.filter((f) => f.severity === "error").length;
}
