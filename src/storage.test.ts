import { describe, expect, it } from "vitest";
import { sampleData } from "./sampleData";
import { createBackup, parseBackup } from "./storage";

describe("FarrierOS backups", () => {
  it("round-trips application data", () => {
    const restored = parseBackup(createBackup(sampleData));
    expect(restored.business.businessName).toBe(sampleData.business.businessName);
    expect(restored.horses[0].name).toBe("Fluffy");
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow("not a valid FarrierOS backup");
  });
});
