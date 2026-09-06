import { pushHistory } from "../scheduler.js";
import type { SimEvent, SimState } from "../types.js";
import { applyBudgetPassageFiscalBoost, recomputeFiscalFromCurrentLaw } from "./fiscal.js";
import { ensureGoverningRuntime } from "./state.js";

/**
 * Annual budget cycle layered on executive budgets + Assembly motions.
 * Prefer reading existing executiveRuntime.budgets rather than inventing parallel books.
 */
export function processBudgetCycle(state: SimState, commandId: string): SimEvent[] {
  const runtime = ensureGoverningRuntime(state);
  const events: SimEvent[] = [];
  const year = Number(state.currentDate.slice(0, 4));
  const month = Number(state.currentDate.slice(5, 7));
  const cycle = runtime.budgetCycle;

  if (cycle.fiscalYear !== year) {
    cycle.fiscalYear = year;
    cycle.stage = "idle";
    cycle.budgetId = null;
    cycle.failureConsequence = null;
  }

  const budgets = Object.values(state.executiveRuntime.budgets).filter(
    (b) => b.fiscalYear === year,
  );
  const proposed = budgets.find((b) => b.status === "proposed");
  const approved = budgets.find((b) => b.status === "approved");
  const continuing = budgets.find((b) => b.status === "continuing");

  if (month === 1 && !proposed && !approved) {
    cycle.stage = "forecast";
    recomputeFiscalFromCurrentLaw(state);
  }

  if (proposed) {
    cycle.stage = proposed.assemblyDecision === "pending" ? "assembly" : "draft";
    cycle.budgetId = proposed.id;
  }

  if (approved && cycle.stage !== "passed") {
    cycle.stage = "passed";
    cycle.budgetId = approved.id;
    cycle.failureConsequence = null;
    recomputeFiscalFromCurrentLaw(state);
    applyBudgetPassageFiscalBoost(state, true);
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNING_BUDGET_PASSED",
        importance: 0.7,
        visibility: "public",
        actorIds: [],
        entityIds: [approved.id],
        payload: {
          budgetId: approved.id,
          fiscalYear: year,
          revenue: runtime.fiscal.revenue,
          expenditure: runtime.fiscal.expenditure,
          balance: runtime.fiscal.balance,
          debt: runtime.fiscal.debt,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  // Failure / continuity: executive may convert proposed → continuing; also detect rejected.
  const rejected = budgets.find((b) => b.assemblyDecision === "rejected");
  if (rejected && cycle.stage !== "failed" && cycle.stage !== "continuing_resolution") {
    cycle.stage = "failed";
    cycle.budgetId = rejected.id;
    cycle.failureConsequence = "political_crisis";
    applyBudgetPassageFiscalBoost(state, false);
    runtime.historyNotes.push(`Budget failure FY${year}: political crisis`);
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNING_BUDGET_FAILED",
        importance: 0.8,
        visibility: "public",
        actorIds: [],
        entityIds: [rejected.id],
        payload: {
          budgetId: rejected.id,
          fiscalYear: year,
          consequence: "political_crisis",
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  } else if (continuing && cycle.stage !== "continuing_resolution" && cycle.stage !== "passed") {
    cycle.stage = "continuing_resolution";
    cycle.budgetId = continuing.id;
    cycle.failureConsequence = "continuing_resolution";
    applyBudgetPassageFiscalBoost(state, false);
    runtime.historyNotes.push(`Continuing resolution FY${year}`);
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "GOVERNING_BUDGET_CONTINUING",
        importance: 0.65,
        visibility: "public",
        actorIds: [],
        entityIds: [continuing.id],
        payload: {
          budgetId: continuing.id,
          fiscalYear: year,
          consequence: "continuing_resolution",
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  // Late-year: still no approved budget → escalate to continuing resolution consequence.
  if (
    month >= 3 &&
    !approved &&
    proposed &&
    proposed.assemblyDecision === "pending" &&
    cycle.stage === "assembly"
  ) {
    // Wait for executive continuity path; mark pending failure risk in metadata.
    runtime.metadata.budgetOverdueYear = year;
  }

  cycle.lastProcessedDate = state.currentDate;
  return events;
}

/** Test helper: mark a year's budget as failed with defined consequence. */
export function forceBudgetFailure(
  state: SimState,
  consequence: "continuing_resolution" | "political_crisis",
  commandId: string,
): SimEvent[] {
  const runtime = ensureGoverningRuntime(state);
  const year = Number(state.currentDate.slice(0, 4));
  runtime.budgetCycle.fiscalYear = year;
  runtime.budgetCycle.stage =
    consequence === "continuing_resolution" ? "continuing_resolution" : "failed";
  runtime.budgetCycle.failureConsequence = consequence;
  applyBudgetPassageFiscalBoost(state, false);
  runtime.historyNotes.push(
    consequence === "continuing_resolution"
      ? `Continuing resolution FY${year}`
      : `Budget failure FY${year}: political crisis`,
  );
  return [
    pushHistory(state, {
      date: state.currentDate,
      type:
        consequence === "continuing_resolution"
          ? "GOVERNING_BUDGET_CONTINUING"
          : "GOVERNING_BUDGET_FAILED",
      importance: 0.75,
      visibility: "public",
      actorIds: [],
      entityIds: [],
      payload: { fiscalYear: year, consequence },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}
