import { describe, expect, it } from "vitest";
import { sampleData } from "./sampleData";
import { completeJob } from "./jobCompletion";
import { AppData, Foot, ShoeSetup } from "./types";

function fixture() {
  return structuredClone(sampleData) as AppData;
}

function drafts(data: AppData) {
  const horse = data.horses[0];
  return (["LF", "RF", "LH", "RH"] as Foot[]).reduce(
    (result, foot) => {
      const record = data.footRecords.find((item) => item.id === horse.footRecordIds[foot])!;
      result[foot] = { ...data.shoeSetups.find((item) => item.id === record.currentSetupId)! };
      return result;
    },
    {} as Record<Foot, ShoeSetup>,
  );
}

function ids() {
  let next = 0;
  return (prefix: string) => `${prefix}-test-${next++}`;
}

describe("job completion", () => {
  it("updates the selected appointment and verified setup", () => {
    const data = fixture();
    const result = completeJob({
      data,
      horseId: "horse-fluffy",
      appointmentId: "appt-today-fluffy",
      serviceDate: "2026-08-21",
      serviceType: "full_set",
      setupDrafts: drafts(data),
      writtenNotes: "Done",
      cycleChange: "RF changed",
      verified: true,
      now: "2026-08-21T18:00:00.000Z",
      makeId: ids(),
    });
    expect(result.data.appointments.find((item) => item.id === "appt-today-fluffy")?.status).toBe("complete");
    expect(result.data.horses[0].verifiedSetupId).toBe(result.serviceId);
    expect(result.data.horses[0].nextDueDate).toBe("2026-10-02");
  });

  it("records unverified work without replacing the trusted setup", () => {
    const data = fixture();
    const oldVerified = data.horses[0].verifiedSetupId;
    const oldCurrent = data.footRecords[0].currentSetupId;
    const result = completeJob({
      data,
      horseId: "horse-fluffy",
      appointmentId: null,
      serviceDate: "2026-08-21",
      serviceType: "trim",
      setupDrafts: drafts(data),
      writtenNotes: "Review later",
      cycleChange: "",
      verified: false,
      makeId: ids(),
    });
    expect(result.data.horses[0].verifiedSetupId).toBe(oldVerified);
    expect(result.data.footRecords[0].currentSetupId).toBe(oldCurrent);
    expect(result.data.serviceRecords[0].verifiedSetup).toBe(false);
    expect(result.data.footRecords[0].historySetupIds[0]).not.toBe(oldCurrent);
  });
});
