import { describe, expect, it } from "vitest";
import { formatMonthlyPrice, fullAccessPlan, hasFullAccess } from "./membership";

describe("FarrierOS Full Access membership", () => {
  it("defines the launch plan at $7.99 per month", () => {
    expect(fullAccessPlan.priceMonthlyCents).toBe(799);
    expect(formatMonthlyPrice(fullAccessPlan)).toBe("$7.99");
  });

  it("unlocks all services for development, trial, and active members", () => {
    expect(hasFullAccess(fullAccessPlan)).toBe(true);
    expect(hasFullAccess({ ...fullAccessPlan, status: "trialing" })).toBe(true);
    expect(hasFullAccess({ ...fullAccessPlan, status: "active" })).toBe(true);
  });

  it("keeps a member working through an unexpired grace period", () => {
    expect(
      hasFullAccess(
        { ...fullAccessPlan, status: "grace_period", currentPeriodEnd: "2026-09-01T00:00:00.000Z" },
        new Date("2026-08-21T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("locks expired, cancelled, and past-due memberships", () => {
    expect(hasFullAccess({ ...fullAccessPlan, status: "expired" })).toBe(false);
    expect(hasFullAccess({ ...fullAccessPlan, status: "cancelled" })).toBe(false);
    expect(hasFullAccess({ ...fullAccessPlan, status: "past_due" })).toBe(false);
  });
});
