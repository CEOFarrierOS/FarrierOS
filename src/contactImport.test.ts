import { describe, expect, it } from "vitest";
import { normalizePhone, parseVCards } from "./contactImport";

describe("bulk contact import", () => {
  it("parses multiple vCards", () => {
    const contacts = parseVCards(`BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nTEL;TYPE=CELL:(208) 555-0100\nADR;TYPE=HOME:;;12 Main St;Boise;ID;83702;USA\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\nN:Smith;John;;;\nTEL:208-555-0200\nEND:VCARD`);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toEqual({ name: "Jane Doe", phone: "(208) 555-0100", address: "12 Main St, Boise, ID, 83702, USA" });
    expect(contacts[1].name).toBe("John Smith");
  });

  it("normalizes US phone numbers for duplicate detection", () => {
    expect(normalizePhone("+1 (208) 555-0100")).toBe("2085550100");
  });
});
