import { describe, expect, it } from "vitest";
import { classifyDateRangeWithHolidays } from "../src/modules/leave/leave.service";

const noHolidays = new Map<string, string>();

describe("classifyDateRangeWithHolidays", () => {
    it("skips Sunday automatically, per the spec's Friday-to-Monday example", () => {
        // 2024-01-05 = Friday, 2024-01-06 = Saturday, 2024-01-07 = Sunday, 2024-01-08 = Monday.
        const breakdown = classifyDateRangeWithHolidays("2024-01-05", "2024-01-08", noHolidays);
        expect(breakdown.map((d) => d.kind)).toEqual(["leave", "leave", "week_off", "leave"]);
        expect(breakdown.filter((d) => d.kind === "leave")).toHaveLength(3);
    });

    it("skips a government holiday in addition to the weekly off", () => {
        // Fri 01-05, Sat 01-06, Sun 01-07 (week off), Mon 01-08 (holiday), Tue 01-09.
        const holidays = new Map([["2024-01-08", "Makar Sankranti"]]);
        const breakdown = classifyDateRangeWithHolidays("2024-01-05", "2024-01-09", holidays);
        expect(breakdown.map((d) => d.kind)).toEqual(["leave", "leave", "week_off", "holiday", "leave"]);
        expect(breakdown.filter((d) => d.kind === "leave")).toHaveLength(3);
    });

    it("a holiday that falls on a Sunday is reported as a holiday, not a week off", () => {
        // 2024-01-07 is a Sunday.
        const holidays = new Map([["2024-01-07", "Special Sunday Holiday"]]);
        const breakdown = classifyDateRangeWithHolidays("2024-01-07", "2024-01-07", holidays);
        expect(breakdown).toEqual([{ date: "2024-01-07", kind: "holiday", holiday_name: "Special Sunday Holiday" }]);
    });

    it("a single working day is one leave day", () => {
        // 2024-01-05 is a Friday.
        const breakdown = classifyDateRangeWithHolidays("2024-01-05", "2024-01-05", noHolidays);
        expect(breakdown).toEqual([{ date: "2024-01-05", kind: "leave" }]);
    });

    it("a range that is entirely week-off/holiday yields zero leave days", () => {
        // 2024-01-07 (Sun) through 2024-01-07 is just the one Sunday.
        const breakdown = classifyDateRangeWithHolidays("2024-01-07", "2024-01-07", noHolidays);
        expect(breakdown.filter((d) => d.kind === "leave")).toHaveLength(0);
    });
});
