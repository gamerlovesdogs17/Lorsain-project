import type { ScenarioDocument } from "@lorsain/scenario";
import {
  compareIsoDate,
  nextRegularElectionYear,
  parseIsoDate,
  regularElectionDate,
  type IsoDate,
  type RegularElectionCalendar,
} from "../calendar.js";
import { assemblyElectionIdForDate } from "../elections/assembly-national.js";
import { presidentialElectionIdForDate } from "../elections/state.js";

const DEFAULT_PRESIDENTIAL_INTERVAL_YEARS = 5;
const DEFAULT_ASSEMBLY_INTERVAL_YEARS = 4;

export type MiniWorldElectionSchedule = {
  presidentialCalendar: RegularElectionCalendar;
  assemblyCalendar: RegularElectionCalendar;
  nextPresidentialElectionDate: IsoDate;
  nextAssemblyElectionDate: IsoDate;
  nextPresidentialElectionId: string;
  nextAssemblyElectionId: string;
};

function nextRegularElectionOnOrAfter(cal: RegularElectionCalendar, onOrAfter: IsoDate): IsoDate {
  const startYear = parseIsoDate(onOrAfter).year;
  let year = nextRegularElectionYear(cal, startYear);
  let date = regularElectionDate(cal, year);
  if (compareIsoDate(date, onOrAfter) < 0) {
    year += cal.intervalYears;
    date = regularElectionDate(cal, year);
  }
  return date;
}

/**
 * Derives regular-election calendars and the first upcoming cycle from scenario metadata.
 * Intervals come from `contentSections.elections`; anchor year and month come from `startDate`.
 */
export function resolveMiniWorldElectionSchedule(doc: ScenarioDocument): MiniWorldElectionSchedule {
  const start = doc.startDate as IsoDate;
  const { year: anchorYear, month: startMonth } = parseIsoDate(start);
  const preset = doc.contentSections.elections;
  const presInterval = preset?.presidentialIntervalYears ?? DEFAULT_PRESIDENTIAL_INTERVAL_YEARS;
  const asmInterval = preset?.assemblyIntervalYears ?? DEFAULT_ASSEMBLY_INTERVAL_YEARS;

  const presidentialCalendar: RegularElectionCalendar = {
    intervalYears: presInterval,
    month: startMonth,
    nthWeekday: 2,
    weekday: "saturday",
    anchorYear,
    assumptionMonth: 1,
    assumptionDay: 20,
    assumptionYearOffset: 1,
  };

  const assemblyMonth = startMonth === 12 ? 5 : ((startMonth + 4) % 12) + 1;
  const assemblyCalendar: RegularElectionCalendar = {
    intervalYears: asmInterval,
    month: assemblyMonth,
    nthWeekday: 2,
    weekday: "sunday",
    anchorYear,
    assumptionMonth: 6,
    assumptionDay: 1,
    assumptionYearOffset: 0,
  };

  const nextPresidentialElectionDate = nextRegularElectionOnOrAfter(presidentialCalendar, start);
  const nextAssemblyElectionDate = nextRegularElectionOnOrAfter(assemblyCalendar, start);

  return {
    presidentialCalendar,
    assemblyCalendar,
    nextPresidentialElectionDate,
    nextAssemblyElectionDate,
    nextPresidentialElectionId: presidentialElectionIdForDate(nextPresidentialElectionDate),
    nextAssemblyElectionId: assemblyElectionIdForDate(nextAssemblyElectionDate),
  };
}
