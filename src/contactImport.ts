export interface ContactImportDraft {
  name: string;
  phone: string;
  address: string;
}

function unfoldVCard(raw: string) {
  return raw.replace(/\r?\n[ \t]/g, "");
}

function valueFor(lines: string[], key: string) {
  const upperKey = key.toUpperCase();
  const line = lines.find((item) => item.toUpperCase().startsWith(`${upperKey}:`) || item.toUpperCase().startsWith(`${upperKey};`));
  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}

function decodeText(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
}

export function parseVCards(raw: string): ContactImportDraft[] {
  return unfoldVCard(raw)
    .split(/BEGIN:VCARD/i)
    .slice(1)
    .map((block) => block.split(/END:VCARD/i)[0].split(/\r?\n/).filter(Boolean))
    .map((lines) => {
      const fn = decodeText(valueFor(lines, "FN"));
      const structuredName = valueFor(lines, "N").split(";").map(decodeText);
      const name = fn || [structuredName[1], structuredName[0]].filter(Boolean).join(" ");
      const phone = decodeText(valueFor(lines, "TEL"));
      const addressParts = valueFor(lines, "ADR").split(";").map(decodeText).filter(Boolean);
      return { name: name || "Imported Client", phone, address: addressParts.join(", ") };
    })
    .filter((contact) => contact.name || contact.phone || contact.address);
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}
