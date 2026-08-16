import { compareIsoDate, isIsoDate, type IsoDate } from "../calendar.js";
import type { SimState } from "../types.js";

/**
 * Newly written runtime cognitive/social history must fall inside
 * [scenarioStartDate, currentDate]. Queries may still use other dates.
 */
export function agentMutationDateError(
  state: Pick<SimState, "scenarioStartDate" | "currentDate">,
  asOfDate: IsoDate,
  label = "asOfDate",
): string | null {
  if (!isIsoDate(asOfDate)) return `${label} must be an ISO date`;
  if (compareIsoDate(asOfDate, state.scenarioStartDate) < 0) {
    return `${label} ${asOfDate} is before scenarioStartDate ${state.scenarioStartDate}`;
  }
  if (compareIsoDate(asOfDate, state.currentDate) > 0) {
    return `${label} ${asOfDate} is after currentDate ${state.currentDate}`;
  }
  return null;
}

export function notBeforeExistingDateError(
  asOfDate: IsoDate,
  existingDate: IsoDate,
  label: string,
): string | null {
  if (compareIsoDate(asOfDate, existingDate) < 0) {
    return `${label}: ${asOfDate} precedes ${existingDate}`;
  }
  return null;
}
