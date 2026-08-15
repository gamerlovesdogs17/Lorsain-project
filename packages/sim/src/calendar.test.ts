import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  assemblyAssumptionDate,
  compareIsoDate,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  isLeapYear,
  nthWeekdayOfMonth,
  presidentialAssumptionDate,
  regularElectionDate,
  startOfNextMonth,
  TERENA_ASSEMBLY_CALENDAR,
  TERENA_PRESIDENTIAL_CALENDAR,
  weekdayName,
} from "./calendar.js";

describe("calendar", () => {
  it("identifies leap years and month lengths", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2029)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2029, 2)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(31);
    expect(daysInMonth(2028, 4)).toBe(30);
  });

  it("adds months across year boundaries and clamps day", () => {
    expect(addMonths("2028-01-01", 1)).toBe("2028-02-01");
    expect(addMonths("2028-12-01", 1)).toBe("2029-01-01");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(startOfNextMonth("2028-10-14")).toBe("2028-11-01");
  });

  it("adds days across leap day and compares", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(daysBetween("2028-01-01", "2028-02-01")).toBe(31);
    expect(compareIsoDate("2028-10-14", "2028-11-01")).toBe(-1);
  });

  it("computes weekdays without the host timezone", () => {
    expect(weekdayName("1970-01-01")).toBe("thursday");
    expect(dayOfWeek("2028-10-14")).toBe(6);
    expect(nthWeekdayOfMonth(2028, 10, "saturday", 2)).toBe("2028-10-14");
    expect(nthWeekdayOfMonth(2026, 5, "sunday", 2)).toBe("2026-05-10");
    expect(nthWeekdayOfMonth(2030, 5, "sunday", 2)).toBe("2030-05-12");
  });

  it("locks Terena regular presidential election dates", () => {
    expect(regularElectionDate(TERENA_PRESIDENTIAL_CALENDAR, 2013)).toBe("2013-10-12");
    expect(regularElectionDate(TERENA_PRESIDENTIAL_CALENDAR, 2018)).toBe("2018-10-13");
    expect(regularElectionDate(TERENA_PRESIDENTIAL_CALENDAR, 2023)).toBe("2023-10-14");
    expect(regularElectionDate(TERENA_PRESIDENTIAL_CALENDAR, 2028)).toBe("2028-10-14");
    expect(presidentialAssumptionDate("2013-10-12")).toBe("2014-01-20");
    expect(presidentialAssumptionDate("2018-10-13")).toBe("2019-01-20");
    expect(presidentialAssumptionDate("2023-10-14")).toBe("2024-01-20");
    expect(presidentialAssumptionDate("2028-10-14")).toBe("2029-01-20");
  });

  it("locks Terena regular Assembly election dates", () => {
    expect(regularElectionDate(TERENA_ASSEMBLY_CALENDAR, 2026)).toBe("2026-05-10");
    expect(regularElectionDate(TERENA_ASSEMBLY_CALENDAR, 2030)).toBe("2030-05-12");
    expect(assemblyAssumptionDate("2026-05-10")).toBe("2026-06-01");
    expect(assemblyAssumptionDate("2030-05-12")).toBe("2030-06-01");
  });
});
