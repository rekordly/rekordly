/** Reads both older labelled addresses and ordinary comma-separated addresses. */
export function parseStoreAddress(value?: string | null) {
  const result = { address: "", city: "", state: "", country: "", zip_code: "" };
  const street: string[] = [];
  for (const part of (value || "").split(/\r?\n|(?=\b(?:Country|City|State|Zip Code)\s*:)/i)) {
    const match = part.trim().match(/^(Country|City|State|Zip Code)\s*:\s*(.*)$/i);
    if (!match) { if (part.trim()) street.push(part.trim()); continue; }
    const key = match[1].toLowerCase() === "zip code" ? "zip_code" : match[1].toLowerCase() as "city" | "state" | "country";
    result[key] = match[2].trim();
  }
  result.address = street.join(", ");
  return result;
}

export function displayStoreAddress(value?: string | null) {
  const parsed = parseStoreAddress(value);
  const seen = new Set<string>();
  return [parsed.address, parsed.city, parsed.state, parsed.country, parsed.zip_code]
    .flatMap((part) => part.split(","))
    .map((part) => part.trim()).filter((part) => {
      const key = part.toLocaleLowerCase().replace(/\s+/g, " ");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(", ");
}
