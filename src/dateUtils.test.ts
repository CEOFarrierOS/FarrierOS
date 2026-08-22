import { describe, expect, it } from "vitest";
import { monthDates, shiftDate, toLocalDateString } from "./dateUtils";

describe("date utilities", () => {
  it("uses local calendar components", () => {
    expect(toLocalDateString(new Date(2026, 7, 21, 23, 30))).toBe("2026-08-21");
  });

  it("shifts across month boundaries", () => {
    expect(shiftDate("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("builds the selected month including leap days", () => {
    expect(monthDates("2028-02-10")).toHaveLength(29);
    expect(monthDates("2028-02-10").at(-1)).toBe("2028-02-29");
  });
});
