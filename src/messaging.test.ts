import { describe, expect, it } from "vitest";
import { buildOnMyWayMessage, createSmsHref } from "./messaging";

describe("simple SMS links", () => {
  it("builds an appointment-specific On My Way message", () => {
    expect(buildOnMyWayMessage("Rocky Mountain Farrier", "Willow Creek Ranch", "09:00")).toBe(
      "Rocky Mountain Farrier: I'm on my way to Willow Creek Ranch for our 09:00 appointment.",
    );
  });

  it("creates a prefilled SMS link with a normalized destination", () => {
    expect(createSmsHref("(555) 014-7788", "On my way!")).toBe("sms:5550147788?body=On%20my%20way!");
  });

  it("refuses to create a link without a phone number", () => {
    expect(createSmsHref("", "On my way!")).toBeNull();
  });
});
