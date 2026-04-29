export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // Remove trailing numbers and store IDs (e.g. "BILLA 0123" → "billa")
    .replace(/\s+\d+.*$/, "")
    // Remove # followed by digits (e.g. "MCDONALDS#4521" → "mcdonalds")
    .replace(/#\d+.*$/, "")
    // Remove common Austrian city suffixes
    .replace(/\s+(wien|vienna|graz|salzburg|innsbruck|linz|klagenfurt|villach)$/i, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}
