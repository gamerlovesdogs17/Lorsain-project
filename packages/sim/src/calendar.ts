/**
 * Date-only Gregorian calendar. No timezones, no ambient wall clock, no locale parsing.
 * Values are ISO YYYY-MM-DD strings.
 */

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/** 0 = Sunday … 6 = Saturday (ISO date-only, not local timezone). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export type Ymd = { year: number; month: number; day: number };

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const n = DAYS_IN_MONTH[month];
  if (!n) throw new Error(`Invalid month ${month}`);
  return n;
}

export function parseIsoDate(value: string): Ymd {
  const m = ISO.exec(value);
  if (!m) throw new Error(`Invalid ISO date: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) throw new Error(`Invalid ISO date: ${value}`);
  if (day < 1 || day > daysInMonth(year, month)) throw new Error(`Invalid ISO date: ${value}`);
  return { year, month, day };
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function formatIsoDate(year: number, month: number, day: number): IsoDate {
  const y = String(year).padStart(4, "0");
  const mo = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const iso = `${y}-${mo}-${d}`;
  parseIsoDate(iso);
  return iso;
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  parseIsoDate(a);
  parseIsoDate(b);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Integer days since 1970-01-01 (date-only; 1970-01-01 = 0). */
export function toEpochDay(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  let days = 0;
  if (year >= 1970) {
    for (let y = 1970; y < year; y++) days += isLeapYear(y) ? 366 : 365;
  } else {
    for (let y = year; y < 1970; y++) days -= isLeapYear(y) ? 366 : 365;
  }
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  return days + (day - 1);
}

export function fromEpochDay(days: number): IsoDate {
  let remaining = days;
  let year = 1970;
  if (remaining >= 0) {
    while (remaining >= (isLeapYear(year) ? 366 : 365)) {
      remaining -= isLeapYear(year) ? 366 : 365;
      year += 1;
    }
  } else {
    while (remaining < 0) {
      year -= 1;
      remaining += isLeapYear(year) ? 366 : 365;
    }
  }
  let month = 1;
  while (remaining >= daysInMonth(year, month)) {
    remaining -= daysInMonth(year, month);
    month += 1;
  }
  return formatIsoDate(year, month, remaining + 1);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new Error("addDays requires an integer day count");
  return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  if (!Number.isInteger(months)) throw new Error("addMonths requires an integer month count");
  const { year, month, day } = parseIsoDate(date);
  const idx = year * 12 + (month - 1) + months;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  const dim = daysInMonth(y, mo);
  return formatIsoDate(y, mo, Math.min(day, dim));
}

export function addYears(date: IsoDate, years: number): IsoDate {
  if (!Number.isInteger(years)) throw new Error("addYears requires an integer year count");
  const { year, month, day } = parseIsoDate(date);
  const y = year + years;
  const dim = daysInMonth(y, month);
  return formatIsoDate(y, month, Math.min(day, dim));
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return formatIsoDate(year, month, 1);
}

export function startOfNextMonth(date: IsoDate): IsoDate {
  return addMonths(startOfMonth(date), 1);
}

/** Weekday of an ISO date. 1970-01-01 is Thursday (4). Independent of host timezone. */
export function dayOfWeek(date: IsoDate): Weekday {
  return ((((toEpochDay(date) + 4) % 7) + 7) % 7) as Weekday;
}

export function weekdayName(date: IsoDate): WeekdayName {
  return WEEKDAY_NAMES[dayOfWeek(date)]!;
}

export function weekdayFromName(name: string): Weekday {
  const i = WEEKDAY_NAMES.indexOf(name as WeekdayName);
  if (i < 0) throw new Error(`Unknown weekday: ${name}`);
  return i as Weekday;
}

/** n-th weekday of a month (n >= 1). */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday | WeekdayName,
  n: number,
): IsoDate {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid weekday ordinal ${n}`);
  const wd = typeof weekday === "string" ? weekdayFromName(weekday) : weekday;
  const first = formatIsoDate(year, month, 1);
  const firstWd = dayOfWeek(first);
  const delta = (wd - firstWd + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  if (day > daysInMonth(year, month)) {
    throw new Error(`No ${n}-th weekday ${wd} in ${year}-${String(month).padStart(2, "0")}`);
  }
  return formatIsoDate(year, month, day);
}

export type RegularElectionCalendar = {
  intervalYears: number;
  month: number;
  nthWeekday: number;
  weekday: WeekdayName;
  /** A year in which a regular election occurred (anchors the cycle). */
  anchorYear: number;
  assumptionMonth: number;
  assumptionDay: number;
  /** 0 = same year as the election; 1 = following year. */
  assumptionYearOffset: number;
};

export function regularElectionDate(cal: RegularElectionCalendar, year: number): IsoDate {
  if ((year - cal.anchorYear) % cal.intervalYears !== 0) {
    throw new Error(
      `Year ${year} is not on the ${cal.intervalYears}-year cycle from ${cal.anchorYear}`,
    );
  }
  return nthWeekdayOfMonth(year, cal.month, cal.weekday, cal.nthWeekday);
}

export function nextRegularElectionYear(
  cal: RegularElectionCalendar,
  onOrAfterYear: number,
): number {
  const delta =
    (((onOrAfterYear - cal.anchorYear) % cal.intervalYears) + cal.intervalYears) %
    cal.intervalYears;
  return delta === 0 ? onOrAfterYear : onOrAfterYear + (cal.intervalYears - delta);
}

/** Terena regular presidential election: 2nd Saturday in October every 5 years, anchored to 2018. */
export const TERENA_PRESIDENTIAL_CALENDAR: RegularElectionCalendar = {
  intervalYears: 5,
  month: 10,
  nthWeekday: 2,
  weekday: "saturday",
  anchorYear: 2018,
  assumptionMonth: 1,
  assumptionDay: 20,
  assumptionYearOffset: 1,
};

/** Terena regular Assembly election: 2nd Sunday in May every 4 years, anchored to 2026. */
export const TERENA_ASSEMBLY_CALENDAR: RegularElectionCalendar = {
  intervalYears: 4,
  month: 5,
  nthWeekday: 2,
  weekday: "sunday",
  anchorYear: 2026,
  assumptionMonth: 6,
  assumptionDay: 1,
  assumptionYearOffset: 0,
};

export function officeAssumptionDate(electionDate: IsoDate, cal: RegularElectionCalendar): IsoDate {
  const { year } = parseIsoDate(electionDate);
  return formatIsoDate(year + cal.assumptionYearOffset, cal.assumptionMonth, cal.assumptionDay);
}

export function presidentialAssumptionDate(
  electionDate: IsoDate,
  cal: RegularElectionCalendar = TERENA_PRESIDENTIAL_CALENDAR,
): IsoDate {
  return officeAssumptionDate(electionDate, cal);
}

export function assemblyAssumptionDate(
  electionDate: IsoDate,
  cal: RegularElectionCalendar = TERENA_ASSEMBLY_CALENDAR,
): IsoDate {
  return officeAssumptionDate(electionDate, cal);
}
